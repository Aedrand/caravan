import type { RouteResult } from "@caravan/shared";
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
  Pencil,
  Plus,
  Route as RouteIcon,
  Settings,
  Trash2,
  Users,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { lazy, type RefObject, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { deriveDays, todayIso } from "@/components/itinerary/format";
import type { ItineraryBoardHandle } from "@/components/itinerary/itinerary-board";
import { FocusedDayProvider, useFocusedDay } from "@/components/map/focused-day";
import { MapSelectionProvider } from "@/components/map/selection";
import { RoutingProvider, useDayRoutes } from "@/components/routing/day-routes";
import { FeedPanel } from "@/components/trips/feed-panel";
import { formatTripDates } from "@/components/trips/format";
import { PresenceStrip } from "@/components/trips/presence-strip";
import { ThemeToggle } from "@/components/trips/theme-toggle";
import { TripSettingsDialog } from "@/components/trips/trip-settings-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { BookingsSection } from "@/components/workspace/bookings-section";
import { GroupSection } from "@/components/workspace/group-section";
import { IdeasSection } from "@/components/workspace/ideas-section";
import { IndexRail } from "@/components/workspace/index-rail";
import { ItinerarySection } from "@/components/workspace/itinerary-section";
import { MoneySection } from "@/components/workspace/money-section";
import { OverviewSection } from "@/components/workspace/overview-section";
import { MapResizeHandle } from "@/components/workspace/resize-handle";
import { useResizableMapWidth } from "@/components/workspace/use-resizable-map-width";
import { useScrollSpy } from "@/components/workspace/use-scroll-spy";
import { authClient } from "@/lib/auth-client";
import { useMoney } from "@/lib/expenses/use-money";
import {
  useConnectionStatus,
  useFeed,
  useIdeaLists,
  useMarkSeen,
  useUnreadCount,
} from "@/lib/sync";
import type { TripSnapshot } from "@/lib/sync/shared";
import { cn } from "@/lib/utils";

// Lazy: maplibre-gl is heavy (~300 kB gzip). Keep it off the route's initial
// chunk; it streams in with the ambient map track (desktop) and the mobile Map
// overlay.
const MapPanel = lazy(() =>
  import("@/components/map/map-panel").then((m) => ({ default: m.MapPanel })),
);

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
 * The trip-page workspace shell (Trip Workspace V2.7). Replaces the old
 * five-view tab frame with ONE continuously-scrolling canvas: every section
 * (Overview → Bookings → Itinerary → Ideas → Money → Group) is always mounted in
 * document order, a left index rail tracks the visible section via scrollspy and
 * jumps to any of them, and the ambient map reveals itself (CSS width, never an
 * unmount — gotcha #1) while the Itinerary is in view. The three map providers
 * are lifted to wrap the whole frame so all sections + the map share one
 * context. Mobile keeps a bottom-tab nav; the activity feed lives in a
 * bell-triggered drawer. Full-bleed under the app's global header.
 */
export function TripWorkspace(props: TripWorkspaceProps) {
  const { snapshot, archived, isOwner, pending, onToggleArchive, canEdit } = props;
  const [feedOpen, setFeedOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const boardRef = useRef<ItineraryBoardHandle | null>(null);
  const onOpenFeed = () => setFeedOpen(true);
  const onOpenSettings = () => setSettingsOpen(true);

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background">
      <TopBar {...props} onOpenFeed={onOpenFeed} onOpenSettings={onOpenSettings} />

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

      {/* The three map providers wrap the WHOLE frame so every section + the
          ambient map share one context instance (the RoutingProvider's renderless
          day subscribers ride along as children of the workspace root). */}
      <FocusedDayProvider>
        <MapSelectionProvider>
          <RoutingProvider snapshot={snapshot}>
            <WorkspaceBody
              snapshot={snapshot}
              canEdit={canEdit}
              archived={archived}
              boardRef={boardRef}
              onOpenFeed={onOpenFeed}
            />
          </RoutingProvider>
        </MapSelectionProvider>
      </FocusedDayProvider>

      <FeedDrawer
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        tripId={snapshot.trip.id}
        members={snapshot.members}
      />

      <TripSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        snapshot={snapshot}
        canEdit={canEdit}
      />
    </div>
  );
}

/**
 * The scrolling workspace body — lives INSIDE the three map providers so it can
 * (a) run scrollspy on the canvas, (b) push the active day into the shared
 * focused-day signal, and (c) host the ambient map + mobile map overlay, which
 * read the shared routes/selection. Owns the canvas ref, scrollspy, and the
 * mobile-map-open state.
 */
function WorkspaceBody({
  snapshot,
  canEdit,
  archived,
  boardRef,
  onOpenFeed,
}: {
  snapshot: TripSnapshot;
  canEdit: boolean;
  archived: boolean;
  boardRef: RefObject<ItineraryBoardHandle | null>;
  onOpenFeed: () => void;
}) {
  const { trip, activities } = snapshot;
  const canvasRef = useRef<HTMLElement>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  const days = useMemo(
    () => deriveDays(trip.startDate, trip.endDate, activities),
    [trip.startDate, trip.endDate, activities],
  );
  // A day is "empty" (dimmed in the rail) when nothing is dated on it.
  const emptyDays = useMemo(() => {
    const dated = new Set(activities.filter((a) => a.date !== null).map((a) => a.date as string));
    return new Set(days.filter((iso) => !dated.has(iso)));
  }, [days, activities]);
  const today = todayIso();
  const todayInTrip = days.includes(today);
  const bookingCount = useMemo(
    () => activities.filter((a) => a.type === "flight" || a.type === "lodging").length,
    [activities],
  );
  // Idea lists (position-sorted) — the same source + ordering IdeasPanel renders
  // from, so the rail's jump targets and the DOM stay in lockstep.
  const { ideaLists } = useIdeaLists();

  // Anchor ids in document order — sections, with the day anchors interleaved
  // inside the Itinerary block and the idea-list anchors inside Ideas (gotcha:
  // must match the rendered DOM order exactly or scroll-spy misbehaves).
  const anchorIds = useMemo(
    () => [
      "overview",
      "bookings",
      "itinerary",
      ...days.map((iso) => `day-${iso}`),
      "ideas",
      ...ideaLists.map((l) => `list-${l.id}`),
      "money",
      "group",
    ],
    [days, ideaLists],
  );
  const { activeId, scrollTo } = useScrollSpy({ containerRef: canvasRef, anchorIds });

  // Push the active day into the shared focused-day signal so the ambient map
  // reframes as the reader scrolls the itinerary (scrollspy itself stays pure).
  const { setFocusedDay } = useFocusedDay();
  useEffect(() => {
    if (activeId?.startsWith("day-")) setFocusedDay(activeId.slice(4));
  }, [activeId, setFocusedDay]);

  // The ambient map is "released" (collapsed) outside the place-anchored
  // sections — the Itinerary (and its days) and Ideas (and its lists) keep it
  // open; browsing Ideas doesn't move the focused day, so the frame just holds.
  const showMap =
    activeId === "itinerary" ||
    (activeId?.startsWith("day-") ?? false) ||
    activeId === "ideas" ||
    (activeId?.startsWith("list-") ?? false);

  // User-resizable canvas/map partition (desktop) — persisted to localStorage.
  const { width: mapWidth, resizing: mapResizing, nudge, dragHandlers } = useResizableMapWidth();

  // Shared money/feed reads (React Query dedupes with the panels' own calls).
  const moneyQuery = useMoney(trip.id);
  const feedQuery = useFeed(trip.id);

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <IndexRail
          days={days}
          emptyDays={emptyDays}
          ideaLists={ideaLists}
          activeId={activeId}
          bookingCount={bookingCount}
          moneyData={moneyQuery.data}
          scrollTo={scrollTo}
          today={todayInTrip ? today : null}
          startDate={trip.startDate}
          canEdit={canEdit}
        />

        {/* The ONE scroll container — scrollspy's IntersectionObserver root. */}
        <main ref={canvasRef} className="relative min-w-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "mx-auto flex w-full flex-col gap-12 px-5 pt-6 pb-24 sm:gap-16 sm:px-7 lg:pb-8",
              // Map-released (full-width) sections go wider per the mockup `.col.wide`.
              showMap ? "max-w-[680px]" : "max-w-[900px]",
            )}
          >
            <OverviewSection
              snapshot={snapshot}
              canEdit={canEdit}
              moneyQuery={moneyQuery}
              feedQuery={feedQuery}
              scrollTo={scrollTo}
              onOpenFeed={onOpenFeed}
            />
            <BookingsSection snapshot={snapshot} canEdit={canEdit} />
            <ItinerarySection snapshot={snapshot} canEdit={canEdit} boardRef={boardRef} />
            <IdeasSection snapshot={snapshot} canEdit={canEdit} />
            <MoneySection snapshot={snapshot} canEdit={canEdit} />
            <GroupSection />
          </div>
        </main>

        {showMap && <MapResizeHandle width={mapWidth} nudge={nudge} dragHandlers={dragHandlers} />}
        <AmbientMapTrack
          snapshot={snapshot}
          showMap={showMap}
          width={mapWidth}
          resizing={mapResizing}
        />
      </div>

      {/* Mobile add FAB — the sole add path at narrow widths (the desktop
          "Add activity" button lives in the Itinerary heading). */}
      {canEdit && !archived && (
        <button
          type="button"
          aria-label="Add activity"
          onClick={() => boardRef.current?.addActivity()}
          className="absolute right-4 bottom-20 z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-overlay transition-transform hover:scale-105 active:scale-95 lg:hidden"
        >
          <Plus aria-hidden className="size-7" />
        </button>
      )}

      <BottomNav activeId={activeId} scrollTo={scrollTo} onOpenMap={() => setMobileMapOpen(true)} />

      {mobileMapOpen && (
        <MobileMapOverlay snapshot={snapshot} onClose={() => setMobileMapOpen(false)} />
      )}
    </>
  );
}

