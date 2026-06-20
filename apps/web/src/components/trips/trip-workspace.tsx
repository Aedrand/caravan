import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  CalendarDays,
  Copy,
  Ellipsis,
  MapPin,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Route as RouteIcon,
  Trash2,
  Users,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { PollsPanel } from "@/components/decisions/polls-panel";
import { ExpensesPanel } from "@/components/expenses/expenses-panel";
import { ItineraryBoard } from "@/components/itinerary/itinerary-board";
import { MapSelectionProvider } from "@/components/map/selection";
import { FeedPanel } from "@/components/trips/feed-panel";
import { formatTripDates } from "@/components/trips/format";
import { MembersPanel } from "@/components/trips/members-panel";
import { PresenceStrip } from "@/components/trips/presence-strip";
import { ThemeToggle } from "@/components/trips/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useConnectionStatus } from "@/lib/sync";
import type { TripSnapshot } from "@/lib/sync/shared";
import { cn } from "@/lib/utils";

// Lazy: maplibre-gl is heavy (~300 kB gzip). Keep it off the route's initial
// chunk; it streams in with the (default) Plan view.
const MapPanel = lazy(() =>
  import("@/components/map/map-panel").then((m) => ({ default: m.MapPanel })),
);

type View = "plan" | "decide" | "money" | "group";

const NAV: { id: View; label: string; icon: typeof RouteIcon }[] = [
  { id: "plan", label: "Plan", icon: RouteIcon },
  { id: "decide", label: "Decide", icon: Vote },
  { id: "money", label: "Money", icon: Wallet },
  { id: "group", label: "Group", icon: Users },
];

export interface TripWorkspaceProps {
  snapshot: TripSnapshot;
  canEdit: boolean;
  isOwner: boolean;
  archived: boolean;
  pending: boolean;
  presenceColors: Map<string, string>;
  onRename: (name: string) => void;
  onToggleArchive: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
  onRequestDelete: () => void;
}

/**
 * The trip-page workspace shell (C.4). Replaces the old one-long-column stack
 * with a four-view frame: a left rail switches Plan / Decide / Money / Group,
 * Plan keeps the itinerary alongside an ambient (collapsible) map, and the
 * activity feed lives in a bell-triggered drawer. Full-bleed under the app's
 * global header — `__root` stays untouched (the breakout escapes its centered
 * `max-w-6xl` main and cancels its vertical padding).
 */
