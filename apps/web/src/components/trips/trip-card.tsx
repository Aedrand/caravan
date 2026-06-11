import { Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarDays,
  Copy,
  Ellipsis,
  MapPin,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { DeleteTripDialog } from "@/components/trips/delete-trip-dialog";
import { formatTripDates } from "@/components/trips/format";
import {
  useArchiveTripFromList,
  useDeleteTrip,
  useDuplicateTrip,
} from "@/components/trips/use-trip-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api";
import type { Role, TripListItem } from "@/lib/sync/shared";
import { cn } from "@/lib/utils";

const ROLE_BADGE_VARIANT = {
  owner: "default",
  editor: "secondary",
  viewer: "outline",
} as const satisfies Record<Role, "default" | "secondary" | "outline">;

export function TripCard({ item }: { item: TripListItem }) {
  const { trip, role, memberCount } = item;
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const archived = trip.archivedAt !== null;
  const isOwner = role === "owner";
  const archive = useArchiveTripFromList(trip.id);
  const duplicate = useDuplicateTrip(trip.id);
  const deleteTrip = useDeleteTrip(trip.id);

  const goToTrip = () => void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } });

  const deleteError = deleteTrip.error
    ? deleteTrip.error instanceof ApiError
      ? deleteTrip.error.message
      : "Couldn't delete the trip. Please try again."
    : null;

  return (
    <>
      <Card
        onClick={goToTrip}
        className={cn(
          "cursor-pointer gap-4 py-5 transition-shadow hover:shadow-md",
          archived && "bg-muted/40",
        )}
      >
        <CardHeader className="grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-5">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className={cn("truncate text-base", archived && "text-muted-foreground")}>
              <Link
                to="/trips/$tripId"
                params={{ tripId: trip.id }}
                className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onClick={(event) => event.stopPropagation()}
              >
                {trip.name}
              </Link>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={ROLE_BADGE_VARIANT[role]} className="capitalize">
                {role}
              </Badge>
              {archived && <Badge variant="outline">Archived</Badge>}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${trip.name}`}
                className="text-muted-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            {/* The menu portals back into this React tree — keep its clicks off the card. */}
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onSelect={goToTrip}>
                <ArrowRight aria-hidden />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem disabled={duplicate.isPending} onSelect={() => duplicate.mutate()}>
                <Copy aria-hidden />
                {duplicate.isPending ? "Duplicating…" : "Duplicate"}
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuItem
                    disabled={archive.isPending}
                    onSelect={() => archive.mutate(archived ? "trip.unarchive" : "trip.archive")}
                  >
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
        </CardHeader>
        <CardContent
          className={cn("space-y-1.5 px-5 text-sm text-muted-foreground", archived && "opacity-80")}
        >
          {trip.destination && (
            <p className="flex items-center gap-2">
              <MapPin aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{trip.destination}</span>
            </p>
          )}
          <p className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-4 shrink-0" />
            {formatTripDates(trip.startDate, trip.endDate)}
          </p>
          <p className="flex items-center gap-2">
            <Users aria-hidden className="size-4 shrink-0" />
            {memberCount === 1 ? "1 member" : `${memberCount} members`}
          </p>
        </CardContent>
      </Card>
      {/* Outside the clickable card so overlay/portal clicks never navigate. */}
      <DeleteTripDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tripName={trip.name}
        pending={deleteTrip.isPending}
        errorMessage={deleteError}
        onConfirm={() => deleteTrip.mutate(undefined, { onSuccess: () => setDeleteOpen(false) })}
      />
    </>
  );
}
