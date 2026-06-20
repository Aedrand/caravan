import { createId } from "@caravan/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { type MutationCtx, MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Polls (Track A.2-A.3 / PD-3): create, add options, vote, close, convert.
 * Every poll mutation broadcasts the SAME entity — the poll, by id — so the
 * full-graph post-image (poll + options + votes) reconciles any sub-change in
 * one event. Voting sends the full chosen-option set (not a delta) so it is
 * idempotent and the single/multi rule is enforced server-side.
 */

function loadPoll(ctx: MutationCtx, pollId: string) {
  const poll = ctx.tx
    .select()
    .from(schema.polls)
    .where(and(eq(schema.polls.id, pollId), eq(schema.polls.tripId, ctx.trip.id)))
    .get();
  if (!poll) throw new MutationError(404, "poll_not_found", "poll not found");
  return poll;
}

/** Every poll mutation broadcasts the poll itself — the full-graph post-image. */
function pollResult(pollId: string) {
  return { entityType: "poll" as const, entityId: pollId };
}

registerMutation("poll.create", {
  role: "editor",
  apply(ctx, payload) {
    const existing = ctx.tx
      .select({ id: schema.polls.id })
      .from(schema.polls)
      .where(eq(schema.polls.id, payload.pollId))
      .get();
    if (existing) throw new MutationError(409, "poll_exists", "poll id already in use");

    // Reject duplicate option ids in the same create (client bug).
    const ids = new Set(payload.options.map((o) => o.optionId));
    if (ids.size !== payload.options.length) {
      throw new MutationError(400, "duplicate_option", "option ids must be unique");
    }

    ctx.tx
      .insert(schema.polls)
      .values({
        id: payload.pollId,
        tripId: ctx.trip.id,
        question: payload.question,
        multiSelect: payload.multiSelect,
        allowMemberOptions: payload.allowMemberOptions,
        createdBy: ctx.member.id,
        closesAt: payload.closesAt,
        closedAt: null,
        convertedActivityId: null,
        createdAt: ctx.now,
      })
      .run();

    for (const opt of payload.options) {
      ctx.tx
        .insert(schema.pollOptions)
        .values({
          id: opt.optionId,
          pollId: payload.pollId,
          label: opt.label,
          createdBy: ctx.member.id,
          createdAt: ctx.now,
        })
        .run();
    }

    return { ...pollResult(payload.pollId), feedPayload: { question: payload.question } };
  },
});

registerMutation("poll.addOption", {
  role: "editor",
  apply(ctx, payload) {
    const poll = loadPoll(ctx, payload.pollId);
    if (poll.closedAt !== null) {
      throw new MutationError(409, "poll_closed", "this poll is closed");
    }
    // Member-added options gate (PD-3): the creator may always add; others only
    // when the poll allows it.
    if (!poll.allowMemberOptions && poll.createdBy !== ctx.member.id) {
      throw new MutationError(
        403,
        "options_locked",
        "this poll doesn't allow member-added options",
      );
    }

    const existing = ctx.tx
      .select({ id: schema.pollOptions.id })
      .from(schema.pollOptions)
      .where(eq(schema.pollOptions.id, payload.optionId))
      .get();
    if (existing) throw new MutationError(409, "option_exists", "option id already in use");

    const count = ctx.tx
      .select({ n: sql<number>`count(*)` })
      .from(schema.pollOptions)
      .where(eq(schema.pollOptions.pollId, poll.id))
      .get();
    if ((count?.n ?? 0) >= 20) {
      throw new MutationError(409, "too_many_options", "this poll already has the maximum options");
    }

    ctx.tx
      .insert(schema.pollOptions)
      .values({
        id: payload.optionId,
        pollId: poll.id,
        label: payload.label,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
      })
      .run();

    return {
      ...pollResult(poll.id),
      feedPayload: { question: poll.question, label: payload.label },
    };
  },
});

