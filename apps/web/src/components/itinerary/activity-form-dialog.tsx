import {
  ACTIVITY_CATEGORIES,
  type Activity,
  type ActivityCategory,
  type ChecklistItem,
  createId,
  type GeoPlace,
  type IdeaList,
  type ItemType,
  type MutationPayload,
  type MutationResponse,
  type MutationType,
  type Place,
} from "@caravan/shared";
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlaceAutocomplete } from "@/components/map/place-autocomplete";
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
import { Textarea } from "@/components/ui/textarea";
import { minorToInput, parseMoney } from "@/lib/expenses/money";
import { CATEGORY_META } from "./categories";
import { dayNumber, formatDayLabel } from "./format";

type MutateAsync = <T extends MutationType>(
  type: T,
  payload: MutationPayload<T>,
) => Promise<MutationResponse>;

const SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Item types the form can CREATE. V2.4 activated the `flight`/`lodging`
 * bookings (departure/arrival, check-in/check-out, confirmation #, …). */
const CREATABLE_TYPES: ItemType[] = ["activity", "note", "checklist", "flight", "lodging"];

const TYPE_LABEL: Record<ItemType, string> = {
  activity: "Activity",
  note: "Note",
  checklist: "Checklist",
  flight: "Flight",
  lodging: "Lodging",
};

/** "Add an activity" / "Add a note" — article + lowercased noun for the header. */
function addLabel(type: ItemType): string {
  const noun = TYPE_LABEL[type].toLowerCase();
  const article = type === "activity" ? "an" : "a";
  return `Add ${article} ${noun}`;
}

/** The next trip day after `day` in the sorted `days` list, or null if `day` is
 * the last day (or absent). Used to seed a lodging's default check-out. */
function dayAfter(day: string, days: string[]): string | null {
  const i = days.indexOf(day);
  return i === -1 ? null : (days[i + 1] ?? null);
}

export function ActivityFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  activity?: Activity;
  defaultDate?: string | null;
  /** Pre-selects the type when opening a create dialog (e.g. an "Add note"
   * button). Ignored in edit mode — the type is read from the activity and the
   * selector is locked. Defaults to "activity". */
  defaultType?: ItemType;
  /** Pre-assigns an idea list for a NEW undated idea (e.g. "+ idea" inside a
   * list). Ignored for dated items / edit mode. */
  defaultListId?: string | null;
  days: string[];
  startDate: string | null;
  /** Trip currency for the estimated-cost field. Defaults to "USD". */
  currency?: string;
  /** The trip's idea lists, for the idea-list assignment select (undated items). */
  ideaLists?: IdeaList[];
  mutateAsync: MutateAsync;
  appendPositionFor: (date: string | null) => string;
}) {
  const { open, onOpenChange, mode, activity, defaultType } = props;
  const headerType: ItemType =
    mode === "edit" ? (activity?.type ?? "activity") : (defaultType ?? "activity");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? addLabel(headerType)
              : `Edit ${TYPE_LABEL[headerType].toLowerCase()}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Drop it on a day, or leave the date off to park it in Ideas."
              : "Update the details — everyone on the trip sees the change."}
          </DialogDescription>
        </DialogHeader>
        {/* Remount per open so fields reset cleanly. */}
        <ActivityForm key={`${mode}:${activity?.id ?? "new"}`} {...props} />
      </DialogContent>
    </Dialog>
  );
}

type Row = ChecklistItem;

function ActivityForm({
  onOpenChange,
  mode,
  activity,
  defaultDate,
  defaultType,
  defaultListId,
  days,
  startDate,
  currency = "USD",
  ideaLists = [],
  mutateAsync,
  appendPositionFor,
}: {
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  activity?: Activity;
  defaultDate?: string | null;
  defaultType?: ItemType;
  defaultListId?: string | null;
  days: string[];
  startDate: string | null;
  currency?: string;
  ideaLists?: IdeaList[];
  mutateAsync: MutateAsync;
  appendPositionFor: (date: string | null) => string;
}) {
  // The D1 discriminator. Immutable on edit (changing a stop into a note is
  // ill-defined about which fields to clear — delete + recreate instead).
  const initialType: ItemType = activity?.type ?? defaultType ?? "activity";
  const [type, setType] = useState<ItemType>(initialType);
  const [title, setTitle] = useState(activity?.title ?? "");
  const [dateValue, setDateValue] = useState(activity?.date ?? defaultDate ?? "");
  const [category, setCategory] = useState<ActivityCategory>(activity?.category ?? "other");
  const [startTime, setStartTime] = useState(activity?.startTime ?? "");
  const [endTime, setEndTime] = useState(activity?.endTime ?? "");
  const [location, setLocation] = useState(activity?.placeName ?? "");
  // Coordinates/provenance from a picked suggestion. Seeded from the activity if
  // it already had a located place; cleared the moment the user edits the text
  // (a hand-edited label no longer matches the pin).
  const [picked, setPicked] = useState<GeoPlace | null>(
    activity?.placeName && activity.lat != null && activity.lng != null
      ? {
          name: activity.placeName,
          address: activity.address ?? undefined,
          lat: activity.lat,
          lng: activity.lng,
          provider: activity.placeProvider ?? "unknown",
          ref: activity.placeRef ?? undefined,
        }
      : null,
  );
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [linkUrl, setLinkUrl] = useState(activity?.linkUrl ?? "");
  const [costInput, setCostInput] = useState(
    activity?.estimatedCostMinor != null ? minorToInput(activity.estimatedCostMinor, currency) : "",
  );
  const [listId, setListId] = useState(activity?.listId ?? defaultListId ?? "");
  const [rows, setRows] = useState<Row[]>(
    activity?.checklistItems ??
      (type === "checklist" ? [{ id: createId(), text: "", done: false }] : []),
  );

  // --- V2.4 booking fields (flight/lodging) -------------------------------
  // Check-out (lodging) / arrival (flight) day. Defaults: lodging → check-in + 1
  // (the next trip day), flight → same as departure (a same-day hop).
  const [endDateValue, setEndDateValue] = useState<string>(() => {
    if (activity?.endDate) return activity.endDate;
    const base = activity?.date ?? defaultDate ?? "";
    if (!base) return "";
    if (initialType === "lodging") return dayAfter(base, days) ?? base;
    if (initialType === "flight") return base;
    return "";
  });
  const [confirmationCode, setConfirmationCode] = useState(activity?.confirmationCode ?? "");
  const [flightNumber, setFlightNumber] = useState(activity?.flightNumber ?? "");
  // Flight ARRIVAL place — its own autocomplete + provenance, mirroring `picked`.
  // `place`/`location` above hold the DEPARTURE airport (flight) / hotel (lodging).
  const [arrLocation, setArrLocation] = useState(activity?.arrPlaceName ?? "");
  const [arrPicked, setArrPicked] = useState<GeoPlace | null>(
    activity?.arrPlaceName && activity.arrLat != null && activity.arrLng != null
      ? {
          name: activity.arrPlaceName,
          address: activity.arrAddress ?? undefined,
          lat: activity.arrLat,
          lng: activity.arrLng,
          provider: activity.arrPlaceProvider ?? "unknown",
          ref: activity.arrPlaceRef ?? undefined,
        }
      : null,
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A stop carries place/time/category/link/cost; notes & checklists hide those.
  const isStop = type === "activity";
  const isNote = type === "note";
  const isChecklist = type === "checklist";
  const isFlight = type === "flight";
  const isLodging = type === "lodging";
  const isBooking = isFlight || isLodging;
  // Cost is the stop's estimate and the lodging's whole-stay total (PD-13).
  const showCost = isStop || isLodging;
  const isIdea = dateValue === ""; // undated → lives in Ideas; can join a list

  // The trip-day <option>s, shared by the day / check-out / arrival selects.
  const dayOptions = days.map((iso) => {
    const n = dayNumber(iso, startDate);
    return (
      <option key={iso} value={iso}>
        {n != null ? `${formatDayLabel(iso)} · Day ${n}` : formatDayLabel(iso)}
      </option>
    );
  });

  function addRow() {
    setRows((prev) => [...prev, { id: createId(), text: "", done: false }]);
  }
  function setRowText(id: string, text: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, text } : r)));
  }
  function toggleRowDone(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, done: !r.done } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Give it a name first.");
      return;
    }
    if (isStop && startTime && endTime && startTime > endTime) {
      setError("The end time is before the start time.");
      return;
    }
    const link = linkUrl.trim() || null;
    if (isStop && link && !/^https?:\/\//i.test(link)) {
      setError("Links need to start with http:// or https://");
      return;
    }
    // Estimated cost: blank = no estimate; a non-empty value must be valid.
    let costMinor: number | null = null;
    if (showCost && costInput.trim()) {
      costMinor = parseMoney(costInput, currency);
      if (costMinor === null) {
        setError("Enter a valid estimated cost, or leave it blank.");
        return;
      }
    }

    const date = dateValue || null;
    const endDate = endDateValue || null;
    // Booking date order + lodging's required check-out, mirroring the server.
    if (isBooking && date && endDate && endDate < date) {
      setError(
        isLodging ? "Check-out can't be before check-in." : "The arrival day is before departure.",
      );
      return;
    }
    if (isLodging && !endDate) {
      setError("Pick a check-out day.");
      return;
    }
    const start = startTime || null;
    const end = endTime || null;
    const placeName = location.trim();
    // A picked suggestion still matching the box → full place with coordinates +
    // provenance. Otherwise freeform: a name-only place (no pin) — still saves.
    const place: Place | null = !placeName
      ? null
      : picked && picked.name === placeName
        ? {
            name: picked.name,
            address: picked.address,
            lat: picked.lat,
            lng: picked.lng,
            provider: picked.provider,
            ref: picked.ref,
          }
        : { name: placeName };

    // Flight ARRIVAL place — same picked-vs-freeform rule as `place` above.
    const arrName = arrLocation.trim();
    const arrPlace: Place | null = !arrName
      ? null
      : arrPicked && arrPicked.name === arrName
        ? {
            name: arrPicked.name,
            address: arrPicked.address,
            lat: arrPicked.lat,
            lng: arrPicked.lng,
            provider: arrPicked.provider,
            ref: arrPicked.ref,
          }
        : { name: arrName };
    const confCode = confirmationCode.trim() || null;
    const flightNum = flightNumber.trim() || null;

    // Checklist body: trimmed, non-empty rows only (the schema requires text).
    const checklistItems: ChecklistItem[] | null = isChecklist
      ? rows
          .map((r) => ({ id: r.id, text: r.text.trim(), done: r.done }))
          .filter((r) => r.text.length > 0)
      : null;

    // Only undated ideas carry a list; a dated item is never a list member.
    const targetListId = isIdea ? listId || null : null;

    setSubmitting(true);
    setError(null);
    try {
      if (mode === "create") {
        await mutateAsync("activity.create", {
          activityId: createId(),
          title: trimmedTitle,
          date,
          position: appendPositionFor(date),
          category: isStop ? category : "other",
          // Times double as check-in/out (lodging) & depart/arrive (flight).
          startTime: isStop || isBooking ? start : null,
          endTime: isStop || isBooking ? end : null,
          // `notes` is the body for a note; supplementary for a stop; unused for a checklist.
          notes: isChecklist ? "" : notes,
          linkUrl: isStop ? link : null,
          // `place` = the stop's location / lodging's hotel / flight's departure.
          place: isStop || isBooking ? place : null,
          type,
          estimatedCostMinor: costMinor,
          listId: targetListId,
          checklistItems,
          // V2.4 bookings: endDate = check-out/arrival; arrPlace/flightNumber are
          // flight-only (the server refinements enforce the same constraints).
          endDate: isBooking ? endDate : null,
          confirmationCode: isBooking ? confCode : null,
          arrPlace: isFlight ? arrPlace : null,
          flightNumber: isFlight ? flightNum : null,
        });
      } else if (activity) {
        const patch: MutationPayload<"activity.update">["patch"] = {};
        if (trimmedTitle !== activity.title) patch.title = trimmedTitle;
        // Body/notes applies to stops and notes (checklist hides it).
        if (!isChecklist && notes !== activity.notes) patch.notes = notes;
        if (isStop) {
          if (category !== activity.category) patch.category = category;
          if (link !== activity.linkUrl) patch.linkUrl = link;
        }
        // Times + the primary place are shared by stops and bookings.
        if (isStop || isBooking) {
          if (start !== activity.startTime) patch.startTime = start;
          if (end !== activity.endTime) patch.endTime = end;
          // Send `place` when the name OR the coordinates/provenance changed, so
          // picking a pin for an already-named place still attaches the location.
          const placeChanged =
            (place?.name ?? null) !== activity.placeName ||
            (place?.lat ?? null) !== activity.lat ||
            (place?.lng ?? null) !== activity.lng ||
            (place?.ref ?? null) !== activity.placeRef;
          if (placeChanged) patch.place = place;
        }
        if (showCost && costMinor !== activity.estimatedCostMinor) {
          patch.estimatedCostMinor = costMinor;
        }
        if (isBooking) {
          if (endDate !== activity.endDate) patch.endDate = endDate;
          if (confCode !== activity.confirmationCode) patch.confirmationCode = confCode;
        }
        if (isFlight) {
          const arrChanged =
            (arrPlace?.name ?? null) !== activity.arrPlaceName ||
            (arrPlace?.lat ?? null) !== activity.arrLat ||
            (arrPlace?.lng ?? null) !== activity.arrLng ||
            (arrPlace?.ref ?? null) !== activity.arrPlaceRef;
          if (arrChanged) patch.arrPlace = arrPlace;
          if (flightNum !== activity.flightNumber) patch.flightNumber = flightNum;
        }
        if (isChecklist) {
          const changed =
            JSON.stringify(checklistItems) !== JSON.stringify(activity.checklistItems ?? []);
          if (changed) patch.checklistItems = checklistItems;
        }
        // List membership: clears when the item becomes dated; otherwise tracks
        // the select. (date itself moves via activity.move below.)
        if (targetListId !== activity.listId) patch.listId = targetListId;

        if (Object.keys(patch).length > 0) {
          await mutateAsync("activity.update", { activityId: activity.id, patch });
        }
        // date/position move only via activity.move (the LWW-resolved fields).
        if ((activity.date ?? "") !== dateValue) {
          await mutateAsync("activity.move", {
            activityId: activity.id,
            date,
            position: appendPositionFor(date),
          });
        }
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="activity-title">Title</Label>
        <Input
          id="activity-title"
          autoFocus
          value={title}
          maxLength={200}
          placeholder={isNote ? "Trip notes" : isChecklist ? "Packing list" : "Pastéis de Belém"}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="activity-type">Type</Label>
          <select
            id="activity-type"
            className={SELECT_CLASS}
            value={type}
            disabled={mode === "edit"}
            aria-describedby={mode === "edit" ? "activity-type-hint" : undefined}
            onChange={(e) => {
              const next = e.target.value as ItemType;
              setType(next);
              // Seed a sensible check-out / arrival day when switching into a
              // booking (lodging → next trip day; flight → same day).
              if (!endDateValue && dateValue) {
                if (next === "lodging") setEndDateValue(dayAfter(dateValue, days) ?? dateValue);
                else if (next === "flight") setEndDateValue(dateValue);
              }
            }}
          >
            {CREATABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {mode === "edit" && (
            <p id="activity-type-hint" className="text-muted-foreground text-xs">
              Type can't be changed after an item is created.
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="activity-date">
            {isLodging ? "Check-in day" : isFlight ? "Departure day" : "Day"}
          </Label>
          <select
            id="activity-date"
            className={SELECT_CLASS}
            value={dateValue}
            onChange={(e) => {
              const d = e.target.value;
              setDateValue(d);
              // Keep the check-out / arrival default in step while it's untouched.
              if (isBooking && d && !endDateValue) {
                setEndDateValue(isLodging ? (dayAfter(d, days) ?? d) : d);
              }
            }}
          >
            <option value="">Ideas — no date yet</option>
            {dayOptions}
          </select>
        </div>
      </div>

      {/* Primary place: a stop's location, a lodging's hotel, a flight's departure. */}
      {(isStop || isBooking) && (
        <div className="grid gap-2">
          <Label htmlFor="activity-location">
            {isLodging ? "Hotel" : isFlight ? "Departs from" : "Location"}
          </Label>
          <PlaceAutocomplete
            inputId="activity-location"
            value={location}
            picked={picked !== null && picked.name === location.trim()}
            placeholder={
              isLodging
                ? "Search the hotel, or type its name (optional)"
                : isFlight
                  ? "Departure airport or city (optional)"
                  : "Search a place, or just type one (optional)"
            }
            onTextChange={(text) => {
              setLocation(text);
              // Hand-editing the label detaches it from the picked pin.
              if (picked && text.trim() !== picked.name) setPicked(null);
            }}
            onPick={(place) => {
              setPicked(place);
              setLocation(place.name);
            }}
          />
          {picked && picked.name === location.trim() && (
            <p className="text-muted-foreground text-xs">Pinned on the map ✓</p>
          )}
        </div>
      )}

      {/* Flight arrival place — its own autocomplete; freeform text still saves. */}
      {isFlight && (
        <div className="grid gap-2">
          <Label htmlFor="activity-arr-location">Arrives at (city or airport)</Label>
          <PlaceAutocomplete
            inputId="activity-arr-location"
            value={arrLocation}
            picked={arrPicked !== null && arrPicked.name === arrLocation.trim()}
            placeholder="Arrival airport or city (optional)"
            onTextChange={(text) => {
              setArrLocation(text);
              if (arrPicked && text.trim() !== arrPicked.name) setArrPicked(null);
            }}
            onPick={(place) => {
              setArrPicked(place);
              setArrLocation(place.name);
            }}
          />
          {arrPicked && arrPicked.name === arrLocation.trim() && (
            <p className="text-muted-foreground text-xs">Pinned on the map ✓</p>
          )}
        </div>
      )}

      {isStop && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="activity-category">Category</Label>
              <select
                id="activity-category"
                className={SELECT_CLASS}
                value={category}
                onChange={(e) => setCategory(e.target.value as ActivityCategory)}
              >
                {ACTIVITY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-cost">Est. cost ({currency})</Label>
              <Input
                id="activity-cost"
                inputMode="decimal"
                value={costInput}
                placeholder="0.00"
                onChange={(e) => setCostInput(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="activity-start">Starts</Label>
              <Input
                id="activity-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-end">Ends</Label>
              <Input
                id="activity-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="activity-link">Link</Label>
            <Input
              id="activity-link"
              type="url"
              value={linkUrl}
              maxLength={2048}
              placeholder="Booking or info link (optional)"
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>
        </>
      )}

      {/* Lodging: check-out day + total cost, check-in/out times, confirmation #. */}
      {isLodging && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="activity-end-date">Check-out day</Label>
              <select
                id="activity-end-date"
                className={SELECT_CLASS}
                value={endDateValue}
                onChange={(e) => setEndDateValue(e.target.value)}
              >
                <option value="">Select a day…</option>
                {dayOptions}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-cost">Total cost ({currency})</Label>
              <Input
                id="activity-cost"
                inputMode="decimal"
                value={costInput}
                placeholder="0.00"
                onChange={(e) => setCostInput(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="activity-start">Check-in time</Label>
              <Input
                id="activity-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-end">Check-out time</Label>
              <Input
                id="activity-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="activity-confirmation">Confirmation #</Label>
            <Input
              id="activity-confirmation"
              value={confirmationCode}
              maxLength={100}
              placeholder="Booking reference (optional)"
              onChange={(e) => setConfirmationCode(e.target.value)}
            />
          </div>
        </>
      )}

      {/* Flight: arrival day + flight #, departs/arrives times, confirmation #. */}
      {isFlight && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="activity-end-date">Arrival day</Label>
              <select
                id="activity-end-date"
                className={SELECT_CLASS}
                value={endDateValue}
                onChange={(e) => setEndDateValue(e.target.value)}
              >
                <option value="">Same day</option>
                {dayOptions}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-flight-number">Flight #</Label>
              <Input
                id="activity-flight-number"
                value={flightNumber}
                maxLength={20}
                placeholder="e.g. UA 123 (optional)"
                onChange={(e) => setFlightNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="activity-start">Departs at</Label>
              <Input
                id="activity-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-end">Arrives at</Label>
              <Input
                id="activity-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="activity-confirmation">Confirmation #</Label>
            <Input
              id="activity-confirmation"
              value={confirmationCode}
              maxLength={100}
              placeholder="Booking reference (optional)"
              onChange={(e) => setConfirmationCode(e.target.value)}
            />
          </div>
        </>
      )}

      {/* Notes is the BODY of a note (prominent); supplementary for a stop. */}
      {(isStop || isNote) && (
        <div className="grid gap-2">
          <Label htmlFor="activity-notes">{isNote ? "Body" : "Notes"}</Label>
          <Textarea
            id="activity-notes"
            value={notes}
            maxLength={5000}
            className={isNote ? "min-h-32" : undefined}
            placeholder={isNote ? "Write the note…" : "Anything the group should know"}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}

      {isChecklist && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium text-sm">Items</legend>
          <ul className="grid gap-2">
            {rows.map((row, i) => (
              <li key={row.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.done}
                  aria-label={`Mark item ${i + 1} done`}
                  onChange={() => toggleRowDone(row.id)}
                />
                <Input
                  value={row.text}
                  maxLength={500}
                  aria-label={`Item ${i + 1}`}
                  placeholder="Add an item…"
                  onChange={(e) => setRowText(row.id, e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              Add item
            </Button>
          </div>
        </fieldset>
      )}

      {/* Idea-list assignment — only an undated idea can belong to a list. */}
      {isIdea && (
        <div className="grid gap-2">
          <Label htmlFor="activity-list">Idea list</Label>
          <select
            id="activity-list"
            className={SELECT_CLASS}
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            <option value="">No list</option>
            {ideaLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Add to trip" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