/**
 * The desktop ambient map column (gotcha #1). Always mounted: when "released" it
 * collapses the OUTER width to 0 and clips a fixed-width inner, so MapLibre never
 * unmounts (no cold-start re-init) — only the reveal animates. The inner width is
 * now user-set (MapResizeHandle → `useResizableMapWidth`); mid-drag the width
 * transition suspends so the map tracks the pointer 1:1 (MapLibre's own
 * ResizeObserver absorbs the live resize). `hidden lg:block`, since mobile uses
 * the full-screen overlay instead.
 */
function AmbientMapTrack({
  snapshot,
  showMap,
  width,
  resizing,
}: {
  snapshot: TripSnapshot;
  showMap: boolean;
  width: number;
  resizing: boolean;
}) {
  return (
    <aside
      aria-label="Map"
      style={{ width: showMap ? width : 0 }}
      className={cn(
        "hidden shrink-0 overflow-hidden lg:block",
        !resizing && "transition-[width] duration-200 motion-reduce:transition-none",
        showMap && "border-l",
      )}
    >
      <div style={{ width }} className="h-full py-[18px] pr-[18px] pl-1.5">
        <Suspense fallback={null}>
          <AmbientMapPanel snapshot={snapshot} />
        </Suspense>
      </div>
    </aside>
  );
}

