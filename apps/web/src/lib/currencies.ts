/**
 * Single currency per trip (PD-8) — a curated ISO 4217 shortlist for v1.
 * Shared by the create-trip dialog and the trip-settings dialog so both
 * currency selects offer the same options.
 */
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "MXN",
  "BRL",
  "INR",
  "SGD",
  "HKD",
] as const;
