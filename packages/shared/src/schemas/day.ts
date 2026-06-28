import { z } from "zod";
import { EpochMsSchema, IdSchema, IsoDateSchema } from "./common";

/**
 * A first-class itinerary day (D2, Trip Workspace v2). The calendar still
 * derives day cells from the trip date range; a `days` row exists only to hold
 * per-day metadata. Rows are created lazily by `day.upsert`, keyed by
 * `(tripId, date)`. V2.2 carries `subtitle` only — `routeMode`, cover image,
 * and pinned note land later as additive nullable fields.
 */
export const DaySchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  /** ISO yyyy-mm-dd — the lazy `(tripId, date)` key. */
  date: IsoDateSchema,
  subtitle: z.string().nullable(),
  /** Membership id of the creator (no FK — history outlives roles, PD-9). */
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});
export type Day = z.infer<typeof DaySchema>;
