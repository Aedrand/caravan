import type { SplitSpec } from "./mutations";
import type { ExpenseShare } from "./schemas/expense";

/**
 * Materialize the per-participant shares of an expense from a SplitSpec (PD-8).
 * Pure, integer-only — minor units (cents) throughout, never a float.
 *
 * Shared by the server (authoritative, on every expense.create/update) and the
 * client (optimistic preview), so both compute byte-identical shares. The
 * server is still the source of truth; this just guarantees they agree.
 */

export class SplitError extends Error {
  constructor(
    readonly code: "no_participants" | "nonpositive_total" | "exact_mismatch" | "duplicate_member",
    message: string,
  ) {
    super(message);
    this.name = "SplitError";
  }
}

function assertUnique(memberIds: string[]): void {
  if (new Set(memberIds).size !== memberIds.length) {
    throw new SplitError("duplicate_member", "a member appears twice in the split");
  }
}

/**
 * Split `amountMinor` equally among `memberIds`, distributing the rounding
 * remainder by the largest-remainder method with a STABLE tiebreak (input
 * order). The first `remainder` members each get one extra minor unit, so the
 * shares always sum back to exactly `amountMinor`.
 *
 * Example: 1000¢ / 3 = 333,333,334 → [334, 333, 333].
 */
export function splitEqual(amountMinor: number, memberIds: string[]): ExpenseShare[] {
  if (memberIds.length === 0) {
    throw new SplitError("no_participants", "an expense needs at least one participant");
  }
  assertUnique(memberIds);

  const n = memberIds.length;
  const base = Math.floor(amountMinor / n);
  const remainder = amountMinor - base * n; // 0..n-1, always non-negative for amount >= 0

  return memberIds.map((memberId, i) => ({
    memberId,
    amountMinor: base + (i < remainder ? 1 : 0),
  }));
}

/**
 * Resolve a SplitSpec into concrete shares, validating against the expense
 * total. Throws SplitError on any inconsistency — the server maps these to a
 * 400. `equal` rounds via splitEqual; `exact` must sum to the total exactly.
 */
export function resolveSplit(amountMinor: number, split: SplitSpec): ExpenseShare[] {
  if (amountMinor <= 0) {
    throw new SplitError("nonpositive_total", "expense total must be positive");
  }

  if (split.kind === "equal") {
    return splitEqual(amountMinor, split.memberIds);
  }

  // exact
  if (split.shares.length === 0) {
    throw new SplitError("no_participants", "an expense needs at least one participant");
  }
  assertUnique(split.shares.map((s) => s.memberId));
  const sum = split.shares.reduce((acc, s) => acc + s.amountMinor, 0);
  if (sum !== amountMinor) {
    throw new SplitError(
      "exact_mismatch",
      `custom shares sum to ${sum} but the total is ${amountMinor}`,
    );
  }
  // Drop zero-amount participants — they carry no balance and only add noise.
  return split.shares.filter((s) => s.amountMinor > 0).map((s) => ({ ...s }));
}