registerMutation("poll.vote", {
  role: "editor",
  apply(ctx, payload) {
    const poll = loadPoll(ctx, payload.pollId);
    if (poll.closedAt !== null) {
      throw new MutationError(409, "poll_closed", "this poll is closed");
    }

    const optionIds = [...new Set(payload.optionIds)];
    if (!poll.multiSelect && optionIds.length > 1) {
      throw new MutationError(400, "single_choice", "this poll allows only one choice");
    }

    if (optionIds.length > 0) {
      const valid = ctx.tx
        .select({ id: schema.pollOptions.id })
        .from(schema.pollOptions)
        .where(
          and(eq(schema.pollOptions.pollId, poll.id), inArray(schema.pollOptions.id, optionIds)),
        )
        .all();
      if (valid.length !== optionIds.length) {
        throw new MutationError(
          400,
          "unknown_option",
          "one or more options don't belong to this poll",
        );
      }
    }

    // Replace this member's votes with the new set (empty = clear vote).
    ctx.tx
      .delete(schema.pollVotes)
      .where(
        and(eq(schema.pollVotes.pollId, poll.id), eq(schema.pollVotes.memberId, ctx.member.id)),
      )
      .run();
    for (const optionId of optionIds) {
      ctx.tx
        .insert(schema.pollVotes)
        .values({
          id: createId(),
          pollId: poll.id,
          optionId,
          memberId: ctx.member.id,
          createdAt: ctx.now,
        })
        .run();
    }

    return { ...pollResult(poll.id), feedPayload: { question: poll.question } };
  },
});

registerMutation("poll.close", {
  role: "editor",
  apply(ctx, payload) {
    const poll = loadPoll(ctx, payload.pollId);
    if (poll.closedAt !== null) {
      throw new MutationError(409, "poll_closed", "this poll is already closed");
    }
    // Creator or trip owner may close (PD-3).
    if (poll.createdBy !== ctx.member.id && ctx.member.role !== "owner") {
      throw new MutationError(403, "cannot_close_poll", "only the creator or trip owner can close");
    }

    ctx.tx
      .update(schema.polls)
      .set({ closedAt: ctx.now })
      .where(eq(schema.polls.id, poll.id))
      .run();

    return { ...pollResult(poll.id), feedPayload: { question: poll.question } };
  },
});

/** The option with the most votes, ties broken by earliest creation. */
function winningOption(ctx: MutationCtx, pollId: string) {
  const tally = ctx.tx
    .select({
      optionId: schema.pollOptions.id,
      label: schema.pollOptions.label,
      createdAt: schema.pollOptions.createdAt,
      votes: sql<number>`count(${schema.pollVotes.id})`,
    })
    .from(schema.pollOptions)
    .leftJoin(schema.pollVotes, eq(schema.pollVotes.optionId, schema.pollOptions.id))
    .where(eq(schema.pollOptions.pollId, pollId))
    .groupBy(schema.pollOptions.id)
    .orderBy(desc(sql`count(${schema.pollVotes.id})`), asc(schema.pollOptions.createdAt))
    .all();
  return tally[0] ?? null;
}

registerMutation("poll.convert", {
  role: "editor",
  apply(ctx, payload) {
    const poll = loadPoll(ctx, payload.pollId);
    if (poll.closedAt === null) {
      throw new MutationError(409, "poll_open", "close the poll before converting it");
    }
    if (poll.convertedActivityId !== null) {
      throw new MutationError(409, "already_converted", "this poll was already converted");
    }

    const winner = winningOption(ctx, poll.id);
    if (!winner || winner.votes === 0) {
      throw new MutationError(409, "no_winner", "no option has any votes yet");
    }

    // New idea in the Ideas pool (date = null), titled by the winning option.
    ctx.tx
      .insert(schema.activities)
      .values({
        id: payload.activityId,
        tripId: ctx.trip.id,
        date: null,
        position: payload.position,
        title: winner.label.slice(0, 200),
        category: "other",
        notes: `From poll: ${poll.question}`.slice(0, 5000),
        createdBy: ctx.member.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .run();

    ctx.tx
      .update(schema.polls)
      .set({ convertedActivityId: payload.activityId })
      .where(eq(schema.polls.id, poll.id))
      .run();

    // The event entity is the POLL (its convertedActivityId changed); the new
    // activity arrives in the same snapshot the client refetches/holds — and
    // the feed line names both.
    return {
      ...pollResult(poll.id),
      feedPayload: { question: poll.question, activityTitle: winner.label },
    };
  },
});
