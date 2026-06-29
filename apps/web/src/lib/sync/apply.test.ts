import { describe, expect, it } from "vitest";
import { applyEvent, applyMutationOptimistic } from "./apply";
import {
  type Activity,
  type FeedEvent,
  type Mutation,
  mutationPayloads,
  type Trip,
  type TripMember,
  type TripSnapshot,
} from "./shared";

const id = (n: number) => n.toString(16).padStart(32, "0");

const TRIP_ID = id(1);
const MEMBER_ID = id(2);
const OTHER_MEMBER_ID = id(3);
const ACT_A = id(10);
const ACT_B = id(11);
const NOW = 1_700_000_000_000;
const LATER = NOW + 60_000;

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID,
    name: "Kyoto",
    destination: "Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-08",
    currency: "USD",
    defaultRouteMode: "walking",
    bulletin: null,
    version: 5,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMember(overrides: Partial<TripMember> = {}): TripMember {
  return {
    id: MEMBER_ID,
    tripId: TRIP_ID,
    userId: "user-1",
    name: "Ada",
    role: "owner",
    status: "active",
    aiWriteEnabled: false,
    joinedAt: NOW,
    ...overrides,
  };
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: ACT_A,
    tripId: TRIP_ID,
    date: "2026-10-02",
    position: "a1",
    title: "Fushimi Inari",
    startTime: null,
    endTime: null,
    placeName: null,
    address: null,
    lat: null,
    lng: null,
    placeProvider: null,
    placeRef: null,
    category: "sights",
    notes: "",
    linkUrl: null,
    type: "activity",
    estimatedCostMinor: null,
    listId: null,
    checklistItems: null,
    endDate: null,
    confirmationCode: null,
    arrPlaceName: null,
    arrAddress: null,
    arrLat: null,
    arrLng: null,
    arrPlaceProvider: null,
    arrPlaceRef: null,
    flightNumber: null,
    createdBy: MEMBER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<TripSnapshot> = {}): TripSnapshot {
  return {
    trip: makeTrip(),
    members: [makeMember()],
    activities: [makeActivity()],
    // Track A appended these to the snapshot; existing cases default them empty.
    votes: [],
    comments: [],
    polls: [],
    // Trip Workspace v2 appended these; default empty for existing cases.
    days: [],
    ideaLists: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id: id(90),
    tripId: TRIP_ID,
    version: 6,
    actorType: "user",
    actorMemberId: MEMBER_ID,
    type: "activity.update",
    entityType: "activity",
    entityId: ACT_A,
    payload: {},
    createdAt: LATER,
    ...overrides,
  };
}