/**
 * The ambient map itself: reads the shared per-day routes (computed once by
 * RoutingProvider) and hands the map only the resolved results to draw. Shared
 * by the desktop track and the mobile overlay.
 */
function AmbientMapPanel({ snapshot }: { snapshot: TripSnapshot }) {
  const dayRoutes = useDayRoutes();
  const routeResults = useMemo(() => {
    const map = new Map<string, RouteResult>();
    for (const [iso, state] of dayRoutes) {
      if (state.result) map.set(iso, state.result);
    }
    return map;
  }, [dayRoutes]);
  return <MapPanel snapshot={snapshot} fill dayRoutes={routeResults} />;
}

/** The mobile full-screen map (the BottomNav "Map" tab). Lives inside the map
 * providers, so it draws the same routes/selection as the desktop track. */
function MobileMapOverlay({ snapshot, onClose }: { snapshot: TripSnapshot; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-3 lg:hidden">
      <div className="mb-2 flex justify-end">
        <Button variant="outline" size="icon-sm" onClick={onClose} aria-label="Close map">
          <X aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <AmbientMapPanel snapshot={snapshot} />
        </Suspense>
      </div>
    </div>
  );
}

/* ---------- bottom tab nav (mobile only — desktop uses IndexRail) ----------
 * `lg:hidden` (display:none at desktop) keeps these buttons OUT of the a11y tree
 * at ≥lg, so they don't duplicate the index rail's section buttons for role
 * queries during the (Desktop Chrome) e2e run. Each tab scrolls the canvas to
 * its section; the Map tab opens the full-screen overlay. */
