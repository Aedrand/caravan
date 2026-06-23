import { Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  CalendarDays,
  Copy,
  Ellipsis,
  LogOut,
  Map as MapIcon,
  MapPin,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
  Users,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { lazy, type ReactNode, type RefObject, Suspense, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { IdeasPanel } from "@/components/decisions/ideas-panel";
import { PollsPanel } from "@/components/decisions/polls-panel";
import { ExpensesPanel } from "@/components/expenses/expenses-panel";
import { ItineraryBoard, type ItineraryBoardHandle } from "@/components/itinerary/itinerary-board";
import { FocusedDayProvider } from "@/components/map/focused-day";
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
import { authClient } from "@/lib/auth-client";
import { useConnectionStatus, useFeed, useMarkSeen, useUnreadCount } from "@/lib/sync";
import type { TripSnapshot } from "@/lib/sync/shared";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

// Lazy: maplibre-gl is heavy (~300 kB gzip). Keep it off the route's initial
// chunk; it streams in with the (default) Plan view's ambient split, or the
// mobile Map tab.
const MapPanel = lazy(() =>
  import("@/components/map/map-panel").then((m) => ({ default: m.MapPanel })),
);

// `map` is a mobile-only view: on desktop the map stays a split inside Plan, so
// it never appears in the desktop rail (and a resize to desktop falls back to
// Plan — see TripWorkspace).
type View = "plan" | "map" | "decide" | "money" | "group";

type NavItem = { id: View; label: string; icon: typeof RouteIcon };

const NAV: NavItem[] = [
  { id: "plan", label: "Plan", icon: RouteIcon },
  { id: "decide", label: "Decide", icon: Vote },
  { id: "money", label: "Money", icon: Wallet },
  { id: "group", label: "Group", icon: Users },
];

// Mobile bottom tabs add a dedicated Map tab between Plan and Decide.
const MOBILE_NAV: NavItem[] = [
  { id: "plan", label: "Plan", icon: RouteIcon },
  { id: "map", label: "Map", icon: MapIcon },
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
  const { snapshot, archived, isOwner, pending, onToggleArchive, canEdit } = props;
  const [view, setView] = useState<View>("plan");
  const [mapOpen, setMapOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const boardRef = useRef<ItineraryBoardHandle | null>(null);

  // `map` is mobile-only. If the viewport grows to desktop while it's active,
  // fall back to Plan (whose ambient split surfaces the same map) so the rail —
  // which has no Map tab — never shows a selection it can't represent.
  useEffect(() => {
    if (isDesktop && view === "map") setView("plan");
  }, [isDesktop, view]);

  // Render Plan when desktop coerces the map view away, before the effect runs.
  const activeView: View = isDesktop && view === "map" ? "plan" : view;

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background">
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
        <Rail view={activeView} onView={setView} />

        <main className="min-w-0 flex-1">
          {activeView === "plan" ? (
            <PlanView
              snapshot={snapshot}
              canEdit={canEdit}
              mapOpen={mapOpen}
              onToggleMap={() => setMapOpen((v) => !v)}
              onOpenDecide={() => setView("decide")}
              boardRef={boardRef}
            />
          ) : activeView === "map" ? (
            // Mobile-only full-area map (the Map bottom tab).
            <MapSelectionProvider>
              <div className="h-full p-3">
                <Suspense fallback={null}>
                  <MapPanel snapshot={snapshot} fill />
                </Suspense>
              </div>
            </MapSelectionProvider>
          ) : (
            <ViewScroll>
              {activeView === "decide" && (
                <div className="flex flex-col gap-8">
                  <IdeasPanel snapshot={snapshot} canEdit={canEdit} />
                  <PollsPanel snapshot={snapshot} canEdit={canEdit} />
                </div>
              )}
              {activeView === "money" && (
                <ExpensesPanel
                  tripId={snapshot.trip.id}
                  members={snapshot.members}
                  currency={snapshot.trip.currency}
                  canEdit={canEdit}
                />
              )}
              {activeView === "group" && <MembersPanel />}
            </ViewScroll>
          )}
        </main>
      </div>

      {/* Mobile add FAB — wired for Plan (add activity); Decide/Money keep their
          in-panel "Add" buttons. Sits above the bottom tab bar, thumb-reachable. */}
      {activeView === "plan" && canEdit && !archived && (
        <button
          type="button"
          aria-label="Add activity"
          onClick={() => boardRef.current?.addActivity()}
          className="absolute right-4 bottom-20 z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-overlay transition-transform hover:scale-105 active:scale-95 lg:hidden"
        >
          <Plus aria-hidden className="size-7" />
        </button>
      )}

      <BottomNav view={activeView} onView={setView} />

      <FeedDrawer
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        tripId={snapshot.trip.id}
        members={snapshot.members}
      />
    </div>
  );
}

/* ---------- left rail (desktop only — mobile uses BottomNav) ---------- */
function Rail({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <nav
      aria-label="Trip sections"
      className="hidden w-20 shrink-0 flex-col items-center gap-1.5 border-r bg-muted px-2.5 py-3.5 lg:flex"
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

/* ---------- bottom tab nav (mobile only — desktop uses Rail) ----------
 * `lg:hidden` (display:none at desktop) keeps these buttons OUT of the a11y
 * tree at ≥lg, so they don't duplicate the rail's Plan/Decide/Money/Group for
 * role queries during the (Desktop Chrome) e2e run. Map is mobile-only here. */
function BottomNav({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <nav aria-label="Trip sections" className="flex shrink-0 border-t bg-muted lg:hidden">
      {MOBILE_NAV.map((item) => {
        const active = view === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onView(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mt-px flex flex-1 flex-col items-center gap-1 border-t-[3px] px-1 pt-2 pb-1.5 transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-5" />
            <span className="font-body font-bold text-[10px] uppercase tracking-wide">
              {item.label}
            </span>
          </button>
        );
      })}
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
  const unread = useUnreadCount(trip.id);
  return (
    <header className="flex shrink-0 items-center gap-2 border-b bg-muted px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
      <Button asChild variant="outline" size="icon-sm" className="shrink-0">
        <Link to="/" aria-label="Back to your trips">
          <ArrowLeft aria-hidden />
        </Link>
      </Button>
      <BrandMark variant="mark" size={24} className="hidden shrink-0 md:inline-flex" />

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

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <PresenceStrip colors={presenceColors} />
        <ConnectionIndicator />
        <div className="relative shrink-0">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onOpenFeed}
            aria-label="What changed"
            title="What changed"
          >
            <Bell aria-hidden />
          </Button>
          {unread > 0 && (
            <span
              aria-hidden
              className="-top-1 -right-1 pointer-events-none absolute flex h-4 min-w-4 select-none items-center justify-center rounded-pill bg-primary px-1 font-bold text-[10px] text-primary-foreground leading-none shadow-control"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
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
        {/* Theme toggle lives in the desktop rail; surface it here on mobile
            (where the rail is hidden) so it stays reachable. */}
        <ThemeToggle className="size-8 lg:hidden" />
        <AccountMenu />
      </div>
    </header>
  );
}

/* ---------- account (folded into the consolidated top bar) ---------- */
function AccountMenu() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (isPending || !session) return <div className="size-8 shrink-0" aria-hidden />;

  const name = session.user.name || session.user.email;
  const initial = (name[0] ?? "?").toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      await navigate({ to: "/login" });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-sm">
          <p className="font-medium">{name}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => void handleSignOut()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- Plan: itinerary + ambient map ---------- */
function PlanView({
  snapshot,
  canEdit,
  mapOpen,
  onToggleMap,
  onOpenDecide,
  boardRef,
}: {
  snapshot: TripSnapshot;
  canEdit: boolean;
  mapOpen: boolean;
  onToggleMap: () => void;
  onOpenDecide: () => void;
  boardRef: RefObject<ItineraryBoardHandle | null>;
}) {
  return (
    // FocusedDayProvider wraps both panes so the map can follow the itinerary's
    // focused day across the lazy/Suspense boundary (the mobile Map tab has no
    // itinerary, so it renders MapPanel without this provider — fit-all on boot).
    <FocusedDayProvider>
      <MapSelectionProvider>
        <div className="flex h-full min-h-0">
          {/* Extra bottom padding on mobile clears the add FAB; the map split
              (and its padding) is desktop-only, so this only affects narrow screens. */}
          <div className="min-w-0 flex-[1.35] overflow-y-auto px-5 py-5 pb-24 lg:pb-5">
            <ItineraryBoard
              snapshot={snapshot}
              canEdit={canEdit}
              onOpenDecide={onOpenDecide}
              handleRef={boardRef}
            />
          </div>

          {mapOpen ? (
            <div className="relative hidden w-[38%] min-w-80 max-w-[34rem] shrink-0 border-l p-3 lg:block">
              <Suspense fallback={null}>
                <MapPanel snapshot={snapshot} fill />
              </Suspense>
              <button
                type="button"
                onClick={onToggleMap}
                aria-label="Hide map"
                title="Hide map"
                className="absolute top-5 left-5 z-10 flex size-8 items-center justify-center rounded-md border bg-card text-foreground shadow-control transition-colors hover:bg-muted"
              >
                <PanelRightClose aria-hidden className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleMap}
              aria-label="Show map"
              title="Show map"
              className="hidden w-9 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
            >
              <PanelRightOpen aria-hidden className="size-5" />
            </button>
          )}
        </div>
      </MapSelectionProvider>
    </FocusedDayProvider>
  );
}

function ViewScroll({ children }: { children: ReactNode }) {
  return (
    // pb clears the mobile bottom tab bar; trimmed back to py-6 at desktop.
    <div className="h-full overflow-y-auto px-5 pt-6 pb-20 lg:pb-6">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}

/* ---------- feed drawer (Stage 4 refines: unread badge, caught-up styling) ---------- */
function FeedDrawer(props: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  members: TripSnapshot["members"];
}) {
  const { open, onClose } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Mount the body only while open so it remounts fresh each time (re-freezing
  // its catch-up boundary); keep all feed hooks below this null guard.
  if (!open) return null;
  return <FeedDrawerBody {...props} />;
}

function FeedDrawerBody({
  onClose,
  tripId,
  members,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  members: TripSnapshot["members"];
}) {
  const feedQuery = useFeed(tripId);
  const markSeen = useMarkSeen(tripId);
  const unread = useUnreadCount(tripId);
  // Opening auto-marks seen (so `unread` collapses to 0), so hold the count
  // captured on the first render for the header pill.
  const openUnreadRef = useRef<number | null>(null);
  if (openUnreadRef.current === null) openUnreadRef.current = unread;
  const openUnread = openUnreadRef.current;

  // "Mark all as read" — advance the cursor to the newest event, then dismiss.
  function markAllRead() {
    const latest = feedQuery.data?.events[0]?.version ?? 0;
    if (latest > 0) markSeen(latest);
    onClose();
  }

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
        // Full-screen on mobile; the capped `max-w-sm` slide-over returns at lg.
        className="absolute inset-y-0 right-0 flex w-full max-w-none flex-col bg-muted shadow-overlay lg:max-w-sm"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <Bell aria-hidden className="size-5 text-[var(--accent-strong)]" />
          <span className="font-display font-bold text-lg">What changed</span>
          {openUnread > 0 && (
            <span className="rounded-pill bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs">
              {openUnread > 9 ? "9+" : openUnread} new
            </span>
          )}
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
          <FeedPanel tripId={tripId} members={members} />
        </div>
        <div className="shrink-0 border-t p-3">
          <Button variant="outline" className="w-full" onClick={markAllRead}>
            Mark all as read
          </Button>
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
