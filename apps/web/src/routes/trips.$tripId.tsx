import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DeleteTripDialog } from "@/components/trips/delete-trip-dialog";
import { TripWorkspace } from "@/components/trips/trip-workspace";
import { useDeleteTrip, useDuplicateTrip } from "@/components/trips/use-trip-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { fetchSession } from "@/lib/auth-client";
import { personColors } from "@/lib/person-colors";
import { TripSyncProvider, useMyMember, useTripMutation, useTripSnapshot } from "@/lib/sync";
import type { TripSnapshot } from "@/lib/sync/shared";

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
    <>
      <TripWorkspace
        snapshot={snapshot}
        canEdit={canEdit}
        isOwner={isOwner}
        archived={archived}
        pending={isPending}
        presenceColors={presenceColors}
        onRename={commitName}
        onToggleArchive={toggleArchive}
        onDuplicate={() => duplicate.mutate()}
        duplicating={duplicate.isPending}
        onRequestDelete={() => setDeleteOpen(true)}
      />

      <DeleteTripDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tripName={trip.name}
        pending={deleteTrip.isPending}
        errorMessage={deleteError}
        onConfirm={() => deleteTrip.mutate()}
      />
    </>
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
