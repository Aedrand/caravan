import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Schema contract (plan §3.2). Tables land additively, feature by feature;
 * M0.3 establishes the rails with instance settings + trips. Timestamps are
 * integer epoch-ms, money will be integer minor units, IDs are random
 * 128-bit hex strings (TD-3).
 */

export const instanceSettings = sqliteTable("instance_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  destination: text("destination"),
  /** ISO yyyy-mm-dd local dates; itinerary days derive from these (PD-1). */
  startDate: text("start_date"),
  endDate: text("end_date"),
  /** ISO 4217; single currency per trip in v1 (PD-8). */
  currency: text("currency").notNull().default("USD"),
  /** Per-trip monotonic version — the sync/feed cursor (TD-1). */
  version: integer("version").notNull().default(0),
  archivedAt: integer("archived_at"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
