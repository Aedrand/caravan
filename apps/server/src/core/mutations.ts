import type {
  ActorType,
  EntityPostImage,
  EntityType,
  FeedEvent,
  FeedPayloadMap,
  Mutation,
  MutationPayload,
  MutationResponse,
  MutationType,
  Role,
} from "@caravan/shared";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { hasRole } from "./permissions";
import {
  serializeActivity,
  serializeExpense,
  serializeInvite,
  serializeMember,
  serializePayment,
  serializeTrip,
} from "./serialize";

/**
 * The mutation pipeline (TD-1, plan §3.3): validate → authorize → apply +
 * feed event + version bump in ONE transaction → broadcast. Every write to
 * shared trip data goes through here — browsers, house AI, and personal AI
 * alike — which is what makes permissions, attribution, and audit single-path.
 */

export class MutationError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MutationError";
  }
}

/** Who is acting. AI actors carry the asking member's membership (PD-11). */
export interface Actor {
  userId: string;
  type: ActorType;
}

type TripRow = typeof schema.trips.$inferSelect;
type MemberRow = typeof schema.tripMembers.$inferSelect;

/** Drizzle's transaction handle type, extracted from the Db signature. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface MutationCtx {
  /** Transaction-scoped database handle — all writes are atomic with the feed event. */
  tx: Tx;
  trip: TripRow;
  member: MemberRow;
  actor: Actor;
  now: number;
}

export interface ApplyOutcome<T extends MutationType> {
  entityType: EntityType;
  entityId: string;
  feedPayload: FeedPayloadMap[T];
  /** Private extras returned to the caller only — never broadcast (e.g. invite tokens). */
  result?: unknown;
}

interface MutationHandler<T extends MutationType> {
  /** Minimum role; finer rules live in apply() and throw MutationError. */
  role: Role;
  /** Permit on archived trips (only trip.unarchive should). */
  allowArchived?: boolean;
  apply: (ctx: MutationCtx, payload: MutationPayload<T>) => ApplyOutcome<T>;
}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry; types are enforced at registration via the generic signature
const handlers = new Map<MutationType, MutationHandler<any>>();

export function registerMutation<T extends MutationType>(
  type: T,
  handler: MutationHandler<T>,
): void {
  if (handlers.has(type)) throw new Error(`mutation handler "${type}" already registered`);
  handlers.set(type, handler);
}

export interface ExecuteDeps {
  db: Db;
  /** Called after commit with the recorded event + post-image (WS fan-out — M1.3). */
  broadcast?: (tripId: string, event: FeedEvent, entity: EntityPostImage | null) => void;
}

/**
 * Post-image of the event's entity, read inside the same transaction so it is
 * consistent with the version bump. Null = the entity no longer exists.
 */
function readPostImage(tx: Tx, entityType: EntityType, entityId: string): EntityPostImage | null {
  switch (entityType) {
    case "trip": {
      const row = tx.select().from(schema.trips).where(eq(schema.trips.id, entityId)).get();
      return row ? serializeTrip(row) : null;
    }
    case "activity": {
      const row = tx
        .select()
        .from(schema.activities)
        .where(eq(schema.activities.id, entityId))
        .get();
      return row ? serializeActivity(row) : null;
    }
    case "member": {
      const row = tx
        .select({ member: schema.tripMembers, userName: schema.user.name })
        .from(schema.tripMembers)
        .innerJoin(schema.user, eq(schema.user.id, schema.tripMembers.userId))
        .where(eq(schema.tripMembers.id, entityId))
        .get();
      return row ? serializeMember(row.member, row.userName) : null;
    }
    case "invite": {
      const row = tx
        .select()
        .from(schema.inviteLinks)
        .where(eq(schema.inviteLinks.id, entityId))
        .get();
      return row ? serializeInvite(row) : null;
    }
    case "expense": {
      const row = tx.select().from(schema.expenses).where(eq(schema.expenses.id, entityId)).get();
      if (!row) return null;
      const shareRows = tx
        .select()
        .from(schema.expenseShares)
        .where(eq(schema.expenseShares.expenseId, entityId))
        .all();
      return serializeExpense(row, shareRows);
    }
    case "payment": {
      const row = tx.select().from(schema.payments).where(eq(schema.payments.id, entityId)).get();
      return row ? serializePayment(row) : null;
    }
  }
}