/** Frozen inputs make any accidental in-place mutation throw (strict mode). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const frozenSnapshot = (overrides: Partial<TripSnapshot> = {}) =>
  deepFreeze(makeSnapshot(overrides));

describe("applyEvent", () => {
  it("skips stale and duplicate events (version <= snapshot version)", () => {
    const snap = frozenSnapshot(); // trip.version 5
    const updated = makeActivity({ title: "Changed" });
    expect(applyEvent(snap, makeEvent({ version: 5 }), updated)).toBe(snap);
    expect(applyEvent(snap, makeEvent({ version: 4 }), updated)).toBe(snap);
  });

  it("upserts an existing activity and patches the version watermark", () => {
    const snap = frozenSnapshot();
    const updated = makeActivity({ title: "Renamed", updatedAt: LATER });
    const next = applyEvent(snap, makeEvent({ version: 6 }), updated);

    expect(next.activities).toEqual([updated]);
    expect(next.trip.version).toBe(6);
    expect(next.trip.name).toBe("Kyoto"); // rest of the trip untouched
  });

  it("appends a new activity on upsert of an unknown id", () => {
    const snap = frozenSnapshot();
    const added = makeActivity({ id: ACT_B, title: "Ramen" });
    const next = applyEvent(
      snap,
      makeEvent({ version: 6, type: "activity.create", entityId: ACT_B }),
      added,
    );

    expect(next.activities).toHaveLength(2);
    expect(next.activities[1]).toEqual(added);
    expect(next.trip.version).toBe(6);
  });

  it("removes an activity when the post-image is null (delete)", () => {
    const snap = frozenSnapshot();
    const next = applyEvent(snap, makeEvent({ version: 6, type: "activity.delete" }), null);

    expect(next.activities).toEqual([]);
    expect(next.trip.version).toBe(6);
  });

  it("replaces the whole trip from a trip post-image (which carries the bumped version)", () => {
    const snap = frozenSnapshot();
    const newTrip = makeTrip({ version: 6, name: "Kyoto + Osaka", updatedAt: LATER });
    const next = applyEvent(
      snap,
      makeEvent({ version: 6, type: "trip.update", entityType: "trip", entityId: TRIP_ID }),
      newTrip,
    );

    expect(next.trip).toEqual(newTrip);
    expect(next.activities).toBe(snap.activities);
  });

  it("upserts members and patches the version watermark", () => {
    const snap = frozenSnapshot();
    const joined = makeMember({ id: OTHER_MEMBER_ID, userId: "user-2", name: "Grace" });
    const next = applyEvent(
      snap,
      makeEvent({
        version: 6,
        type: "member.setRole",
        entityType: "member",
        entityId: OTHER_MEMBER_ID,
      }),
      joined,
    );

    expect(next.members).toHaveLength(2);
    expect(next.members[1]).toEqual(joined);
    expect(next.trip.version).toBe(6);

    const renamed = makeMember({ name: "Ada L." });
    const after = applyEvent(
      next,
      makeEvent({ version: 7, type: "member.setRole", entityType: "member", entityId: MEMBER_ID }),
      renamed,
    );
    expect(after.members[0]).toEqual(renamed);
    expect(after.members).toHaveLength(2);
    expect(after.trip.version).toBe(7);
  });

  it("trip.transferOwnership: upserts the new owner and demotes the old one", () => {
    const oldOwner = makeMember(); // MEMBER_ID, role owner
    const coTraveler = makeMember({ id: OTHER_MEMBER_ID, userId: "user-2", name: "Basha" });
    const snap = frozenSnapshot({ members: [oldOwner, { ...coTraveler, role: "editor" }] });

    const newOwner = { ...coTraveler, role: "owner" as const };
    const next = applyEvent(
      snap,
      makeEvent({
        version: 6,
        type: "trip.transferOwnership",
        entityType: "member",
        entityId: OTHER_MEMBER_ID,
      }),
      newOwner,
    );

    expect(next.members.find((m) => m.id === OTHER_MEMBER_ID)?.role).toBe("owner");
    expect(next.members.find((m) => m.id === MEMBER_ID)?.role).toBe("editor");
    expect(next.members.filter((m) => m.role === "owner")).toHaveLength(1);
    expect(next.trip.version).toBe(6);
  });

  it("advances only the version watermark for invite events", () => {
    const snap = frozenSnapshot();
    const next = applyEvent(
      snap,
      makeEvent({ version: 6, type: "invite.create", entityType: "invite", entityId: id(40) }),
      null,
    );

    expect(next.trip.version).toBe(6);
    expect(next.members).toBe(snap.members);
    expect(next.activities).toBe(snap.activities);
  });

  it("never mutates the input snapshot", () => {
    const snap = makeSnapshot();
    const before = structuredClone(snap);
    applyEvent(snap, makeEvent({ version: 6 }), makeActivity({ title: "Changed" }));
    applyEvent(snap, makeEvent({ version: 6, type: "activity.delete" }), null);
    expect(snap).toEqual(before);
  });
});

describe("applyMutationOptimistic", () => {
  const ctx = { memberId: MEMBER_ID, now: LATER };

  it("activity.create appends a full activity with flattened place", () => {
    const snap = frozenSnapshot();
    const payload = mutationPayloads["activity.create"].parse({
      activityId: ACT_B,
      title: "Ichiran",
      date: "2026-10-03",
      position: "a2",
      category: "food",
      place: {
        name: "Ichiran Kyoto",
        address: "598 Nakanocho",
        lat: 35.004,
        lng: 135.768,
        provider: "google",
        ref: "place-ref-1",
      },
    });
    const mutation: Mutation = { id: id(91), type: "activity.create", payload };

    const next = applyMutationOptimistic(snap, mutation, ctx);

    expect(next.activities).toHaveLength(2);
    expect(next.activities[1]).toEqual({
      id: ACT_B,
      tripId: TRIP_ID,
      date: "2026-10-03",
      position: "a2",
      title: "Ichiran",
      startTime: null,
      endTime: null,
      placeName: "Ichiran Kyoto",
      address: "598 Nakanocho",
      lat: 35.004,
      lng: 135.768,
      placeProvider: "google",
      placeRef: "place-ref-1",
      category: "food",
      notes: "",
      linkUrl: null,
      type: "activity",
      estimatedCostMinor: null,
      listId: null,
      checklistItems: null,
      endDate: null,
      confirmationCode: null,
      arrPlaceName: null,
      arrAddress: null,
      arrLat: null,
      arrLng: null,
      arrPlaceProvider: null,
      arrPlaceRef: null,
      flightNumber: null,
      createdBy: MEMBER_ID,
      createdAt: LATER,
      updatedAt: LATER,
    });
    expect(next.trip.version).toBe(5); // NEVER bumped optimistically
  });

  it("activity.create without a place leaves all six place columns null", () => {
    const snap = frozenSnapshot();
    const payload = mutationPayloads["activity.create"].parse({
      activityId: ACT_B,
      title: "Wander",
      date: null,
      position: "a2",
    });
    const next = applyMutationOptimistic(
      snap,
      { id: id(91), type: "activity.create", payload },
      ctx,
    );

    expect(next.activities[1]).toMatchObject({
      placeName: null,
      address: null,
      lat: null,
      lng: null,
      placeProvider: null,
      placeRef: null,
      category: "other", // schema default
      date: null,
    });
  });

  it("activity.update merges the patch and flattens a partial place", () => {
    const snap = frozenSnapshot();
    const payload = mutationPayloads["activity.update"].parse({
      activityId: ACT_A,
      patch: { title: "Inari at dawn", notes: "beat the crowds", place: { name: "Fushimi Inari" } },
    });
    const next = applyMutationOptimistic(
      snap,
      { id: id(91), type: "activity.update", payload },
      ctx,
    );

    expect(next.activities[0]).toMatchObject({
      title: "Inari at dawn",
      notes: "beat the crowds",
      placeName: "Fushimi Inari",
      address: null, // partial place: missing optional columns clear to null
      lat: null,
      lng: null,
      placeProvider: null,
      placeRef: null,
      category: "sights", // untouched field preserved
      updatedAt: LATER,
    });
    expect(next.trip.version).toBe(5);
  });

  it("activity.update with place: null clears all six place columns", () => {
    const placed = makeActivity({
      placeName: "Somewhere",
      address: "1 Road",
      lat: 1,
      lng: 2,
      placeProvider: "google",
      placeRef: "ref",
    });
    const snap = frozenSnapshot({ activities: [placed] });
    const payload = mutationPayloads["activity.update"].parse({
      activityId: ACT_A,
      patch: { place: null },
    });
    const next = applyMutationOptimistic(
      snap,
      { id: id(91), type: "activity.update", payload },
      ctx,
    );

    expect(next.activities[0]).toMatchObject({
      placeName: null,
      address: null,
      lat: null,
      lng: null,
      placeProvider: null,
      placeRef: null,
      title: "Fushimi Inari", // everything else untouched
    });
  });

  it("activity.update without a place key leaves place columns untouched", () => {
    const placed = makeActivity({ placeName: "Somewhere", address: "1 Road" });
    const snap = frozenSnapshot({ activities: [placed] });
    const payload = mutationPayloads["activity.update"].parse({
      activityId: ACT_A,
      patch: { title: "New title" },
    });
    const next = applyMutationOptimistic(
      snap,
      { id: id(91), type: "activity.update", payload },
      ctx,
    );

    expect(next.activities[0]).toMatchObject({
      title: "New title",
      placeName: "Somewhere",
      address: "1 Road",
    });
  });

  it("activity.update for an unknown activity is a no-op", () => {
    const snap = frozenSnapshot();
    const payload = mutationPayloads["activity.update"].parse({
      activityId: ACT_B,
      patch: { title: "Ghost" },
    });
    expect(
      applyMutationOptimistic(snap, { id: id(91), type: "activity.update", payload }, ctx),
    ).toBe(snap);
  });

  it("activity.move sets date, position, and updatedAt", () => {
    const snap = frozenSnapshot();
    const payload = mutationPayloads["activity.move"].parse({
      activityId: ACT_A,
      date: null, // demote to the Ideas pool
      position: "z9",
    });
    const next = applyMutationOptimistic(snap, { id: id(91), type: "activity.move", payload }, ctx);

    expect(next.activities[0]).toMatchObject({ date: null, position: "z9", updatedAt: LATER });
    expect(next.trip.version).toBe(5);
  });

  it("activity.delete removes the activity", () => {
    const snap = frozenSnapshot();
    const payload = mutationPayloads["activity.delete"].parse({ activityId: ACT_A });
    const next = applyMutationOptimistic(
      snap,
      { id: id(91), type: "activity.delete", payload },
      ctx,
    );

    expect(next.activities).toEqual([]);
    expect(next.trip.version).toBe(5);
  });

  it("trip.update merges the patch without bumping the version", () => {
    const snap = frozenSnapshot();
    const payload = mutationPayloads["trip.update"].parse({
      name: "Kyoto + Nara",
      destination: null,
    });
    const next = applyMutationOptimistic(snap, { id: id(91), type: "trip.update", payload }, ctx);

    expect(next.trip).toMatchObject({
      name: "Kyoto + Nara",
      destination: null,
      startDate: "2026-10-01", // untouched fields preserved
      version: 5,
      updatedAt: LATER,
    });
  });

  it("trip.archive and trip.unarchive flip archivedAt", () => {
    const snap = frozenSnapshot();
    const archived = applyMutationOptimistic(
      snap,
      { id: id(91), type: "trip.archive", payload: {} },
      ctx,
    );
    expect(archived.trip.archivedAt).toBe(LATER);
    expect(archived.trip.version).toBe(5);

    const restored = applyMutationOptimistic(
      deepFreeze(archived),
      { id: id(92), type: "trip.unarchive", payload: {} },
      ctx,
    );
    expect(restored.trip.archivedAt).toBeNull();
  });

  it("member/invite/ownership mutations are no-ops until M1.5", () => {
    const snap = frozenSnapshot();
    const mutations: Mutation[] = [
      { id: id(91), type: "member.leave", payload: {} },
      { id: id(92), type: "member.remove", payload: { memberId: OTHER_MEMBER_ID } },
      {
        id: id(93),
        type: "member.setRole",
        payload: { memberId: OTHER_MEMBER_ID, role: "viewer" },
      },
      { id: id(94), type: "invite.create", payload: mutationPayloads["invite.create"].parse({}) },
      { id: id(95), type: "invite.revoke", payload: { inviteId: id(40) } },
      { id: id(96), type: "trip.transferOwnership", payload: { memberId: OTHER_MEMBER_ID } },
    ];

    for (const mutation of mutations) {
      expect(applyMutationOptimistic(snap, mutation, ctx)).toBe(snap);
    }
  });

  it("never mutates the input snapshot", () => {
    const snap = makeSnapshot();
    const before = structuredClone(snap);
    const payload = mutationPayloads["activity.update"].parse({
      activityId: ACT_A,
      patch: { title: "Changed", place: null },
    });
    applyMutationOptimistic(snap, { id: id(91), type: "activity.update", payload }, ctx);
    applyMutationOptimistic(snap, { id: id(92), type: "trip.archive", payload: {} }, ctx);
    expect(snap).toEqual(before);
  });
});
