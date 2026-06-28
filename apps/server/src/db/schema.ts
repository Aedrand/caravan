import {
  ACTIVITY_CATEGORIES,
  ACTOR_TYPES,
  ENTITY_TYPES,
  EXPENSE_CATEGORIES,
  ITEM_TYPES,
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
  /** Optional recipient an invite was sent to (D.1); null for share-link invites. */
  email: text("email"),
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
    /**
     * Trip Workspace v2 typed-item discriminator (D1). NOT NULL with a default
     * so every existing row back-fills to `activity`. `flight`/`lodging` are
     * forward-compat enum values; their columns + create path land in V2.4.
     */
    type: text("type", { enum: ITEM_TYPES }).notNull().default("activity"),
    /** D7 planning figure, minor units. Nullable: null = no estimate, distinct from 0 = free. */
    estimatedCostMinor: integer("estimated_cost_minor"),
    /** D10 idea-list membership; SET NULL on list delete → the idea falls to "Unlisted". */
    listId: text("list_id").references(() => ideaLists.id, { onDelete: "set null" }),
    /** D1 checklist body: JSON-encoded ChecklistItem[]; null for non-checklist rows. */
    checklistItems: text("checklist_items"),
    /** Membership id of the creator. */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("activities_trip_date").on(t.tripId, t.date)],
);

// ---------------------------------------------------------------------------
// Trip Workspace v2 — first-class days (D2) + idea lists (D10). Additive: the
// calendar still derives day cells from the trip range; a `days` row exists
// only to hold per-day metadata, created lazily by `day.upsert`. Idea lists are
// named buckets for Ideas-pool items (activities.listId).
// ---------------------------------------------------------------------------

/** Per-day metadata (D2). Surrogate id PK + unique (tripId,date) — the lazy key. */
export const days = sqliteTable(
  "days",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** ISO yyyy-mm-dd local date — the `(tripId, date)` lazy key. */
    date: text("date").notNull(),
    /** The only metadata in V2.2; routeMode/cover/pinned-note land later. */
    subtitle: text("subtitle"),
    /** Membership id of the creator (no FK — history outlives roles, PD-9). */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("days_trip_date").on(t.tripId, t.date)],
);

/** Named Ideas-pool buckets (D10); `position` is a fractional ordering key (TD-1). */
export const ideaLists = sqliteTable(
  "idea_lists",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: text("position").notNull(),
    /** Membership id of the creator (no FK — history outlives roles, PD-9). */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idea_lists_trip").on(t.tripId)],
);

/**
 * Geocode response cache (TD-5, Track C). Keyed by `<op>:<normalized query>`,
 * stores the normalized GeoPlace[] JSON the proxy returned. Nominatim *requires*
 * caching; for Photon it cuts load on the donated public instance. Rows carry
 * an `expiresAt` so the proxy can treat stale entries as misses.
 */
export const geocodeCache = sqliteTable("geocode_cache", {
  /** `<provider>:<op>:<normalized key>` — op is `search` | `reverse`. */
  key: text("key").primaryKey(),
  /** JSON-encoded normalized GeoPlace[] (search) or GeoPlace|null (reverse). */
  value: text("value").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

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

// ---------------------------------------------------------------------------
// Track A — group decisions (votes / polls / comments). Additive tables only;
// migrations are generated centrally at integration (anti-collision rule 1).
// ---------------------------------------------------------------------------

/** A single positive "I'm in" per member per activity (PD-2). */
export const activityVotes = sqliteTable(
  "activity_votes",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    /** Membership id of the voter. */
    memberId: text("member_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    // One vote per member per activity — the toggle's invariant (PD-2).
    uniqueIndex("activity_votes_activity_member").on(t.activityId, t.memberId),
    index("activity_votes_trip").on(t.tripId),
  ],
);

/** Flat comment streams on an activity or a poll (PD-4). */
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** Polymorphic target: "activity" | "poll" (no FK — target lives in either table). */
    targetType: text("target_type", { enum: ["activity", "poll"] }).notNull(),
    targetId: text("target_id").notNull(),
    /** Membership id of the author. */
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
    /** Null until first edited (PD-4). */
    editedAt: integer("edited_at"),
  },
  (t) => [index("comments_trip_target").on(t.tripId, t.targetType, t.targetId)],
);

/** Open questions that aren't activity-shaped (PD-3). */
export const polls = sqliteTable(
  "polls",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    multiSelect: integer("multi_select", { mode: "boolean" }).notNull().default(false),
    allowMemberOptions: integer("allow_member_options", { mode: "boolean" })
      .notNull()
      .default(true),
    /** Membership id of the creator (creator or owner may close). */
    createdBy: text("created_by").notNull(),
    closesAt: integer("closes_at"),
    closedAt: integer("closed_at"),
    /** Set when the winning option is converted to an activity (A.3). */
    convertedActivityId: text("converted_activity_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("polls_trip").on(t.tripId)],
);

export const pollOptions = sqliteTable(
  "poll_options",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Membership id of whoever added the option. */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("poll_options_poll").on(t.pollId)],
);

export const pollVotes = sqliteTable(
  "poll_votes",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    /** Membership id of the voter (visible — PD-3). */
    memberId: text("member_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    // One vote per member per OPTION; multi-select is many such rows per poll.
    uniqueIndex("poll_votes_option_member").on(t.optionId, t.memberId),
    index("poll_votes_poll").on(t.pollId),
  ],
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

// ---------------------------------------------------------------------------
// Track D — notifications (email backbone D.1/D.2). Per-user delivery prefs;
// the digest reads digestEnabled to decide who gets the daily batch.
// ---------------------------------------------------------------------------

/**
 * Per-user notification preferences (D.2). One row per Better Auth user; the
 * absence of a row means "all defaults" (digest on), so writers upsert lazily.
 */
export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Opt-out flag for the daily digest email; defaults on. */
  digestEnabled: integer("digest_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});
