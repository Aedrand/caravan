import type {
  Activity,
  EntityPostImage,
  FeedEvent,
  Mutation,
  Place,
  Trip,
  TripMember,
  TripSnapshot,
} from "./shared";

/**
 * Pure snapshot reducers (plan §3.4). The SAME functions reconcile WS event
 * frames, POST /mutations responses, and optimistic local writes, so the
 * cache converges no matter which path delivers a change first. No React,
 * no IO — fully unit-testable.
 */

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  return list.map((x, i) => (i === idx ? item : x));
}

/** Activity place columns from a payload `place` — `null` clears all six. */
function flattenPlace(place: Place | null) {
  return {
    placeName: place?.name ?? null,
    address: place?.address ?? null,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    placeProvider: place?.provider ?? null,
    placeRef: place?.ref ?? null,
  };
}

/** Drop keys whose value is `undefined` so optional patch keys never clobber state. */
function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function updateActivity(
  snap: TripSnapshot,
  activityId: string,
  update: (activity: Activity) => Activity,
): TripSnapshot {
  const idx = snap.activities.findIndex((a) => a.id === activityId);
  const existing = snap.activities[idx];
  if (!existing) return snap;
  const activities = snap.activities.map((a, i) => (i === idx ? update(existing) : a));
  return { ...snap, activities };
}

/**
 * Fold a confirmed feed event (+ refined post-image) into a snapshot.
 * Immutable: returns a new snapshot, or the input unchanged for stale events.
 *
 * Precondition: `entity` was refined with
 * `entityPostImageSchemas[event.entityType]` (or is null for deletes), which
 * is what makes the per-entityType casts safe.
 */
export function applyEvent(
  snap: TripSnapshot,
  event: FeedEvent,
  entity: EntityPostImage | null,
): TripSnapshot {
  // Stale or duplicate — including the WS echo of an event that was already
  // reconciled via the POST response. The version watermark makes this safe.
  if (event.version <= snap.trip.version) return snap;

  switch (event.entityType) {
    case "trip":
      // Trip post-images already carry the bumped version.
      return entity ? { ...snap, trip: entity as Trip } : snap;
    case "activity": {
      const trip = { ...snap.trip, version: event.version };
      const activities = entity
        ? upsertById(snap.activities, entity as Activity)
        : snap.activities.filter((a) => a.id !== event.entityId);
      return { ...snap, trip, activities };
    }
    case "member": {
      const trip = { ...snap.trip, version: event.version };
      let members = entity ? upsertById(snap.members, entity as TripMember) : snap.members;
      // Ownership transfer is one event with the NEW owner's post-image; the
      // server demoted the old owner to editor in the same transaction —
      // mirror that here so the cache never shows two owners.
      if (event.type === "trip.transferOwnership" && entity) {
        members = members.map((m) =>
          m.id !== entity.id && m.role === "owner" ? { ...m, role: "editor" } : m,
        );
      }
      return { ...snap, trip, members };
    }
    case "invite":
    case "expense":
    case "payment":
      // The snapshot holds no invites or money — those live in their own
      // queries (Track B's `money` query refetches on these events). Only
      // advance the version watermark so the feed/catch-up stays consistent.
      return { ...snap, trip: { ...snap.trip, version: event.version } };
  }
}

/**
 * Optimistically fold a local mutation into a snapshot. Immutable, and NEVER
 * bumps `trip.version` — versions are server-authoritative, and keeping the
 * watermark untouched is what lets the confirmed event (POST response or WS
 * echo) apply cleanly on top.
 */
export function applyMutationOptimistic(
  snap: TripSnapshot,
  mutation: Mutation,
  ctx: { memberId: string; now: number },
): TripSnapshot {
  switch (mutation.type) {
    case "activity.create": {
      const p = mutation.payload;
      const activity: Activity = {
        id: p.activityId,
        tripId: snap.trip.id,
        date: p.date,
        position: p.position,
        title: p.title,
        startTime: p.startTime,
        endTime: p.endTime,
        ...flattenPlace(p.place),
        category: p.category,
        notes: p.notes,
        linkUrl: p.linkUrl,
        createdBy: ctx.memberId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      };
      return { ...snap, activities: [...snap.activities, activity] };
    }
    case "activity.update": {
      const { place, ...fields } = mutation.payload.patch;
      return updateActivity(snap, mutation.payload.activityId, (activity) => ({
        ...activity,
        ...definedOnly(fields),
        // `place` present (object or null) replaces all six columns; absent leaves them.
        ...(place !== undefined ? flattenPlace(place) : undefined),
        updatedAt: ctx.now,
      }));
    }
    case "activity.move": {
      const { payload } = mutation;
      return updateActivity(snap, payload.activityId, (activity) => ({
        ...activity,
        date: payload.date,
        position: payload.position,
        updatedAt: ctx.now,
      }));
    }
    case "activity.delete": {
      const activities = snap.activities.filter((a) => a.id !== mutation.payload.activityId);
      return activities.length === snap.activities.length ? snap : { ...snap, activities };
    }
    case "trip.update":
      return {
        ...snap,
        trip: { ...snap.trip, ...definedOnly(mutation.payload), updatedAt: ctx.now },
      };
    case "trip.archive":
      return { ...snap, trip: { ...snap.trip, archivedAt: ctx.now } };
    case "trip.unarchive":
      return { ...snap, trip: { ...snap.trip, archivedAt: null } };
    // Member/invite/ownership flows land in M1.5 — no optimistic guess; the
    // confirmed event updates the cache.
    case "trip.transferOwnership":
    case "member.leave":
    case "member.remove":
    case "member.setRole":
    case "invite.create":
    case "invite.revoke":
    // Expenses & payments (Track B) live outside the snapshot in their own
    // `money` query, which refetches on the confirmed feed event — no
    // snapshot-level optimistic guess.
    case "expense.create":
    case "expense.update":
    case "expense.delete":
    case "payment.create":
    case "payment.delete":
      return snap;
  }
}
