import { and, eq } from "drizzle-orm";
import { type MutationCtx, MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Comments (Track A.4 / PD-4): flat streams on an activity or a poll. Plain
 * text; author-editable and author-deletable, with the trip owner also able to
 * delete. No threading, reactions, or mentions in v1.
 */

type CommentTargetType = "activity" | "poll";

/** Confirm the target exists in THIS trip and return a human title for the feed. */
function resolveTarget(ctx: MutationCtx, targetType: CommentTargetType, targetId: string): string {
  if (targetType === "activity") {
    const activity = ctx.tx
      .select({ title: schema.activities.title })
      .from(schema.activities)
      .where(and(eq(schema.activities.id, targetId), eq(schema.activities.tripId, ctx.trip.id)))
      .get();
    if (!activity) throw new MutationError(404, "target_not_found", "activity not found");
    return activity.title;
  }
  const poll = ctx.tx
    .select({ question: schema.polls.question })
    .from(schema.polls)
    .where(and(eq(schema.polls.id, targetId), eq(schema.polls.tripId, ctx.trip.id)))
    .get();
  if (!poll) throw new MutationError(404, "target_not_found", "poll not found");
  return poll.question;
}

function loadComment(ctx: MutationCtx, commentId: string) {
  const comment = ctx.tx
    .select()
    .from(schema.comments)
    .where(and(eq(schema.comments.id, commentId), eq(schema.comments.tripId, ctx.trip.id)))
    .get();
  if (!comment) throw new MutationError(404, "comment_not_found", "comment not found");
  return comment;
}

registerMutation("comment.create", {
  role: "editor",
  apply(ctx, payload) {
    const existing = ctx.tx
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.id, payload.commentId))
      .get();
    if (existing) throw new MutationError(409, "comment_exists", "comment id already in use");

    const targetTitle = resolveTarget(ctx, payload.targetType, payload.targetId);

    ctx.tx
      .insert(schema.comments)
      .values({
        id: payload.commentId,
        tripId: ctx.trip.id,
        targetType: payload.targetType,
        targetId: payload.targetId,
        authorId: ctx.member.id,
        body: payload.body,
        createdAt: ctx.now,
        editedAt: null,
      })
      .run();

    return {
      entityType: "comment",
      entityId: payload.commentId,
      feedPayload: { targetType: payload.targetType, targetTitle },
    };
  },
});

registerMutation("comment.update", {
  role: "editor",
  apply(ctx, payload) {
    const comment = loadComment(ctx, payload.commentId);
    // Only the author may edit (owners can delete, not rewrite — PD-4).
    if (comment.authorId !== ctx.member.id) {
      throw new MutationError(403, "not_comment_author", "only the author can edit this comment");
    }

    ctx.tx
      .update(schema.comments)
      .set({ body: payload.body, editedAt: ctx.now })
      .where(eq(schema.comments.id, comment.id))
      .run();

    return {
      entityType: "comment",
      entityId: comment.id,
      feedPayload: {
        targetType: comment.targetType,
        targetTitle: resolveTarget(ctx, comment.targetType, comment.targetId),
      },
    };
  },
});

registerMutation("comment.delete", {
  role: "editor",
  apply(ctx, payload) {
    const comment = loadComment(ctx, payload.commentId);
    // Author or trip owner may delete (PD-4).
    const isOwner = ctx.member.role === "owner";
    if (comment.authorId !== ctx.member.id && !isOwner) {
      throw new MutationError(
        403,
        "cannot_delete_comment",
        "only the author or the trip owner can delete this comment",
      );
    }

    // Resolve the title BEFORE deleting (the comment row still exists).
    const targetTitle = resolveTarget(ctx, comment.targetType, comment.targetId);
    ctx.tx.delete(schema.comments).where(eq(schema.comments.id, comment.id)).run();

    return {
      entityType: "comment",
      entityId: comment.id,
      feedPayload: { targetType: comment.targetType, targetTitle },
    };
  },
});
