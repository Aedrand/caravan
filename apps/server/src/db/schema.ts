import {
  ACTIVITY_CATEGORIES,
  ACTOR_TYPES,
  ENTITY_TYPES,
  EXPENSE_CATEGORIES,
  MEMBER_STATUSES,
  TRIP_ROLES,
} from "@caravan/shared";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

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

export const tripMembers = sqliteTable(
  "trip_members",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role", { enum: TRIP_ROLES }).notNull(),
    /** Ghosts: left/removed members whose history must survive (PD-9). */
    status: text("status", { enum: MEMBER_STATUSES }).notNull().default("active"),
    /** Per-trip personal-AI write opt-in (PD-11). */
    aiWriteEnabled: integer("ai_write_enabled", { mode: "boolean" }).notNull().default(false),
    /** Feed catch-up cursor for unread markers (PD-7). */
    lastSeenVersion: integer("last_seen_version").notNull().default(0),
    joinedAt: integer("joined_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("trip_members_trip_user").on(t.tripId, t.userId)],
);

export const inviteLinks = sqliteTable("invite_links", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  /** sha256 of the raw token — the token itself is returned once, never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  role: text("role", { enum: ["editor", "viewer"] })
    .notNull()
    .default("editor"),
  expiresAt: integer("expires_at"),
  revokedAt: integer("revoked_at"),
  /** Membership id of the creator (no FK by design — history outlives roles). */
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** null = the Ideas pool (PD-2). */
    date: text("date"),
    /** Fractional ordering key within (trip, date|ideas) — LWW on conflict (TD-1). */
    position: text("position").notNull(),
    title: text("title").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    placeName: text("place_name"),
    address: text("address"),
    lat: real("lat"),
    lng: real("lng"),
    placeProvider: text("place_provider"),
    placeRef: text("place_ref"),
    category: text("category", { enum: ACTIVITY_CATEGORIES }).notNull().default("other"),
    notes: text("notes").notNull().default(""),
    linkUrl: text("link_url"),
    /** Membership id of the creator. */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("activities_trip_date").on(t.tripId, t.date)],
);

/**
 * One row per mutation (TD-1): the activity feed, the sync catch-up log, and
 * the attribution record are the same table. The PK is the client-generated
 * mutation id — the INSERT itself is the idempotency check.
 */
export const feedEvents = sqliteTable(
  "feed_events",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull().default("user"),
    actorMemberId: text("actor_member_id"),
    type: text("type").notNull(),
    entityType: text("entity_type", { enum: ENTITY_TYPES }).notNull(),
    entityId: text("entity_id").notNull(),
    /** JSON FeedPayloadMap[type] — the render snapshot. */
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("feed_events_trip_version").on(t.tripId, t.version)],
);

/**
 * Track B — expenses & settlement (PD-8). Money is integer minor units; a
 * single currency per trip lives on `trips.currency`. An expense's shares (one
 * row per participant in `expense_shares`) always sum to `amount_minor`.
 * `paid_by`, `created_by`, and share `member_id` are trip MEMBERSHIP ids (no FK
 * — history outlives membership rows the way other features do), so ghosts
 * (PD-9) keep their balances after leaving.
 */
export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** Membership id of the payer (who fronted the money). */
    paidBy: text("paid_by").notNull(),
    /** Total in minor units; strictly positive (enforced in the mutation). */
    amountMinor: integer("amount_minor").notNull(),
    description: text("description").notNull(),
    category: text("category", { enum: EXPENSE_CATEGORIES }).notNull().default("other"),
    notes: text("notes").notNull().default(""),
    /** Optional itinerary linkage (PD-8). */
    date: text("date"),
    activityId: text("activity_id"),
    /** Membership id of the creator (edit/delete permission rule). */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("expenses_trip").on(t.tripId)],
);

export const expenseShares = sqliteTable(
  "expense_shares",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    /** Membership id of the participant (ghosts included — PD-9). */
    memberId: text("member_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
  },
  (t) => [
    index("expense_shares_expense").on(t.expenseId),
    uniqueIndex("expense_shares_expense_member").on(t.expenseId, t.memberId),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** Membership id of the payer (debtor settling up). */
    fromMember: text("from_member").notNull(),
    /** Membership id of the recipient (creditor). */
    toMember: text("to_member").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    notes: text("notes").notNull().default(""),
    date: text("date"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("payments_trip").on(t.tripId)],
);
