import type {
  Activity,
  ActivityVote,
  Comment,
  Day,
  EntityPostImage,
  FeedEvent,
  IdeaList,
  Mutation,
  Place,
  PollWithDetails,
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
    case "vote": {
      const trip = { ...snap.trip, version: event.version };
      // Cast = upsert the vote row; retract = drop the (now-deleted) vote by id.
      const votes = entity
        ? upsertById(snap.votes, entity as ActivityVote)
        : snap.votes.filter((v) => v.id !== event.entityId);
      return { ...snap, trip, votes };
    }
    case "comment": {
      const trip = { ...snap.trip, version: event.version };
      const comments = entity
        ? upsertById(snap.comments, entity as Comment)
        : snap.comments.filter((c) => c.id !== event.entityId);
      return { ...snap, trip, comments };
    }
    case "poll": {
      const trip = { ...snap.trip, version: event.version };
      const poll = entity as PollWithDetails | null;
      if (!poll) {
        // Polls aren't hard-deleted in v1, but stay defensive.
        return { ...snap, trip, polls: snap.polls.filter((p) => p.id !== event.entityId) };
      }
      const polls = upsertById(snap.polls, poll);
      // poll.convert spawns an Ideas-pool activity; the poll post-image carries
      // its id + winning label, so synthesize the card here rather than wait for
      // a refetch (keeps the itinerary + polls panel consistent in one event).
      const activities = applyPollConversion(snap.activities, poll, event);
      return { ...snap, trip, polls, activities };
    }
    // Trip Workspace v2 — days (D2) + idea lists (D10). A `day` post-image
    // upserts into the days cache (day.upsert never deletes). An `ideaList`
    // delete (null image) drops the list AND nulls `listId` on its held ideas,
    // mirroring the DB-side ON DELETE SET NULL cascade.
    case "day": {
      const trip = { ...snap.trip, version: event.version };
      const days = entity ? upsertById(snap.days, entity as Day) : snap.days;
      return { ...snap, trip, days };
    }
    case "ideaList": {
      const trip = { ...snap.trip, version: event.version };
      if (!entity) {
        const ideaLists = snap.ideaLists.filter((l) => l.id !== event.entityId);
        const activities = snap.activities.map((a) =>
          a.listId === event.entityId ? { ...a, listId: null } : a,
        );
        return { ...snap, trip, ideaLists, activities };
      }
      const ideaLists = upsertById(snap.ideaLists, entity as IdeaList);
      return { ...snap, trip, ideaLists };
    }
  }
}

/**
 * When a poll was just converted, ensure its winning option exists as an Ideas
 * activity. Idempotent: no-op if the activity is already present (it will be,
 * once the authoritative snapshot includes it). Position is a best-effort
 * append key; the next snapshot refetch reconciles exact ordering.
 */
function applyPollConversion(
  activities: Activity[],
  poll: PollWithDetails,
  event: FeedEvent,
): Activity[] {
  if (event.type !== "poll.convert" || poll.convertedActivityId === null) return activities;
  const id = poll.convertedActivityId;
  if (activities.some((a) => a.id === id)) return activities;
  const winner = topPollOption(poll);
  if (!winner) return activities;
  const idea: Activity = {
    id,
    tripId: poll.tripId,
    date: null,
    position: "zzzzzz", // append-ish; a refetch corrects exact order
    title: winner.label.slice(0, 200),
    startTime: null,
    endTime: null,
    placeName: null,
    address: null,
    lat: null,
    lng: null,
    placeProvider: null,
    placeRef: null,
    category: "other",
    notes: `From poll: ${poll.question}`.slice(0, 5000),
    linkUrl: null,
    type: "activity",
    estimatedCostMinor: null,
    listId: null,
    checklistItems: null,
    createdBy: event.actorMemberId ?? "",
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };
  return [...activities, idea];
}

