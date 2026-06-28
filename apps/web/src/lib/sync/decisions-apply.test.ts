import { describe, expect, it } from "vitest";
import { applyEvent, applyMutationOptimistic } from "./apply";
import type {
  Activity,
  ActivityVote,
  Comment,
  FeedEvent,
  Mutation,
  PollWithDetails,
  Trip,
  TripSnapshot,
} from "./shared";

/**
 * Track A reducer coverage: votes / comments / polls fold through the same
 * optimistic + authoritative paths as activities. Versions are server-owned;
 * optimistic applies never bump the watermark, confirmed events advance it.
 */

const id = (n: number) => n.toString(16).padStart(32, "0");
const TRIP_ID = id(1);
const ME = id(2);
const OTHER = id(3);
const ACT = id(10);
const POLL = id(20);
const OPT_A = id(21);
const OPT_B = id(22);
const NOW = 1_700_000_000_000;

function makeTrip(version = 5): Trip {
  return {
    id: TRIP_ID,
    name: "Kyoto",
    destination: null,
    startDate: null,
    endDate: null,
    currency: "USD",
    version,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function snap(overrides: Partial<TripSnapshot> = {}): TripSnapshot {
  return {
    trip: makeTrip(),
    members: [],
    activities: [],
    votes: [],
    comments: [],
    polls: [],
    days: [],
    ideaLists: [],
    ...overrides,
  };
}

function vote(overrides: Partial<ActivityVote> = {}): ActivityVote {
  return {
    id: id(30),
    tripId: TRIP_ID,
    activityId: ACT,
    memberId: ME,
    createdAt: NOW,
    ...overrides,
  };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: id(40),
    tripId: TRIP_ID,
    targetType: "activity",
    targetId: ACT,
    authorId: ME,
    body: "Closed Mondays",
    createdAt: NOW,
    editedAt: null,
    ...overrides,
  };
}

function poll(overrides: Partial<PollWithDetails> = {}): PollWithDetails {
  return {
    id: POLL,
    tripId: TRIP_ID,
    question: "Airbnb or hotel?",
    multiSelect: false,
    allowMemberOptions: true,
    createdBy: ME,
    closesAt: null,
    closedAt: null,
    convertedActivityId: null,
    createdAt: NOW,
    options: [
      { id: OPT_A, pollId: POLL, label: "Airbnb", createdBy: ME, createdAt: NOW },
      { id: OPT_B, pollId: POLL, label: "Hotel", createdBy: ME, createdAt: NOW },
    ],
    votes: [],
    ...overrides,
  };
}

function event(overrides: Partial<FeedEvent>): FeedEvent {
  return {
    id: id(99),
    tripId: TRIP_ID,
    version: 6,
    actorType: "user",
    actorMemberId: ME,
    type: "vote.toggle",
    entityType: "vote",
    entityId: id(30),
    payload: {},
    createdAt: NOW,
    ...overrides,
  };
}

const mut = (m: Mutation): Mutation => m;

describe("optimistic vote.toggle", () => {
  it("adds my vote when absent, removes it when present", () => {
    const added = applyMutationOptimistic(
      snap(),
      mut({ id: id(50), type: "vote.toggle", payload: { activityId: ACT } }),
      { memberId: ME, now: NOW },
    );
    expect(added.votes).toHaveLength(1);
    expect(added.votes[0]?.memberId).toBe(ME);

    const removed = applyMutationOptimistic(
      added,
      mut({ id: id(51), type: "vote.toggle", payload: { activityId: ACT } }),
      { memberId: ME, now: NOW },
    );
    expect(removed.votes).toHaveLength(0);
  });
});

describe("applyEvent vote", () => {
  it("upserts a cast vote and bumps the version", () => {
    const next = applyEvent(snap(), event({ entityType: "vote", entityId: id(30) }), vote());
    expect(next.votes).toHaveLength(1);
    expect(next.trip.version).toBe(6);
  });

  it("removes a retracted vote (null post-image) by id", () => {
    const start = snap({ votes: [vote({ id: id(30) })] });
    const next = applyEvent(start, event({ entityType: "vote", entityId: id(30) }), null);
    expect(next.votes).toHaveLength(0);
  });
});

describe("applyEvent comment", () => {
  it("upserts on create/update and drops on delete", () => {
    const created = applyEvent(
      snap(),
      event({ entityType: "comment", entityId: id(40), type: "comment.create" }),
      comment(),
    );
    expect(created.comments).toHaveLength(1);

    const deleted = applyEvent(
      created,
      event({ entityType: "comment", entityId: id(40), version: 7, type: "comment.delete" }),
      null,
    );
    expect(deleted.comments).toHaveLength(0);
    expect(deleted.trip.version).toBe(7);
  });
});

describe("applyEvent poll", () => {
  it("upserts the full poll graph", () => {
    const next = applyEvent(
      snap(),
      event({ entityType: "poll", entityId: POLL, type: "poll.create" }),
      poll(),
    );
    expect(next.polls).toHaveLength(1);
    expect(next.polls[0]?.options).toHaveLength(2);
  });

  it("poll.convert synthesizes the winning option as an Ideas activity", () => {
    const converted = poll({
      closedAt: NOW,
      convertedActivityId: id(60),
      votes: [{ id: id(70), pollId: POLL, optionId: OPT_B, memberId: ME, createdAt: NOW }],
    });
    const next = applyEvent(
      snap({ polls: [poll()] }),
      event({ entityType: "poll", entityId: POLL, type: "poll.convert", version: 8 }),
      converted,
    );
    const idea = next.activities.find((a: Activity) => a.id === id(60));
    expect(idea?.title).toBe("Hotel"); // OPT_B had the only vote
    expect(idea?.date).toBeNull(); // Ideas pool
  });
});

describe("optimistic poll.vote", () => {
  it("single-choice replaces my prior choice", () => {
    const withVote = applyMutationOptimistic(
      snap({ polls: [poll()] }),
      mut({ id: id(52), type: "poll.vote", payload: { pollId: POLL, optionIds: [OPT_A] } }),
      { memberId: ME, now: NOW },
    );
    expect(withVote.polls[0]?.votes.filter((v) => v.memberId === ME)).toHaveLength(1);

    const reVoted = applyMutationOptimistic(
      withVote,
      mut({ id: id(53), type: "poll.vote", payload: { pollId: POLL, optionIds: [OPT_B] } }),
      { memberId: ME, now: NOW },
    );
    const mine = reVoted.polls[0]?.votes.filter((v) => v.memberId === ME) ?? [];
    expect(mine).toHaveLength(1);
    expect(mine[0]?.optionId).toBe(OPT_B);
  });

  it("keeps another member's vote untouched", () => {
    const start = snap({
      polls: [
        poll({
          votes: [{ id: id(71), pollId: POLL, optionId: OPT_A, memberId: OTHER, createdAt: NOW }],
        }),
      ],
    });
    const next = applyMutationOptimistic(
      start,
      mut({ id: id(54), type: "poll.vote", payload: { pollId: POLL, optionIds: [OPT_B] } }),
      { memberId: ME, now: NOW },
    );
    expect(next.polls[0]?.votes.some((v) => v.memberId === OTHER && v.optionId === OPT_A)).toBe(
      true,
    );
    expect(next.polls[0]?.votes.some((v) => v.memberId === ME && v.optionId === OPT_B)).toBe(true);
  });
});
