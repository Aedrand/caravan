import type { TripMoney } from "@caravan/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthedEnv } from "../../auth/session";
import { getActiveMember } from "../../core/membership";
import { serializeExpense, serializePayment } from "../../core/serialize";
import type { Db } from "../../db";
import { schema } from "../../db";

/**
 * Track B money read surface (PD-8), mounted at /api/trips behind requireUser.
 * Writes go through the mutation pipeline (/:tripId/mutations); this endpoint is
 * the read counterpart, kept out of the trip snapshot so the itinerary core
 * stays lean. Settlement is computed client-side from this payload, never here.
 */
export function createExpensesRoutes(deps: { db: Db }) {
  const { db } = deps;

  return new Hono<AuthedEnv>().get("/:tripId/money", (c) => {
    const tripId = c.req.param("tripId");
    const trip = db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
    if (!trip) {
      return c.json({ error: { code: "trip_not_found", message: "trip not found" } }, 404);
    }
    const member = getActiveMember(db, tripId, c.get("user").id);
    if (!member) {
      return c.json(
        { error: { code: "not_a_member", message: "you are not a member of this trip" } },
        403,
      );
    }

    const expenseRows = db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.tripId, tripId))
      .all();
    const shareRows = db
      .select({ share: schema.expenseShares })
      .from(schema.expenseShares)
      .innerJoin(schema.expenses, eq(schema.expenses.id, schema.expenseShares.expenseId))
      .where(eq(schema.expenses.tripId, tripId))
      .all()
      .map((r) => r.share);
    const sharesByExpense = new Map<string, (typeof shareRows)[number][]>();
    for (const share of shareRows) {
      const list = sharesByExpense.get(share.expenseId) ?? [];
      list.push(share);
      sharesByExpense.set(share.expenseId, list);
    }

    const paymentRows = db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.tripId, tripId))
      .all();

    const money: TripMoney = {
      expenses: expenseRows.map((row) => serializeExpense(row, sharesByExpense.get(row.id) ?? [])),
      payments: paymentRows.map(serializePayment),
    };
    return c.json(money);
  });
}
