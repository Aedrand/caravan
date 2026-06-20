import {
  createId,
  type ExpenseShare,
  resolveSplit,
  SplitError,
  type SplitSpec,
} from "@caravan/shared";
import { and, eq, inArray } from "drizzle-orm";
import { type MutationCtx, MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Expense & payment mutations (Track B, PD-8). Like every feature these
 * register handlers on the core pipeline; permissions, attribution, feed
 * events, and broadcast all come from there. Money is integer minor units.
 *
 * Permission shape (PD-8): role `editor` gates *creating* money records; finer
 * rules — creator edits/deletes own, owner deletes any — are enforced in
 * apply() against `ctx.member`.
 */

type MemberRow = typeof schema.tripMembers.$inferSelect;

/** Resolve a member name for feed payloads (falls back gracefully). */
function memberName(ctx: MutationCtx, memberId: string): string {
  const row = ctx.tx
    .select({ name: schema.user.name })
    .from(schema.tripMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.tripMembers.userId))
    .where(eq(schema.tripMembers.id, memberId))
    .get();
  return row?.name ?? "someone";
}

/**
 * Validate that every membership id touched by an expense/payment belongs to
 * THIS trip — ghosts allowed (PD-9), strangers rejected. Returns the set so
 * callers can reuse it.
 */
function assertTripMembers(ctx: MutationCtx, memberIds: string[]): void {
  const unique = [...new Set(memberIds)];
  if (unique.length === 0) {
    throw new MutationError(400, "no_participants", "at least one participant is required");
  }
  const rows = ctx.tx
    .select({ id: schema.tripMembers.id })
    .from(schema.tripMembers)
    .where(and(eq(schema.tripMembers.tripId, ctx.trip.id), inArray(schema.tripMembers.id, unique)))
    .all();
  const known = new Set(rows.map((r) => r.id));
  for (const id of unique) {
    if (!known.has(id)) {
      throw new MutationError(400, "unknown_member", `member ${id} is not on this trip`);
    }
  }
}

/** Map a SplitError to a 400 MutationError. */
function resolveSplitOrThrow(amountMinor: number, split: SplitSpec): ExpenseShare[] {
  try {
    return resolveSplit(amountMinor, split);
  } catch (err) {
    if (err instanceof SplitError) {
      throw new MutationError(400, err.code, err.message);
    }
    throw err;
  }
}

function loadExpense(ctx: MutationCtx, expenseId: string) {
  const expense = ctx.tx
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.tripId, ctx.trip.id)))
    .get();
  if (!expense) throw new MutationError(404, "expense_not_found", "expense not found");
  return expense;
}

/** Creator-or-owner gate (PD-8): own records, or any record if you own the trip. */
function assertCanModify(member: MemberRow, createdBy: string, noun: string): void {
  if (member.id !== createdBy && member.role !== "owner") {
    throw new MutationError(
      403,
      "not_yours",
      `only the creator or trip owner can change this ${noun}`,
    );
  }
}

/** Replace every share row for an expense with a freshly resolved set. */
function writeShares(ctx: MutationCtx, expenseId: string, shares: ExpenseShare[]): void {
  ctx.tx.delete(schema.expenseShares).where(eq(schema.expenseShares.expenseId, expenseId)).run();
  for (const share of shares) {
    ctx.tx
      .insert(schema.expenseShares)
      .values({
        id: createId(),
        expenseId,
        memberId: share.memberId,
        amountMinor: share.amountMinor,
      })
      .run();
  }
}

registerMutation("expense.create", {
  role: "editor",
  apply(ctx, payload) {
    const existing = ctx.tx
      .select({ id: schema.expenses.id })
      .from(schema.expenses)
      .where(eq(schema.expenses.id, payload.expenseId))
      .get();
    if (existing) {
      throw new MutationError(409, "expense_exists", "expense id already in use");
    }

    // Payer and every split participant must belong to this trip.
    const split = payload.split;
    const participantIds =
      split.kind === "equal" ? split.memberIds : split.shares.map((s) => s.memberId);
    assertTripMembers(ctx, [payload.paidBy, ...participantIds]);

    const shares = resolveSplitOrThrow(payload.amountMinor, split);

    if (payload.activityId !== null) {
      const activity = ctx.tx
        .select({ id: schema.activities.id })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.id, payload.activityId),
            eq(schema.activities.tripId, ctx.trip.id),
          ),
        )
        .get();
      if (!activity) {
        throw new MutationError(400, "unknown_activity", "linked activity is not on this trip");
      }
    }

    ctx.tx
      .insert(schema.expenses)
      .values({
        id: payload.expenseId,
        tripId: ctx.trip.id,
        paidBy: payload.paidBy,
        amountMinor: payload.amountMinor,
        description: payload.description,
        category: payload.category,
        notes: payload.notes,
        date: payload.date,
        activityId: payload.activityId,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .run();
    writeShares(ctx, payload.expenseId, shares);

    return {
      entityType: "expense",
      entityId: payload.expenseId,
      feedPayload: { description: payload.description, amountMinor: payload.amountMinor },
    };
  },
});

