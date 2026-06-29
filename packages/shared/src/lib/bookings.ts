import type { Activity } from "../schemas/activity";

/**
 * Booking → itinerary derivation (Trip Workspace v2.4, D-anchors). Pure: no IO,
 * no React, no DB — every function is a total mapping over plain data so it is
 * exhaustively unit-testable and reusable on both the server and the client.
 *
 * Two jobs:
 *  1. `computeBookingDerivedEntries` turns a multi-day booking into the implicit
 *     itinerary rows it spawns on OTHER days (a lodging's check-out, a flight's
 *     arrival) — the booking row itself lives on its own `date`; this surfaces
 *     the "other end" of the booking on the day it actually happens.
 *  2. `deriveAnchors` resolves a day's START ("where you woke up") and END
 *     ("where you slept") anchors for the map, with a manual per-day home-base
 *     OVERRIDE taking precedence over the booking-computed value.
 */

/** An implicit itinerary row a multi-day booking spawns on a later day. */
export interface DerivedEntry {
  /** `check-out` from a lodging; `flight-arrive` is a flight's landing. */
  kind: "check-out" | "flight-arrive";
  /** ISO yyyy-mm-dd the entry lands on (the booking's `endDate`). */
  date: string;
  /** Time of day (HH:mm) when known — the booking's `endTime`; else null. */
  time: string | null;
  placeName: string | null;
  lat: number | null;
  lng: number | null;
  /** Display label, e.g. "Check out of Hotel Nikko" / "Arrive Haneda". */
  title: string;
  /** The booking this entry was derived from (so the UI can link back / dedupe). */
  sourceBookingId: string;
}

