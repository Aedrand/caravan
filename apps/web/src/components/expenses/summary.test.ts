import type { Expense } from "@caravan/shared";
import { expect, test } from "vitest";
import { categoryTotals, totalSpend } from "./summary";

function expense(category: Expense["category"], amountMinor: number): Expense {
  return {
    id: "e",
    tripId: "t",
    paidBy: "m",
    amountMinor,
    description: "x",
    category,
    notes: "",
    date: null,
    activityId: null,
    shares: [{ memberId: "m", amountMinor }],
    createdBy: "m",
    createdAt: 0,
    updatedAt: 0,
  };
}

test("categoryTotals aggregates and sorts largest first", () => {
  const totals = categoryTotals([
    expense("food", 1000),
    expense("food", 500),
    expense("transport", 2000),
  ]);
  expect(totals).toEqual([
    { category: "transport", totalMinor: 2000 },
    { category: "food", totalMinor: 1500 },
  ]);
});

test("categoryTotals is empty with no expenses", () => {
  expect(categoryTotals([])).toEqual([]);
});

test("totalSpend sums every expense", () => {
  expect(totalSpend([expense("food", 1000), expense("other", 250)])).toBe(1250);
});
