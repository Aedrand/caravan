/**
 * Money formatting + parsing for Track B. Amounts are integer minor units
 * (cents) everywhere; we only ever convert at the display/input boundary, never
 * for arithmetic. Single currency per trip (PD-8).
 */

/** Minor-unit exponent per currency — the common cases; defaults to 2. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "XAF", "XOF"]);
const THREE_DECIMAL = new Set(["BHD", "KWD", "OMR", "TND", "IQD", "JOD", "LYD"]);

export function currencyExponent(currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

/** Format minor units as a localized currency string ("$12.34"). */
export function formatMoney(amountMinor: number, currency: string): string {
  const exp = currencyExponent(currency);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      amountMinor / 10 ** exp,
    );
  } catch {
    // Unknown ISO code — fall back to a plain number with the code suffix.
    return `${(amountMinor / 10 ** exp).toFixed(exp)} ${currency}`;
  }
}

/**
 * Parse a user-typed major-unit amount (e.g. "12.34") into integer minor units,
 * or null if it isn't a valid positive amount. Rounds to the currency's
 * precision so float artifacts never reach the wire.
 */
export function parseMoney(input: string, currency: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed === "" || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  const exp = currencyExponent(currency);
  return Math.round(value * 10 ** exp);
}

/** Minor units → an editable major-unit string for form inputs. */
export function minorToInput(amountMinor: number, currency: string): string {
  const exp = currencyExponent(currency);
  if (exp === 0) return String(amountMinor);
  return (amountMinor / 10 ** exp).toFixed(exp);
}
