import { z } from "zod";
import { EpochMsSchema, HhMmSchema, IdSchema, IsoDateSchema, PositionSchema } from "./common";

export const ACTIVITY_CATEGORIES = [
  "food",
  "sights",
  "activity",
  "transport",
  "lodging",
  "shopping",
  "other",
] as const;
export const ActivityCategorySchema = z.enum(ACTIVITY_CATEGORIES);
export type ActivityCategory = z.infer<typeof ActivityCategorySchema>;

/** A real place behind an activity — optional; freeform location is normal (PD-1/TD-5). */
export const PlaceSchema = z.strictObject({
  name: z.string().min(1).max(200),
  address: z.string().max(400).optional(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  provider: z.string().max(40).optional(),
  ref: z.string().max(200).optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const ActivitySchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  /** `null` = the Ideas pool; promoting an idea = giving it a date (PD-2). */
  date: IsoDateSchema.nullable(),
  position: PositionSchema,
  title: z.string().min(1).max(200),
  startTime: HhMmSchema.nullable(),
  endTime: HhMmSchema.nullable(),
  placeName: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  placeProvider: z.string().nullable(),
  placeRef: z.string().nullable(),
  category: ActivityCategorySchema,
  notes: z.string().max(5000),
  /** Booking/reference link — link-outs are the only booking story (PD-12). */
  linkUrl: z.url().nullable(),
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});
export type Activity = z.infer<typeof ActivitySchema>;