registerMutation("expense.update", {
  role: "editor",
  apply(ctx, payload) {
    const expense = loadExpense(ctx, payload.expenseId);
    assertCanModify(ctx.member, expense.createdBy, "expense");

    const { split, ...fields } = payload.patch;
    const nextAmount = fields.amountMinor ?? expense.amountMinor;

    if (fields.paidBy !== undefined) assertTripMembers(ctx, [fields.paidBy]);

    if (fields.activityId !== undefined && fields.activityId !== null) {
      const activity = ctx.tx
        .select({ id: schema.activities.id })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.id, fields.activityId),
            eq(schema.activities.tripId, ctx.trip.id),
          ),
        )
        .get();
      if (!activity) {
        throw new MutationError(400, "unknown_activity", "linked activity is not on this trip");
      }
    }

    // Shares must always reconcile to the (possibly new) amount. If the caller
    // re-split, validate against participants; if only the amount changed, an
    // equal re-split over the existing participants keeps it consistent.
    if (split !== undefined) {
      const participantIds =
        split.kind === "equal" ? split.memberIds : split.shares.map((s) => s.memberId);
      assertTripMembers(ctx, participantIds);
      writeShares(ctx, expense.id, resolveSplitOrThrow(nextAmount, split));
    } else if (fields.amountMinor !== undefined) {
      const current = ctx.tx
        .select()
        .from(schema.expenseShares)
        .where(eq(schema.expenseShares.expenseId, expense.id))
        .all();
      // Re-split equally over the same participants so the total stays exact.
      writeShares(
        ctx,
        expense.id,
        resolveSplitOrThrow(nextAmount, {
          kind: "equal",
          memberIds: current.map((s) => s.memberId),
        }),
      );
    }

    ctx.tx
      .update(schema.expenses)
      .set({ ...fields, updatedAt: ctx.now })
      .where(eq(schema.expenses.id, expense.id))
      .run();

    return {
      entityType: "expense",
      entityId: expense.id,
      feedPayload: {
        description: fields.description ?? expense.description,
        fields: Object.keys(payload.patch),
      },
    };
  },
});

registerMutation("expense.delete", {
  role: "editor",
  apply(ctx, payload) {
    const expense = loadExpense(ctx, payload.expenseId);
    assertCanModify(ctx.member, expense.createdBy, "expense");
    // Shares cascade via the FK.
    ctx.tx.delete(schema.expenses).where(eq(schema.expenses.id, expense.id)).run();
    return {
      entityType: "expense",
      entityId: expense.id,
      feedPayload: { description: expense.description, amountMinor: expense.amountMinor },
    };
  },
});

registerMutation("payment.create", {
  role: "editor",
  apply(ctx, payload) {
    const existing = ctx.tx
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(eq(schema.payments.id, payload.paymentId))
      .get();
    if (existing) {
      throw new MutationError(409, "payment_exists", "payment id already in use");
    }
    assertTripMembers(ctx, [payload.fromMember, payload.toMember]);

    ctx.tx
      .insert(schema.payments)
      .values({
        id: payload.paymentId,
        tripId: ctx.trip.id,
        fromMember: payload.fromMember,
        toMember: payload.toMember,
        amountMinor: payload.amountMinor,
        notes: payload.notes,
        date: payload.date,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .run();

    return {
      entityType: "payment",
      entityId: payload.paymentId,
      feedPayload: {
        fromName: memberName(ctx, payload.fromMember),
        toName: memberName(ctx, payload.toMember),
        amountMinor: payload.amountMinor,
      },
    };
  },
});

registerMutation("payment.delete", {
  role: "editor",
  apply(ctx, payload) {
    const payment = ctx.tx
      .select()
      .from(schema.payments)
      .where(
        and(eq(schema.payments.id, payload.paymentId), eq(schema.payments.tripId, ctx.trip.id)),
      )
      .get();
    if (!payment) throw new MutationError(404, "payment_not_found", "payment not found");
    assertCanModify(ctx.member, payment.createdBy, "payment");
    ctx.tx.delete(schema.payments).where(eq(schema.payments.id, payment.id)).run();
    return {
      entityType: "payment",
      entityId: payment.id,
      feedPayload: {
        fromName: memberName(ctx, payment.fromMember),
        toName: memberName(ctx, payment.toMember),
        amountMinor: payment.amountMinor,
      },
    };
  },
});
