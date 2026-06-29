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

/**
 * The D1 typed-item discriminator (Trip Workspace v2). An activity row is one
 * of these "items": a scheduled stop (`activity`, the default + back-fill),
 * a free-text `note` (body reuses the `notes` column), a `checklist`
 * (`checklistItems` JSON), or a `flight`/`lodging` booking. The booking
 * variants are forward-compat only in V2.2 — their columns and the create path
 * land in V2.4, and creating one is guarded until then (see mutations.ts).
 */
export const ITEM_TYPES = ["activity", "note", "checklist", "flight", "lodging"] as const;
export const ItemTypeSchema = z.enum(ITEM_TYPES);
export type ItemType = z.infer<typeof ItemTypeSchema>;

/**
 * One checklist entry (D1). Items carry a stable client-generated id so a
 * `checklist.toggle` addresses the entry directly (index-shift-safe), letting
 * concurrent toggles of different items converge instead of clobbering.
 */
export const ChecklistItemSchema = z.strictObject({
  id: IdSchema,
  text: z.string().trim().min(1).max(500),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

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
  /** D1 discriminator; existing rows back-fill to `activity`. */
  type: ItemTypeSchema,
  /** D7 planning figure, minor units (trip currency). `null` = no estimate (distinct from `0`). */
  estimatedCostMinor: z.number().int().nonnegative().nullable(),
  /** D10 idea-list membership; `null` = Unlisted / not an idea-list member. */
  listId: IdSchema.nullable(),
  /** D1 checklist body; `null` for non-checklist items. */
  checklistItems: z.array(ChecklistItemSchema).nullable(),
  // V2.4 booking fields (flight/lodging). All nullable — only booking rows
  // populate them. `endDate` is the check-out (lodging) / arrival (flight) date;
  // the `arr*` fields are a FLIGHT's arrival place (place* holds departure/lodging).
  endDate: IsoDateSchema.nullable(),
  confirmationCode: z.string().max(100).nullable(),
  arrPlaceName: z.string().max(200).nullable(),
  arrAddress: z.string().max(400).nullable(),
  arrLat: z.number().nullable(),
  arrLng: z.number().nullable(),
  arrPlaceProvider: z.string().max(40).nullable(),
  arrPlaceRef: z.string().max(200).nullable(),
  flightNumber: z.string().max(20).nullable(),
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});
export type Activity = z.infer<typeof ActivitySchema>;
