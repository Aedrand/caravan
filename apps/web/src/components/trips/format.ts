/**
 * Date display helpers for trips. Itinerary dates are local calendar dates
 * ("yyyy-mm-dd", PD-1) — always parse by components: `new Date(string)` would
 * read them as UTC midnight and shift a day in western timezones.
 */

export function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function monthShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function monthDayYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Compact range: "Jul 4 – 12, 2026", "Jul 28 – Aug 2, 2026",
 * "Dec 30, 2026 – Jan 4, 2027"; single/partial dates "Jul 4, 2026";
 * nothing set → "Dates TBD".
 */
export function formatTripDates(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "Dates TBD";
  if (!startDate || !endDate || startDate === endDate) {
    return monthDayYear(parseLocalDate((startDate ?? endDate) as string));
  }

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${monthDayYear(start)} – ${monthDayYear(end)}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${monthShort(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${monthShort(start)} ${start.getDate()} – ${monthShort(end)} ${end.getDate()}, ${end.getFullYear()}`;
}
