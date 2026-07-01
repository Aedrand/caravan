import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { CURRENCIES } from "@/lib/currencies";
import { tripKeys } from "@/lib/sync";
import type { CreateTripInput, Trip } from "@/lib/sync/shared";
import { cn } from "@/lib/utils";

export function CreateTripDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dateError =
    startDate && endDate && endDate < startDate
      ? "The end date can't be before the start date."
      : null;

  const createTrip = useMutation({
    mutationFn: (body: CreateTripInput) => apiPost<{ trip: Trip }>("/api/trips", body),
    onSuccess: async ({ trip }) => {
      await queryClient.invalidateQueries({ queryKey: tripKeys.list });
      onOpenChange(false);
      await navigate({ to: "/trips/$tripId", params: { tripId: trip.id } });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    },
  });

  function handleOpenChange(next: boolean) {
    if (createTrip.isPending) return;
    if (!next) {
      // Fresh form next time the dialog opens.
      setStartDate("");
      setEndDate("");
      setError(null);
      createTrip.reset();
    }
    onOpenChange(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateError) return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setError("Give the trip a name.");
      return;
    }
    const destination = String(form.get("destination") ?? "").trim();
    const currency = String(form.get("currency") ?? "USD");

    setError(null);
    createTrip.mutate({
      name,
      destination: destination || null,
      startDate: startDate || null,
      endDate: endDate || null,
      currency,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>New trip</DialogTitle>
          <DialogDescription>
            Name it, point it somewhere, and start planning together.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="trip-name">Name</Label>
            <Input
              id="trip-name"
              name="name"
              required
              maxLength={120}
              placeholder="Summer in the Dolomites"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trip-destination">Destination (optional)</Label>
            <Input
              id="trip-destination"
              name="destination"
              maxLength={200}
              placeholder="Cortina d'Ampezzo, Italy"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trip-start-date">Start date</Label>
              <Input
                id="trip-start-date"
                name="startDate"
                type="date"
                value={startDate}
                max={endDate || undefined}
                aria-invalid={dateError ? true : undefined}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trip-end-date">End date</Label>
              <Input
                id="trip-end-date"
                name="endDate"
                type="date"
                value={endDate}
                min={startDate || undefined}
                aria-invalid={dateError ? true : undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          {dateError && <p className="text-sm text-destructive">{dateError}</p>}
          <div className="space-y-2">
            <Label htmlFor="trip-currency">Currency</Label>
            <select
              id="trip-currency"
              name="currency"
              defaultValue="USD"
              className={cn(
                "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={createTrip.isPending || Boolean(dateError)}
          >
            {createTrip.isPending ? "Creating…" : "Create trip"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