export function TripWorkspace(props: TripWorkspaceProps) {
  const { snapshot, archived, isOwner, pending, onToggleArchive } = props;
  const [view, setView] = useState<View>("plan");
  const [mapOpen, setMapOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(false);

  return (
    <div className="-my-10 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] flex h-[calc(100dvh-3.5rem)] w-screen flex-col overflow-hidden bg-background">
      <TopBar {...props} onOpenFeed={() => setFeedOpen(true)} />

      {archived && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-amber-600/30 border-b bg-amber-500/10 px-4 py-2 text-amber-900 text-sm">
          <span>This trip is archived — read-only.</span>
          {isOwner && (
            <Button size="sm" variant="outline" disabled={pending} onClick={onToggleArchive}>
              <ArchiveRestore aria-hidden />
              Unarchive
            </Button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Rail view={view} onView={setView} />

        <main className="min-w-0 flex-1">
          {view === "plan" ? (
            <PlanView
              snapshot={snapshot}
              canEdit={props.canEdit}
              mapOpen={mapOpen}
              onToggleMap={() => setMapOpen((v) => !v)}
            />
          ) : (
            <ViewScroll>
              {view === "decide" && <PollsPanel snapshot={snapshot} canEdit={props.canEdit} />}
              {view === "money" && (
                <ExpensesPanel
                  tripId={snapshot.trip.id}
                  members={snapshot.members}
                  currency={snapshot.trip.currency}
                  canEdit={props.canEdit}
                />
              )}
              {view === "group" && <MembersPanel />}
            </ViewScroll>
          )}
        </main>
      </div>

      <FeedDrawer
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        tripId={snapshot.trip.id}
        members={snapshot.members}
      />
    </div>
  );
}

/* ---------- left rail ---------- */
function Rail({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <nav
      aria-label="Trip sections"
      className="flex w-20 shrink-0 flex-col items-center gap-1.5 border-r bg-muted px-2.5 py-3.5"
    >
      {NAV.map((item) => {
        const active = view === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onView(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-card border-2 border-transparent px-1 py-2.5 transition-colors",
              active
                ? "border-border bg-card text-foreground shadow-control"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-5" />
            <span className="font-body font-bold text-[11px] uppercase tracking-wide">
              {item.label}
            </span>
          </button>
        );
      })}
      <ThemeToggle className="mt-auto" />
    </nav>
  );
}

/* ---------- top bar ---------- */
function TopBar({
  snapshot,
  canEdit,
  isOwner,
  archived,
  pending,
  presenceColors,
  onRename,
  onToggleArchive,
  onDuplicate,
  duplicating,
  onRequestDelete,
  onOpenFeed,
}: TripWorkspaceProps & { onOpenFeed: () => void }) {
  const { trip } = snapshot;
  return (
    <header className="flex shrink-0 items-center gap-3 border-b bg-muted px-4 py-2.5">
      <Button asChild variant="outline" size="icon-sm" className="shrink-0">
        <Link to="/" aria-label="Back to your trips">
          <ArrowLeft aria-hidden />
        </Link>
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TripNameEditor name={trip.name} canEdit={canEdit} pending={pending} onCommit={onRename} />
        <span className="hidden shrink-0 items-center gap-1.5 rounded-pill border bg-card px-3 py-1 font-medium text-sm shadow-control sm:flex">
          <CalendarDays aria-hidden className="size-4 text-[var(--accent-strong)]" />
          {formatTripDates(trip.startDate, trip.endDate)}
        </span>
        {trip.destination && (
          <span className="hidden items-center gap-1.5 text-muted-foreground text-sm lg:flex">
            <MapPin aria-hidden className="size-4 shrink-0" />
            {trip.destination}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <PresenceStrip colors={presenceColors} />
        <ConnectionIndicator />
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onOpenFeed}
          aria-label="What changed"
          title="What changed"
        >
          <Bell aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Trip actions">
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={duplicating} onSelect={onDuplicate}>
              <Copy aria-hidden />
              {duplicating ? "Duplicating…" : "Duplicate"}
            </DropdownMenuItem>
            {isOwner && (
              <>
                <DropdownMenuItem disabled={pending} onSelect={onToggleArchive}>
                  {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {archived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onRequestDelete}>
                  <Trash2 aria-hidden />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/* ---------- Plan: itinerary + ambient map ---------- */
function PlanView({
  snapshot,
  canEdit,
  mapOpen,
  onToggleMap,
}: {
  snapshot: TripSnapshot;
  canEdit: boolean;
  mapOpen: boolean;
  onToggleMap: () => void;
}) {
  return (
    <MapSelectionProvider>
      <div className="flex h-full min-h-0">
        <div className="min-w-0 flex-[1.35] overflow-y-auto px-5 py-5">
          <ItineraryBoard snapshot={snapshot} canEdit={canEdit} />
        </div>

        {mapOpen ? (
          <div className="hidden w-[38%] min-w-80 max-w-[34rem] shrink-0 flex-col border-l lg:flex">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="flex items-center gap-2 font-display font-bold">
                <MapPin aria-hidden className="size-4 text-[var(--accent-strong)]" />
                Map
              </span>
              <Button variant="ghost" size="sm" onClick={onToggleMap} aria-label="Hide map">
                <PanelRightClose aria-hidden />
                Hide
              </Button>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <Suspense fallback={null}>
                <MapPanel snapshot={snapshot} fill />
              </Suspense>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleMap}
            aria-label="Show map"
            className="hidden w-12 shrink-0 flex-col items-center gap-1.5 border-l px-1 py-4 text-muted-foreground transition-colors hover:text-foreground lg:flex"
          >
            <PanelRightOpen aria-hidden className="size-5" />
            <span className="font-body font-bold text-[11px] uppercase tracking-wide">Map</span>
          </button>
        )}
      </div>
    </MapSelectionProvider>
  );
}

function ViewScroll({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}

/* ---------- feed drawer (Stage 4 refines: unread badge, caught-up styling) ---------- */
function FeedDrawer({
  open,
  onClose,
  tripId,
  members,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  members: TripSnapshot["members"];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close feed"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/30"
      />
      <div
        role="dialog"
        aria-label="What changed"
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-muted shadow-overlay"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <Bell aria-hidden className="size-5 text-[var(--accent-strong)]" />
          <span className="font-display font-bold text-lg">What changed</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close feed"
            className="ml-auto"
          >
            <X aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <FeedPanel tripId={tripId} members={members} embedded />
        </div>
      </div>
    </div>
  );
}

/* ---------- inline rename (moved from the route) ---------- */
function TripNameEditor({
  name,
  canEdit,
  pending,
  onCommit,
}: {
  name: string;
  canEdit: boolean;
  pending: boolean;
  onCommit: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter commits and then blur fires as the input unmounts — settle exactly once.
  const doneRef = useRef(false);

  function begin() {
    if (!canEdit) return;
    setDraft(name);
    doneRef.current = false;
    setEditing(true);
  }

  function finish(save: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    const trimmed = draft.trim();
    if (save && trimmed && trimmed !== name && trimmed.length <= 120) onCommit(trimmed);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        maxLength={120}
        aria-label="Trip name"
        className="h-9 max-w-md font-semibold text-lg"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(true);
          else if (event.key === "Escape") finish(false);
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <h1 className="min-w-0 truncate font-display font-bold text-xl tracking-tight">
        {canEdit ? (
          <button
            type="button"
            title="Rename trip"
            onClick={begin}
            className="max-w-full truncate rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {name}
          </button>
        ) : (
          name
        )}
      </h1>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rename trip"
          className="shrink-0 text-muted-foreground"
          disabled={pending}
          onClick={begin}
        >
          <Pencil aria-hidden />
        </Button>
      )}
    </div>
  );
}

const STATUS_META = {
  open: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Live" },
  connecting: { dot: "bg-amber-500", text: "text-amber-700", label: "Connecting…" },
  closed: { dot: "bg-red-500", text: "text-red-700", label: "Offline" },
} as const;

function ConnectionIndicator() {
  const status = useConnectionStatus();
  const meta = STATUS_META[status];
  return (
    <span className={cn("hidden items-center gap-1.5 font-medium text-xs sm:flex", meta.text)}>
      <span aria-hidden className={cn("size-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
