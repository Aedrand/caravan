import { z } from "zod";
import { ID_PATTERN } from "../id";

/** Shared wire-format primitives (TD-3 conventions). */

export const IdSchema = z.string().regex(ID_PATTERN, "expected a 32-char hex id");

/** Milliseconds since epoch — the only timestamp unit on the wire. */
export const EpochMsSchema = z.number().int().nonnegative();

/** Local calendar date, `yyyy-mm-dd` (itinerary days — PD-1). */
export const IsoDateSchema = z.iso.date();

/** Local clock time, `HH:MM` 24h. */
export const HhMmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

/** ISO 4217 alpha code (single currency per trip — PD-8). */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "expected an ISO 4217 code");

/**
 * Fractional-index ordering key (TD-1). Generated client-side between
 * neighbors; the server validates shape only — concurrent moves resolve by
 * last-write-wins on the column, which is the designed semantics.
 */
export const PositionSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[0-9A-Za-z]+$/, "expected a base62 ordering key");