/** A resolved day anchor (the map's start/end point for a day). */
export interface AnchorRef {
  /** The booking that produced it, or null when it came from a manual override. */
  bookingId: string | null;
  placeName: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * A day's manual home-base override (the `days.homeBase*` columns). A non-null
 * `homeBasePlaceName` means the user pinned where they were that night, which
 * wins over any booking-computed anchor.
 */
export interface DayOverride {
  homeBasePlaceName: string | null;
  homeBaseAddress: string | null;
  homeBaseLat: number | null;
  homeBaseLng: number | null;
  homeBasePlaceProvider: string | null;
  homeBasePlaceRef: string | null;
}

/**
 * Shift an ISO `yyyy-mm-dd` date by whole days with NO timezone math: parse the
 * calendar fields, step the day in UTC, reformat. Pure calendar arithmetic, so
 * DST / locale never enter into it.
 */
export function shiftIsoDate(date: string, deltaDays: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * The implicit entries a booking spawns on a later day:
 *  - flight, same-day (`endDate === date`) → none (shown inline on its own day);
 *  - flight, overnight (`endDate > date`)  → one `flight-arrive` on `endDate`,
 *    located at the arrival place (`arr*`);
 *  - lodging                               → one `check-out` on `endDate`,
 *    located at the lodging place (`place*`);
 *  - anything else                         → none.
 */
export function computeBookingDerivedEntries(booking: Activity): DerivedEntry[] {
  if (booking.type === "flight") {
    // Needs both endpoints and a genuine overnight gap to spawn an arrival.
    if (booking.date === null || booking.endDate === null || booking.endDate <= booking.date) {
      return [];
    }
    return [
      {
        kind: "flight-arrive",
        date: booking.endDate,
        time: booking.endTime,
        placeName: booking.arrPlaceName,
        lat: booking.arrLat,
        lng: booking.arrLng,
        title: booking.arrPlaceName ? `Arrive ${booking.arrPlaceName}` : "Arrival",
        sourceBookingId: booking.id,
      },
    ];
  }

  if (booking.type === "lodging") {
    // A lodging always carries a check-out date (schema-enforced); be defensive.
    if (booking.endDate === null) return [];
    return [
      {
        kind: "check-out",
        date: booking.endDate,
        time: booking.endTime,
        placeName: booking.placeName,
        lat: booking.lat,
        lng: booking.lng,
        title: booking.placeName ? `Check out of ${booking.placeName}` : "Check-out",
        sourceBookingId: booking.id,
      },
    ];
  }

  return [];
}

function anchorFromOverride(override: DayOverride): AnchorRef {
  return {
    bookingId: null,
    placeName: override.homeBasePlaceName,
    lat: override.homeBaseLat,
    lng: override.homeBaseLng,
  };
}

function anchorFromLodging(booking: Activity): AnchorRef {
  return {
    bookingId: booking.id,
    placeName: booking.placeName,
    lat: booking.lat,
    lng: booking.lng,
  };
}

function anchorFromFlightArrival(booking: Activity): AnchorRef {
  return {
    bookingId: booking.id,
    placeName: booking.arrPlaceName,
    lat: booking.arrLat,
    lng: booking.arrLng,
  };
}

function isLodgingSpan(booking: Activity): boolean {
  return booking.type === "lodging" && booking.date !== null && booking.endDate !== null;
}

/**
 * Resolve a day's START / END anchors with OVERRIDE-then-computed precedence.
 *
 * Model (a lodging spans check-in `date` … check-out `endDate`; you sleep there
 * nights `[checkIn … checkOut-1]`):
 *  - END(date)   = where you sleep that night:
 *      override on `date` wins; else the lodging whose NIGHTS cover `date`
 *      (`checkIn ≤ date < checkOut`).
 *  - START(date) = where you woke up = where you slept the night before:
 *      override on `date−1` wins (even over a flight arrival); else the lodging
 *      you'd wake in (`checkIn < date ≤ checkOut`), else a flight that ARRIVED
 *      that morning (`endDate === date`, overnight).
 *
 * `dayOverrides` is keyed by ISO date; a missing entry (or a null
 * `homeBasePlaceName`) means "no override → use the computed anchor".
 */
export function deriveAnchors(
  bookings: Activity[],
  date: string,
  dayOverrides: Map<string, DayOverride>,
): { start: AnchorRef | null; end: AnchorRef | null } {
  return {
    start: deriveStart(bookings, date, dayOverrides),
    end: deriveEnd(bookings, date, dayOverrides),
  };
}

function deriveEnd(
  bookings: Activity[],
  date: string,
  dayOverrides: Map<string, DayOverride>,
): AnchorRef | null {
  const override = dayOverrides.get(date);
  if (override && override.homeBasePlaceName !== null) return anchorFromOverride(override);

  // The lodging whose nights cover `date`: checkIn ≤ date < checkOut.
  const lodging = bookings.find(
    (b) => isLodgingSpan(b) && (b.date as string) <= date && date < (b.endDate as string),
  );
  return lodging ? anchorFromLodging(lodging) : null;
}

function deriveStart(
  bookings: Activity[],
  date: string,
  dayOverrides: Map<string, DayOverride>,
): AnchorRef | null {
  const prev = shiftIsoDate(date, -1);
  const prevOverride = dayOverrides.get(prev);
  // An override on the PREVIOUS day's home base wins outright — even over a
  // flight that arrived this morning.
  if (prevOverride && prevOverride.homeBasePlaceName !== null)
    return anchorFromOverride(prevOverride);

  // The lodging you'd wake up in: checkIn < date ≤ checkOut.
  const lodging = bookings.find(
    (b) => isLodgingSpan(b) && (b.date as string) < date && date <= (b.endDate as string),
  );
  if (lodging) return anchorFromLodging(lodging);

  // Otherwise an overnight flight that landed this morning (endDate === date).
  const flight = bookings.find(
    (b) =>
      b.type === "flight" &&
      b.date !== null &&
      b.endDate === date &&
      (b.endDate as string) > (b.date as string),
  );
  return flight ? anchorFromFlightArrival(flight) : null;
}
