import { describe, expect, it } from "vitest";
import { applyEvent, applyMutationOptimistic } from "./apply";
import type {
  Activity,
  ChecklistItem,
  Day,
  EntityPostImage,
  FeedEvent,
  IdeaList,
  Mutation,
  Trip,
  TripSnapshot,
} from "./shared";

/**
 * Trip Workspace v2 reducer coverage: days (D2) + idea lists (D10) fold through
 * the same optimistic + authoritative paths as everything else. Optimistic
 * applies never bump the version watermark; confirmed events advance it.
 */

const id = (n: number) => n.toString(16).padStart(32, "0");
const TRIP_ID = id(1);
const ME = id(2);
const ACT = id(10);
const LIST_A = id(20);
const DAY_A = id(30);
const ITEM_1 = id(40);
const ITEM_2 = id(41);
const NOW = 1_700_000_000_000;

function makeTrip(version = 5): Trip {
  return {
    id: TRIP_ID,
    name: "Kyoto",
    destination: null,
    startDate: null,
    endDate: null,
    currency: "USD",
    defaultRouteMode: "walking",
    bulletin: null,
    version,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: ACT,
    tripId: TRIP_ID,
    date: null,
    position: "a0",
    title: "Ramen",
    startTime: null,
    endTime: null,
    placeName: null,
    address: null,
    lat: null,
    lng: null,
    placeProvider: null,
    placeRef: null,
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
    createdBy: ME,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function ideaList(over: Partial<IdeaList> = {}): IdeaList {
  return {
    id: LIST_A,
    tripId: TRIP_ID,
    name: "Food",
    position: "a0",
    createdBy: ME,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function day(over: Partial<Day> = {}): Day {
  return {
    id: DAY_A,
    tripId: TRIP_ID,
    date: "2026-07-04",
    subtitle: "Arrival",
    homeBasePlaceName: null,
    homeBaseAddress: null,
    homeBaseLat: null,
    homeBaseLng: null,
    homeBasePlaceProvider: null,
    homeBasePlaceRef: null,
    routeMode: null,
    createdBy: ME,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function snap(over: Partial<TripSnapshot> = {}): TripSnapshot {
  return {
    trip: makeTrip(),
    members: [],
    activities: [],
    votes: [],
    comments: [],
    polls: [],
    days: [],
    ideaLists: [],
    ...over,
  };
}

function event(over: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id: id(90),
    tripId: TRIP_ID,
    version: 6,
    actorType: "user",
    actorMemberId: ME,
    type: "day.upsert",
    entityType: "day",
    entityId: DAY_A,
    payload: {},
    createdAt: NOW,
    ...over,
  };
}

describe("applyEvent — days & idea lists", () => {
  it("a day post-image upserts into the days cache and advances the version", () => {
    const next = applyEvent(
      snap(),
      event({ entityType: "day", entityId: DAY_A }),
      day() as EntityPostImage,
    );
    expect(next.days).toHaveLength(1);
    expect(next.days[0]).toMatchObject({ id: DAY_A, subtitle: "Arrival" });
    expect(next.trip.version).toBe(6);
  });

  it("an ideaList post-image upserts the list", () => {
    const next = applyEvent(
      snap(),
      event({ type: "ideaList.create", entityType: "ideaList", entityId: LIST_A }),
      ideaList() as EntityPostImage,
    );
    expect(next.ideaLists).toHaveLength(1);
    expect(next.ideaLists[0]?.name).toBe("Food");
  });

  it("an ideaList delete (null image) drops the list and nulls listId on its held ideas", () => {
    const base = snap({
      activities: [activity({ listId: LIST_A }), activity({ id: id(11), listId: null })],
      ideaLists: [ideaList()],
    });
    const next = applyEvent(
      base,
      event({ type: "ideaList.delete", entityType: "ideaList", entityId: LIST_A }),
      null,
    );
    expect(next.ideaLists).toHaveLength(0);
    // Both ideas survive; the member idea is now Unlisted.
    expect(next.activities).toHaveLength(2);
    expect(next.activities[0]?.listId).toBeNull();
  });
});

describe("applyMutationOptimistic — typed items, days, idea lists", () => {
  const ctx = { memberId: ME, now: NOW + 60_000 };

  it("checklist.toggle flips one item by id, leaving the rest untouched", () => {
    const items: ChecklistItem[] = [
      { id: ITEM_1, text: "A", done: false },
      { id: ITEM_2, text: "B", done: false },
    ];
    const base = snap({ activities: [activity({ type: "checklist", checklistItems: items })] });
    const mutation: Mutation = {
      id: id(91),
      type: "checklist.toggle",
      payload: { activityId: ACT, itemId: ITEM_1, done: true },
    };
    const next = applyMutationOptimistic(base, mutation, ctx);
    const list = next.activities[0]?.checklistItems;
    expect(list?.find((i) => i.id === ITEM_1)?.done).toBe(true);
    expect(list?.find((i) => i.id === ITEM_2)?.done).toBe(false);
    expect(next.trip.version).toBe(5); // never bumped optimistically
  });

  it("day.upsert is find-or-create by date: creates, then patches the same row", () => {
    const created = applyMutationOptimistic(
      snap(),
      {
        id: id(91),
        type: "day.upsert",
        payload: { dayId: DAY_A, date: "2026-07-04", subtitle: "Arrival" },
      },
      ctx,
    );
    expect(created.days).toHaveLength(1);

    const patched = applyMutationOptimistic(
      created,
      {
        id: id(92),
        type: "day.upsert",
        payload: { dayId: id(31), date: "2026-07-04", subtitle: "Beach" },
      },
      ctx,
    );
    expect(patched.days).toHaveLength(1); // same date → no duplicate
    expect(patched.days[0]?.id).toBe(DAY_A);
    expect(patched.days[0]?.subtitle).toBe("Beach");
  });

  it("ideaList create / update / reorder fold optimistically", () => {
    const created = applyMutationOptimistic(
      snap(),
      {
        id: id(91),
        type: "ideaList.create",
        payload: { listId: LIST_A, name: "Food", position: "a0" },
      },
      ctx,
    );
    expect(created.ideaLists).toHaveLength(1);

    const renamed = applyMutationOptimistic(
      created,
      { id: id(92), type: "ideaList.update", payload: { listId: LIST_A, name: "Temples" } },
      ctx,
    );
    expect(renamed.ideaLists[0]?.name).toBe("Temples");

    const reordered = applyMutationOptimistic(
      renamed,
      { id: id(93), type: "ideaList.reorder", payload: { listId: LIST_A, position: "a5" } },
      ctx,
    );
    expect(reordered.ideaLists[0]?.position).toBe("a5");
  });

  it("ideaList.delete drops the list and unassigns its ideas locally", () => {
    const base = snap({ activities: [activity({ listId: LIST_A })], ideaLists: [ideaList()] });
    const next = applyMutationOptimistic(
      base,
      { id: id(91), type: "ideaList.delete", payload: { listId: LIST_A } },
      ctx,
    );
    expect(next.ideaLists).toHaveLength(0);
    expect(next.activities[0]?.listId).toBeNull();
  });
});
