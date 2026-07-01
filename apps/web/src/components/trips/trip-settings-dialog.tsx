import type { MutationPayload, RouteMode } from "@caravan/shared";
import { Car, Footprints, TriangleAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { RouteModeSegmented } from "@/components/itinerary/route-mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES } from "@/lib/currencies";
import { useMoney } from "@/lib/expenses/use-money";
import { useTripMutation } from "@/lib/sync";
import type { TripSnapshot } from "@/lib/sync/shared";
import { formatTripDates } from "./format";

const SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export interface TripSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: TripSnapshot;
  canEdit: boolean;
}

/**
 * Trip settings (TopBar ⋯ → Settings): name, destination, dates, currency, and
 * the trip-wide default travel mode — everything `trip.update` accepts except
 * the bulletin (that's content; it lives on the Overview). Editors get a form
 * that diff-patches only the changed fields; viewers get the same values
 * read-only — post-creation, currency and dates are visible nowhere else.
 */
export function TripSettingsDialog({
  open,
  onOpenChange,
  snapshot,
  canEdit,
}: TripSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trip settings</DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Trip-wide details — everyone on the trip sees changes."
              : "Trip-wide details. Only owners and editors can change these."}
          </DialogDescription>
        </DialogHeader>
        {/* Radix keeps DialogContent's children unmounted while closed, so the
            body below mounts fresh on every open: the form's state initializers
            re-read the snapshot (draft reset) and capture the open-time
            currency baseline exactly once per open — the relabel warning
            compares against a fixed point and never flickers as the draft
            changes. (Same idiom as ActivityFormDialog's remount-per-open.) */}
        {canEdit ? (
          <TripSettingsForm snapshot={snapshot} onOpenChange={onOpenChange} />
        ) : (
          <TripSettingsReadOnly snapshot={snapshot} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TripSettingsForm({
  snapshot,
  onOpenChange,
}: {
  snapshot: TripSnapshot;
  onOpenChange: (open: boolean) => void;
}) {
  const { trip, activities } = snapshot;
  const { mutateAsync } = useTripMutation();
  // Same money query ExpensesPanel uses — the workspace keeps it warm, so this
  // dedupes against the cache rather than refetching.
  const moneyQuery = useMoney(trip.id);

  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination ?? "");
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [endDate, setEndDate] = useState(trip.endDate ?? "");
  const [currency, setCurrency] = useState(trip.currency);
  const [routeMode, setRouteMode] = useState<RouteMode>(trip.defaultRouteMode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Open-time currency baseline — captured once on mount (= once per dialog
  // open; see the mount note in TripSettingsDialog) so the warning's
  // comparison target holds still while the draft changes.
  const [baselineCurrency] = useState(trip.currency);

  const dateError =
    startDate && endDate && endDate < startDate
      ? "The end date can't be before the start date."
      : null;

  // The relabel warning's evidence: amounts are stored as integer minor units
  // and re-displayed under whatever currency the trip has — there is NO FX
  // conversion, so a currency change relabels every logged amount in place.
  const expenseCount = moneyQuery.data?.expenses.length ?? 0;
  const estimateCount = activities.filter((a) => a.estimatedCostMinor != null).length;
  const moneyCount = expenseCount + estimateCount;
  const showCurrencyWarning = currency !== baselineCurrency && moneyCount > 0;

  // The saved currency can sit outside the curated shortlist (the schema
  // accepts any ISO 4217 code) — keep it selectable rather than snapping the
  // select to the first option.
  const currencyOptions = (CURRENCIES as readonly string[]).includes(trip.currency)
    ? (CURRENCIES as readonly string[])
    : [trip.currency, ...CURRENCIES];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateError) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give the trip a name.");
      return;
    }
    const trimmedDestination = destination.trim();

    // Diff-patch: only changed fields go on the wire (the TripNameEditor /
    // ActivityForm commit-only-if-changed pattern); an untouched form just closes.
    const patch: MutationPayload<"trip.update"> = {};
    if (trimmedName !== trip.name) patch.name = trimmedName;
    if ((trimmedDestination || null) !== trip.destination) {
      patch.destination = trimmedDestination || null;
    }
    if ((startDate || null) !== trip.startDate) patch.startDate = startDate || null;
    if ((endDate || null) !== trip.endDate) patch.endDate = endDate || null;
    if (currency !== trip.currency) patch.currency = currency;
    if (routeMode !== trip.defaultRouteMode) patch.defaultRouteMode = routeMode;

    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await mutateAsync("trip.update", patch);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="trip-settings-name">Name</Label>
        <Input
          id="trip-settings-name"
          value={name}
          required
          maxLength={120}
          placeholder="Summer in the Dolomites"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trip-settings-destination">Destination (optional)</Label>
        <Input
          id="trip-settings-destination"
          value={destination}
          maxLength={200}
          placeholder="Cortina d'Ampezzo, Italy"
          onChange={(event) => setDestination(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="trip-settings-start-date">Start date</Label>
          <Input
            id="trip-settings-start-date"
            type="date"
            value={startDate}
            max={endDate || undefined}
            aria-invalid={dateError ? true : undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trip-settings-end-date">End date</Label>
          <Input
            id="trip-settings-end-date"
            type="date"
            value={endDate}
            min={startDate || undefined}
            aria-invalid={dateError ? true : undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>
      {dateError && <p className="text-destructive text-sm">{dateError}</p>}
      <div className="space-y-2">
        <Label htmlFor="trip-settings-currency">Currency</Label>
        <select
          id="trip-settings-currency"
          className={SELECT_CLASS}
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
        >
          {currencyOptions.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        {showCurrencyWarning && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm leading-relaxed"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              This trip already has {moneyCount} logged amount{moneyCount === 1 ? "" : "s"}{" "}
              (expenses and cost estimates). Changing the currency only relabels them for display —
              it doesn't convert the amounts.
            </span>
          </p>
        )}
      </div>
      <div className="space-y-2">
        <span className="flex select-none items-center gap-2 font-medium text-sm leading-none">
          Default travel mode
        </span>
        <div>
          <RouteModeSegmented value={routeMode} onChange={setRouteMode} showLabels />
        </div>
        <p className="text-muted-foreground text-xs">Individual days can still override this.</p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm leading-relaxed"
        >
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || Boolean(dateError)}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The viewer rendering — same values, no inputs (the app's viewer idiom:
 * plain read-only display, like the itinerary's route-mode indicator, rather
 * than disabled controls) and no save button.
 */
function TripSettingsReadOnly({ snapshot }: { snapshot: TripSnapshot }) {
  const { trip } = snapshot;
  const ModeIcon = trip.defaultRouteMode === "driving" ? Car : Footprints;
  return (
    <dl className="grid gap-4">
      <ReadOnlyRow label="Name">{trip.name}</ReadOnlyRow>
      <ReadOnlyRow label="Destination">{trip.destination ?? "Not set"}</ReadOnlyRow>
      <ReadOnlyRow label="Dates">{formatTripDates(trip.startDate, trip.endDate)}</ReadOnlyRow>
      <ReadOnlyRow label="Currency">{trip.currency}</ReadOnlyRow>
      <ReadOnlyRow label="Default travel mode">
        <span className="flex items-center gap-1">
          <ModeIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
          <span className="capitalize">{trip.defaultRouteMode}</span>
        </span>
      </ReadOnlyRow>
    </dl>
  );
}

function ReadOnlyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
