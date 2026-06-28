import type { Activity } from "@caravan/shared";

/** All dates here are calendar-local ISO `YYYY-MM-DD`; parse without timezone drift. */
function parseIso(iso: string): Date {
  return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextDay(iso: string): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + 1);
  return toIso(date);
}

/** Whole calendar days from `a` to `b` (negative if b precedes a). */
export function daysBetween(a: string, b: string): number {
  const ua = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const ub = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round((ub - ua) / 86_400_000);
}

/**
 * The day buckets for a trip: every date in the start..end range, unioned with
 * any dated activity that falls outside it (PD-1 — days are derived, not stored).
 */
export function deriveDays(
  startDate: string | null,
  endDate: string | null,
  activities: Activity[],
): string[] {
  const days = new Set<string>();
  if (startDate && endDate && startDate <= endDate) {
    // Bounded walk; the <= comparison on zero-padded ISO is safe and ordered.
    for (let d = startDate, guard = 0; d <= endDate && guard < 2000; d = nextDay(d), guard++) {
      days.add(d);
    }
  } else if (startDate) {
    days.add(startDate);
  }
  for (const a of activities) if (a.date) days.add(a.date);
  return [...days].sort();
}

/** "Friday, May 1st" — full weekday + month + ordinal day (a day's headline label). */
export function formatDayLabel(iso: string): string {
  const date = parseIso(iso);
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = date.toLocaleDateString(undefined, { month: "long" });
  return `${weekday}, ${month} ${ordinal(date.getDate())}`;
}

/** English ordinal: 1→"1st", 2→"2nd", 3→"3rd", 11–13→"th", 21→"21st"… */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Mon 23" — compact, for the day-jump rail chips. */
export function formatDayShort(iso: string): string {
  return parseIso(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

/** Today as a calendar-local ISO `YYYY-MM-DD` (matches the day-bucket keys). */
export function todayIso(): string {
  return toIso(new Date());
}

/** 1-based day number relative to the trip start, or null if before it / undated trip. */
export function dayNumber(iso: string, startDate: string | null): number | null {
  if (!startDate) return null;
  const diff = daysBetween(startDate, iso);
  return diff >= 0 ? diff + 1 : null;
}

/** "9am", "9:30am", "1pm" — friendly, lowercase, no leading zero (design voice). */
export function formatTime(hhmm: string): string {
  const hour = Number(hhmm.slice(0, 2));
  const minutes = hhmm.slice(3, 5);
  const period = hour < 12 ? "am" : "pm";
  const h12 = ((hour + 11) % 12) + 1;
  return minutes === "00" ? `${h12}${period}` : `${h12}:${minutes}${period}`;
}

export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  if (start) return formatTime(start);
  if (end) return `until ${formatTime(end)}`;
  return null;
}

/** A Google Maps search link-out for a place (link-outs are the only booking story, PD-12). */
export function mapsSearchUrl(name: string, address: string | null): string {
  const query = encodeURIComponent(address ? `${name}, ${address}` : name);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