/** The poll option with the most votes; ties broken by snapshot (option) order. */
function topPollOption(poll: PollWithDetails): { id: string; label: string } | null {
  let best: { id: string; label: string } | null = null;
  let bestCount = -1;
  for (const option of poll.options) {
    const count = poll.votes.filter((v) => v.optionId === option.id).length;
    if (count > bestCount) {
      best = { id: option.id, label: option.label };
      bestCount = count;
    }
  }
  return best;
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
        type: p.type,
        estimatedCostMinor: p.estimatedCostMinor,
        listId: p.listId,
        checklistItems: p.checklistItems,
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
    // --- Trip Workspace v2: typed items / days / idea lists ----------------
    case "checklist.toggle": {
      const { activityId, itemId, done } = mutation.payload;
      return updateActivity(snap, activityId, (activity) => ({
        ...activity,
        checklistItems:
          activity.checklistItems?.map((it) => (it.id === itemId ? { ...it, done } : it)) ?? null,
        updatedAt: ctx.now,
      }));
    }
    case "day.upsert": {
      const { dayId, date, subtitle } = mutation.payload;
      // Find-or-create by date, mirroring the server's lazy upsert.
      const existing = snap.days.find((d) => d.date === date);
      if (existing) {
        return {
          ...snap,
          days: snap.days.map((d) =>
            d.id === existing.id ? { ...d, subtitle, updatedAt: ctx.now } : d,
          ),
        };
      }
      const day: Day = {
        id: dayId,
        tripId: snap.trip.id,
        date,
        subtitle,
        createdBy: ctx.memberId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      };
      return { ...snap, days: [...snap.days, day] };
    }
    case "ideaList.create": {
      const p = mutation.payload;
      const list: IdeaList = {
        id: p.listId,
        tripId: snap.trip.id,
        name: p.name,
        position: p.position,
        createdBy: ctx.memberId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      };
      return { ...snap, ideaLists: [...snap.ideaLists, list] };
    }
    case "ideaList.update": {
      const { listId, name } = mutation.payload;
      return {
        ...snap,
        ideaLists: snap.ideaLists.map((l) =>
          l.id === listId ? { ...l, name, updatedAt: ctx.now } : l,
        ),
      };
    }
    case "ideaList.reorder": {
      const { listId, position } = mutation.payload;
      return {
        ...snap,
        ideaLists: snap.ideaLists.map((l) =>
          l.id === listId ? { ...l, position, updatedAt: ctx.now } : l,
        ),
      };
    }
    case "ideaList.delete": {
      const { listId } = mutation.payload;
      // Drop the list and unassign its ideas locally (DB does ON DELETE SET NULL).
      return {
        ...snap,
        ideaLists: snap.ideaLists.filter((l) => l.id !== listId),
        activities: snap.activities.map((a) => (a.listId === listId ? { ...a, listId: null } : a)),
      };
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
    // --- Track A: votes / comments / polls ---------------------------------
    case "vote.toggle": {
      const { activityId } = mutation.payload;
      const mine = snap.votes.find(
        (v) => v.activityId === activityId && v.memberId === ctx.memberId,
      );
      if (mine) {
        return { ...snap, votes: snap.votes.filter((v) => v.id !== mine.id) };
      }
      const vote: ActivityVote = {
        // Optimistic id is replaced by the server's on confirm (upsert by id);
        // the retract path matches on (activity, member), so a placeholder is fine.
        id: `optimistic-${activityId}-${ctx.memberId}`,
        tripId: snap.trip.id,
        activityId,
        memberId: ctx.memberId,
        createdAt: ctx.now,
      };
      return { ...snap, votes: [...snap.votes, vote] };
    }
    case "comment.create": {
      const p = mutation.payload;
      const comment: Comment = {
        id: p.commentId,
        tripId: snap.trip.id,
        targetType: p.targetType,
        targetId: p.targetId,
        authorId: ctx.memberId,
        body: p.body,
        createdAt: ctx.now,
        editedAt: null,
      };
      return { ...snap, comments: [...snap.comments, comment] };
    }
    case "comment.update": {
      const { commentId, body } = mutation.payload;
      return {
        ...snap,
        comments: snap.comments.map((c) =>
          c.id === commentId ? { ...c, body, editedAt: ctx.now } : c,
        ),
      };
    }
    case "comment.delete": {
      const { commentId } = mutation.payload;
      return { ...snap, comments: snap.comments.filter((c) => c.id !== commentId) };
    }
    case "poll.create": {
      const p = mutation.payload;
      const poll: PollWithDetails = {
        id: p.pollId,
        tripId: snap.trip.id,
        question: p.question,
        multiSelect: p.multiSelect,
        allowMemberOptions: p.allowMemberOptions,
        createdBy: ctx.memberId,
        closesAt: p.closesAt,
        closedAt: null,
        convertedActivityId: null,
        createdAt: ctx.now,
        options: p.options.map((o) => ({
          id: o.optionId,
          pollId: p.pollId,
          label: o.label,
          createdBy: ctx.memberId,
          createdAt: ctx.now,
        })),
        votes: [],
      };
      return { ...snap, polls: [...snap.polls, poll] };
    }
    case "poll.addOption": {
      const { pollId, optionId, label } = mutation.payload;
      return {
        ...snap,
        polls: updatePoll(snap.polls, pollId, (poll) => ({
          ...poll,
          options: [
            ...poll.options,
            { id: optionId, pollId, label, createdBy: ctx.memberId, createdAt: ctx.now },
          ],
        })),
      };
    }
    case "poll.vote": {
      const { pollId, optionIds } = mutation.payload;
      return {
        ...snap,
        // Replace my votes with the chosen set (empty = cleared); others' stay.
        polls: updatePoll(snap.polls, pollId, (poll) => ({
          ...poll,
          votes: [
            ...poll.votes.filter((v) => v.memberId !== ctx.memberId),
            ...optionIds.map((optionId) => ({
              id: `optimistic-${pollId}-${ctx.memberId}-${optionId}`,
              pollId,
              optionId,
              memberId: ctx.memberId,
              createdAt: ctx.now,
            })),
          ],
        })),
      };
    }
    case "poll.close": {
      const { pollId } = mutation.payload;
      return {
        ...snap,
        polls: updatePoll(snap.polls, pollId, (poll) => ({ ...poll, closedAt: ctx.now })),
      };
    }
    // poll.convert spawns an activity from server-side tally — no optimistic
    // guess; the confirmed event (poll post-image + synthesized idea) updates it.
    case "poll.convert":
      return snap;
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

function updatePoll(
  polls: PollWithDetails[],
  pollId: string,
  update: (poll: PollWithDetails) => PollWithDetails,
): PollWithDetails[] {
  return polls.map((p) => (p.id === pollId ? update(p) : p));
}
