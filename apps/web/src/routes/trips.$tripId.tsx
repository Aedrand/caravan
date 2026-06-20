import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  Copy,
  Ellipsis,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { ItineraryBoard } from "@/components/itinerary/itinerary-board";
import { MapSelectionProvider } from "@/components/map/selection";
import { DeleteTripDialog } from "@/components/trips/delete-trip-dialog";
import { FeedPanel } from "@/components/trips/feed-panel";
import { formatTripDates } from "@/components/trips/format";
import { MembersPanel } from "@/components/trips/members-panel";
import { PresenceStrip } from "@/components/trips/presence-strip";
import { useDeleteTrip, useDuplicateTrip } from "@/components/trips/use-trip-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { fetchSession } from "@/lib/auth-client";
import { personColors } from "@/lib/person-colors";
import {
  TripSyncProvider,
  useConnectionStatus,
  useMyMember,
  useTripMutation,
  useTripSnapshot,
} from "@/lib/sync";
import type { TripSnapshot } from "@/lib/sync/shared";
import { cn } from "@/lib/utils";

// Lazy: maplibre-gl is heavy (~300 kB gzip). Keep it off the trip route's
// initial paint; the map streams in once the rest of the trip has rendered.
const MapPanel = lazy(() =>
  import("@/components/map/map-panel").then((m) => ({ default: m.MapPanel })),
);

export const Route = createFileRoute("/trips/$tripId")({
  beforeLoad: async () => {
    // Trip pages are members-only; guests start at the door.
    if (!(await fetchSession())) throw redirect({ to: "/login" });
  },
  component: TripPage,
});

function TripPage() {
  const { tripId } = Route.useParams();
  return (
    <TripSyncProvider tripId={tripId}>
      <TripView />
    </TripSyncProvider>
  );
}

function TripView() {
  const snapshotQuery = useTripSnapshot();

  if (snapshotQuery.isPending) return <TripSkeleton />;

  if (snapshotQuery.isError) {
    const error = snapshotQuery.error;
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return <TripNotFound />;
    }
    return (
      <TripError
        message={error instanceof ApiError ? error.message : "Couldn't load this trip."}
        onRetry={() => void snapshotQuery.refetch()}
      />
    );
  }

  return <TripContent snapshot={snapshotQuery.data} />;
}

function TripContent({ snapshot }: { snapshot: TripSnapshot }) {
  const navigate = useNavigate();
  const me = useMyMember();
  const { mutateAsync, isPending } = useTripMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { trip } = snapshot;
  const archived = trip.archivedAt !== null;
  const isOwner = me?.role === "owner";
  const canEdit = !archived && (me?.role === "owner" || me?.role === "editor");

  const duplicate = useDuplicateTrip(trip.id);
  const deleteTrip = useDeleteTrip(trip.id, {
    onDeleted: async () => {
      await navigate({ to: "/" });
    },
  });

  const activeMembers = snapshot.members.filter((member) => member.status === "active");
  const presenceColors = personColors([...activeMembers].sort((a, b) => a.joinedAt - b.joinedAt));

  // Failures roll back via the sync lib's snapshot invalidation — no local handling needed.
  const commitName = (name: string) => void mutateAsync("trip.update", { name }).catch(() => {});
  const toggleArchive = () =>
    void mutateAsync(archived ? "trip.unarchive" : "trip.archive", {}).catch(() => {});

  const deleteError = deleteTrip.error
    ? deleteTrip.error instanceof ApiError
      ? deleteTrip.error.message
      : "Couldn't delete the trip. Please try again."
    : null;

  return (
    <section className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon-sm" className="mt-1 text-muted-foreground">
            <Link to="/" aria-label="Back to your trips">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <TripNameEditor
              name={trip.name}
              canEdit={canEdit}
              pending={isPending}
              onCommit={commitName}
            />
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {trip.destination && (
                <span className="flex items-center gap-1.5">
                  <MapPin aria-hidden className="size-4 shrink-0" />
                  {trip.destination}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CalendarDays aria-hidden className="size-4 shrink-0" />
                {formatTripDates(trip.startDate, trip.endDate)}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 pt-1">
            <PresenceStrip colors={presenceColors} />
            <ConnectionIndicator />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Trip actions"
                  className="text-muted-foreground"
                >
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={duplicate.isPending}
                  onSelect={() => duplicate.mutate()}
                >
                  <Copy aria-hidden />
                  {duplicate.isPending ? "Duplicating…" : "Duplicate"}
                </DropdownMenuItem>
                {isOwner && (
                  <>
                    <DropdownMenuItem disabled={isPending} onSelect={toggleArchive}>
                      {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                      {archived ? "Unarchive" : "Archive"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                      <Trash2 aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {archived && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-600/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
            <span>This trip is archived — read-only.</span>
            {isOwner && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={toggleArchive}>
                <ArchiveRestore aria-hidden />
                Unarchive
              </Button>
            )}
          </div>
        )}
      </header>

      <MapSelectionProvider>
        <ItineraryBoard snapshot={snapshot} canEdit={canEdit} />

        <Suspense fallback={null}>
          <MapPanel snapshot={snapshot} />
        </Suspense>
      </MapSelectionProvider>

      <FeedPanel tripId={trip.id} members={snapshot.members} />

      <MembersPanel />

      <DeleteTripDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tripName={trip.name}
        pending={deleteTrip.isPending}
        errorMessage={deleteError}
        onConfirm={() => deleteTrip.mutate()}
      />
    </section>
  );
}

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
        className="h-10 max-w-md text-lg font-semibold"
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
    <div className="flex min-w-0 items-center gap-1.5">
      <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
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
    <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.text)}>
      <span aria-hidden className={cn("size-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function TripNotFound() {
  return (
    <section className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">Trip not found</CardTitle>
          <CardDescription>
            It may have been deleted, or you may no longer have access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft aria-hidden />
              Back to your trips
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function TripError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">Something went sideways</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function TripSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading trip" className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="size-8 animate-pulse rounded-md bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-8 w-64 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-48 max-w-full animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-40 animate-pulse rounded-xl border border-border/70 bg-muted/60" />
    </section>
  );
}
