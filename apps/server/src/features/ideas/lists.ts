import { and, eq } from "drizzle-orm";
import { type MutationCtx, MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Idea lists (D10, Trip Workspace v2): named buckets for Ideas-pool items.
 * Handlers register on the core pipeline like every feature — permissions,
 * attribution, feed events, and broadcast come from there.
 *
 * Permission shape (PD-8): `editor` gates create/edit/reorder; finer
 * creator-or-owner rules on delete are enforced in apply() against `ctx.member`.
 * Assigning/moving ideas between lists is NOT a list mutation — it's a normal
 * `activity.update { listId }`; ordering an idea reuses `activity.move`.
 */

type MemberRow = typeof schema.tripMembers.$inferSelect;

function loadList(ctx: MutationCtx, listId: string) {
  const list = ctx.tx
    .select()
    .from(schema.ideaLists)
    .where(and(eq(schema.ideaLists.id, listId), eq(schema.ideaLists.tripId, ctx.trip.id)))
    .get();
  if (!list) throw new MutationError(404, "list_not_found", "idea list not found");
  return list;
}

/** Creator-or-owner gate (PD-8): own records, or any record if you own the trip. */
function assertCanModify(member: MemberRow, createdBy: string): void {
  if (member.id !== createdBy && member.role !== "owner") {
    throw new MutationError(
      403,
      "not_yours",
      "only the creator or trip owner can delete this list",
    );
  }
}

registerMutation("ideaList.create", {
  role: "editor",
  apply(ctx, payload) {
    const existing = ctx.tx
      .select({ id: schema.ideaLists.id })
      .from(schema.ideaLists)
      .where(eq(schema.ideaLists.id, payload.listId))
      .get();
    if (existing) {
      throw new MutationError(409, "list_exists", "idea list id already in use");
    }

    ctx.tx
      .insert(schema.ideaLists)
      .values({
        id: payload.listId,
        tripId: ctx.trip.id,
        name: payload.name,
        position: payload.position,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .run();

    return {
      entityType: "ideaList",
      entityId: payload.listId,
      feedPayload: { name: payload.name },
    };
  },
});

registerMutation("ideaList.update", {
  role: "editor",
  apply(ctx, payload) {
    const list = loadList(ctx, payload.listId);
    ctx.tx
      .update(schema.ideaLists)
      .set({ name: payload.name, updatedAt: ctx.now })
      .where(eq(schema.ideaLists.id, list.id))
      .run();
    return {
      entityType: "ideaList",
      entityId: list.id,
      feedPayload: { name: payload.name },
    };
  },
});

/**
 * Reorder is its own mutation (mirroring `activity.move`) so the fractional-
 * index ordering key moves through an isolated LWW-on-position seam (TD-1).
 */
registerMutation("ideaList.reorder", {
  role: "editor",
  apply(ctx, payload) {
    const list = loadList(ctx, payload.listId);
    ctx.tx
      .update(schema.ideaLists)
      .set({ position: payload.position, updatedAt: ctx.now })
      .where(eq(schema.ideaLists.id, list.id))
      .run();
    return {
      entityType: "ideaList",
      entityId: list.id,
      feedPayload: { name: list.name },
    };
  },
});

/**
 * Delete unassigns rather than destroys: the `activities.list_id` FK is
 * `ON DELETE SET NULL`, so member ideas survive and fall to "Unlisted"
 * automatically. The post-image is null (deleted); clients drop the list and
 * null `listId` on any held idea that pointed at it (the cascade is DB-side).
 */
registerMutation("ideaList.delete", {
  role: "editor",
  apply(ctx, payload) {
    const list = loadList(ctx, payload.listId);
    assertCanModify(ctx.member, list.createdBy);
    ctx.tx.delete(schema.ideaLists).where(eq(schema.ideaLists.id, list.id)).run();
    return {
      entityType: "ideaList",
      entityId: list.id,
      feedPayload: { name: list.name },
    };
  },
});