type BottomTab = {
  id: string;
  label: string;
  icon: typeof RouteIcon;
  section?: string;
  map?: boolean;
};

const BOTTOM_NAV: BottomTab[] = [
  { id: "itinerary", label: "Itinerary", icon: RouteIcon, section: "itinerary" },
  { id: "map", label: "Map", icon: MapIcon, map: true },
  { id: "ideas", label: "Ideas", icon: Vote, section: "ideas" },
  { id: "money", label: "Money", icon: Wallet, section: "money" },
  { id: "group", label: "Group", icon: Users, section: "group" },
];

function activeIdToTab(activeId: string | null): string | null {
  if (!activeId) return null;
  if (activeId === "itinerary" || activeId.startsWith("day-")) return "itinerary";
  if (activeId === "ideas" || activeId === "money" || activeId === "group") return activeId;
  return null; // overview / bookings have no bottom tab
}

function BottomNav({
  activeId,
  scrollTo,
  onOpenMap,
}: {
  activeId: string | null;
  scrollTo: (id: string) => void;
  onOpenMap: () => void;
}) {
  const activeTab = activeIdToTab(activeId);
  return (
    <nav aria-label="Trip sections" className="flex shrink-0 border-t bg-muted lg:hidden">
      {BOTTOM_NAV.map((item) => {
        const active = item.id === activeTab;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.map) onOpenMap();
              else if (item.section) scrollTo(item.section);
            }}
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
  onOpenSettings,
}: TripWorkspaceProps & { onOpenFeed: () => void; onOpenSettings: () => void }) {
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
            {/* Always visible — viewers get a read-only settings rendering. */}
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings aria-hidden />
              Settings
            </DropdownMenuItem>
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
        {/* Theme toggle: the desktop rail no longer carries it, so surface it
            here at every width (V2.7 drops the old `lg:hidden`). */}
        <ThemeToggle className="size-8" />
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

// Tabbable elements inside the open drawer (visible, not disabled). Used to
// keep Tab/Shift+Tab cycling within the dialog and to seed initial focus.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

  // Focus management (E.4): this drawer is a custom (non-Radix) dialog, so it
  // traps focus by hand. On open, remember whatever was focused (the Bell
  // trigger), move focus into the drawer, and cycle Tab/Shift+Tab within it;
  // on close (the body unmounts) restore focus to that trigger. Escape +
  // backdrop close still live above, in FeedDrawer.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Declared (not control-flow-narrowed) type so the closure below keeps it
    // non-null. `dialogRef.current` is set by the time this layout-after effect
    // runs, since the dialog div renders unconditionally.
    const dialog: HTMLDivElement | null = dialogRef.current;
    if (!dialog) return;
    const node: HTMLDivElement = dialog;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus inside: the first tabbable control (the close button), or the
    // dialog container itself (tabIndex=-1) as a fallback for an empty feed.
    const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? node).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (!firstEl || !lastEl) {
        // Nothing tabbable (empty feed): keep focus pinned on the container.
        event.preventDefault();
        node.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === firstEl || !node.contains(active)) {
          event.preventDefault();
          lastEl.focus();
        }
      } else if (active === lastEl || !node.contains(active)) {
        event.preventDefault();
        firstEl.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger when the drawer unmounts (close).
      previouslyFocused?.focus?.();
    };
  }, []);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="What changed"
        tabIndex={-1}
        // Full-screen on mobile; the capped `max-w-sm` slide-over returns at lg.
        className="absolute inset-y-0 right-0 flex w-full max-w-none flex-col bg-muted shadow-overlay outline-none lg:max-w-sm"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <Bell aria-hidden className="size-5 text-[var(--accent-strong)]" />
          <h2 className="font-display font-bold text-lg">What changed</h2>
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