export function executeMutation(
  deps: ExecuteDeps,
  args: { tripId: string; actor: Actor; mutation: Mutation },
): MutationResponse {
  const { tripId, actor, mutation } = args;
  const handler = handlers.get(mutation.type);
  if (!handler) throw new MutationError(400, "unknown_mutation", `no handler: ${mutation.type}`);

  const now = Date.now();

  const response = deps.db.transaction((tx): MutationResponse => {
    // Idempotency: the feed event PK is the mutation id. A replay returns the
    // originally recorded outcome without re-applying anything.
    const existing = tx
      .select()
      .from(schema.feedEvents)
      .where(eq(schema.feedEvents.id, mutation.id))
      .get();
    if (existing) {
      if (existing.tripId !== tripId) {
        throw new MutationError(409, "mutation_id_reused", "mutation id used on another trip");
      }
      return {
        version: existing.version,
        event: rowToEvent(existing),
        entity: readPostImage(tx, existing.entityType, existing.entityId),
      };
    }

    const trip = tx.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
    if (!trip) throw new MutationError(404, "trip_not_found", "trip not found");

    const member = tx
      .select()
      .from(schema.tripMembers)
      .where(
        and(
          eq(schema.tripMembers.tripId, tripId),
          eq(schema.tripMembers.userId, actor.userId),
          eq(schema.tripMembers.status, "active"),
        ),
      )
      .get();
    if (!member) throw new MutationError(403, "not_a_member", "you are not a member of this trip");

    if (trip.archivedAt !== null && !handler.allowArchived) {
      throw new MutationError(409, "trip_archived", "this trip is archived (read-only)");
    }
    if (!hasRole(member.role, handler.role)) {
      throw new MutationError(403, "insufficient_role", `requires ${handler.role} role`);
    }

    const outcome = handler.apply({ tx, trip, member, actor, now }, mutation.payload);

    const version = trip.version + 1;
    tx.update(schema.trips)
      .set({ version, updatedAt: now })
      .where(eq(schema.trips.id, tripId))
      .run();

    const event: FeedEvent = {
      id: mutation.id,
      tripId,
      version,
      actorType: actor.type,
      actorMemberId: member.id,
      type: mutation.type,
      entityType: outcome.entityType,
      entityId: outcome.entityId,
      payload: outcome.feedPayload,
      createdAt: now,
    };
    tx.insert(schema.feedEvents)
      .values({ ...event, payload: JSON.stringify(outcome.feedPayload) })
      .run();

    const entity = readPostImage(tx, outcome.entityType, outcome.entityId);
    return { version, event, entity, result: outcome.result };
  });

  deps.broadcast?.(tripId, response.event, response.entity);
  return response;
}

function rowToEvent(row: typeof schema.feedEvents.$inferSelect): FeedEvent {
  return { ...row, payload: JSON.parse(row.payload) as unknown };
}

/** Catch-up reads (plan §3.3): events after a version, oldest first. */
export function eventsSince(db: Db, tripId: string, since: number, limit = 500): FeedEvent[] {
  return db
    .select()
    .from(schema.feedEvents)
    .where(and(eq(schema.feedEvents.tripId, tripId), gt(schema.feedEvents.version, since)))
    .orderBy(asc(schema.feedEvents.version))
    .limit(limit)
    .all()
    .map(rowToEvent);
}

/** Feed reads (PD-7): events newest first, optionally older than `before`. */
export function eventsBefore(
  db: Db,
  tripId: string,
  before: number | null,
  limit: number,
): FeedEvent[] {
  return db
    .select()
    .from(schema.feedEvents)
    .where(
      and(
        eq(schema.feedEvents.tripId, tripId),
        before === null ? undefined : lt(schema.feedEvents.version, before),
      ),
    )
    .orderBy(desc(schema.feedEvents.version))
    .limit(limit)
    .all()
    .map(rowToEvent);
}
