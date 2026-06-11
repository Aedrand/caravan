import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Compass, Plus } from "lucide-react";
import { useState } from "react";
import { CreateTripDialog } from "@/components/trips/create-trip-dialog";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api";
import { fetchSession } from "@/lib/auth-client";
import { tripKeys } from "@/lib/sync";
import type { TripListItem } from "@/lib/sync/shared";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // The dashboard is members-only; guests start at the door.
    if (!(await fetchSession())) throw redirect({ to: "/login" });
  },
  component: Dashboard,
});

function Dashboard() {
  const [createOpen, setCreateOpen] = useState(false);
  const tripsQuery = useQuery({
    queryKey: tripKeys.list,
    queryFn: () => apiFetch<{ trips: TripListItem[] }>("/api/trips"),
  });

  return (
    <>
      {tripsQuery.isPending ? (
        <DashboardSkeleton />
      ) : tripsQuery.isError ? (
        <DashboardError
          message={
            tripsQuery.error instanceof ApiError
              ? tripsQuery.error.message
              : "Couldn't load your trips."
          }
          onRetry={() => void tripsQuery.refetch()}
        />
      ) : tripsQuery.data.trips.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <section>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Your trips</h1>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              New trip
            </Button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tripsQuery.data.trips.map((item) => (
              <TripCard key={item.trip.id} item={item} />
            ))}
          </div>
        </section>
      )}
      <CreateTripDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-card px-8 py-12 text-center shadow-sm sm:px-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Compass aria-hidden className="size-7" strokeWidth={1.75} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">No trips yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Plan your first trip together.
        </p>
        <Button className="mt-8" size="lg" onClick={onCreate}>
          <Plus aria-hidden />
          Plan your first trip
        </Button>
      </div>
    </section>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Something went sideways</CardTitle>
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

function DashboardSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading trips">
      <div className="flex items-center justify-between gap-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <div
            key={key}
            className="h-44 animate-pulse rounded-xl border border-border/70 bg-muted/60"
          />
        ))}
      </div>
    </section>
  );
}
