import type { Activity, ActivityCategory } from "@caravan/shared";
import { describe, expect, test } from "vitest";
import {
  activityCategoryToExpenseCategory,
  budgetStatus,
  dayPlannedMinor,
  plannedMinor,
} from "./budget";

const id = (n: number) => n.toString(16).padStart(32, "0");

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: id(1),
    tripId: id(99),
    date: "2026-07-04",
    position: "a0",
    title: "Stop",
    startTime: null,
    endTime: null,
    placeName: null,
    address: null,
    lat: null,
    lng: null,
    placeProvider: null,
    placeRef: null,
    category: "other",
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
    createdBy: id(98),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("plannedMinor", () => {
  test("sums estimates across dated activities of any type", () => {
    const total = plannedMinor([
      activity({ estimatedCostMinor: 1000 }),
      activity({ type: "lodging", estimatedCostMinor: 5000 }),
      activity({ type: "flight", estimatedCostMinor: 32000 }),
      activity({ type: "note", estimatedCostMinor: 250 }),
    ]);
    expect(total).toBe(38250);
  });

  test("excludes ideas (date === null) even when they carry an estimate", () => {
    const total = plannedMinor([
      activity({ date: "2026-07-04", estimatedCostMinor: 1000 }),
      activity({ date: null, estimatedCostMinor: 9999 }),
    ]);
    expect(total).toBe(1000);
  });

  test("skips null estimates but counts a 0 estimate", () => {
    const total = plannedMinor([
      activity({ estimatedCostMinor: null }),
      activity({ estimatedCostMinor: 0 }),
      activity({ estimatedCostMinor: 1500 }),
    ]);
    expect(total).toBe(1500);
  });

  test("is 0 with no activities or all-ideas", () => {
    expect(plannedMinor([])).toBe(0);
    expect(
      plannedMinor([
        activity({ date: null, estimatedCostMinor: 1000 }),
        activity({ date: null, estimatedCostMinor: 2000 }),
      ]),
    ).toBe(0);
  });
});

describe("dayPlannedMinor", () => {
  test("sums only the given day's estimates", () => {
    const activities = [
      activity({ date: "2026-07-04", estimatedCostMinor: 1000 }),
      activity({ date: "2026-07-04", estimatedCostMinor: 500 }),
      activity({ date: "2026-07-05", estimatedCostMinor: 9999 }),
      activity({ date: "2026-07-04", estimatedCostMinor: null }),
    ];
    expect(dayPlannedMinor(activities, "2026-07-04")).toBe(1500);
    expect(dayPlannedMinor(activities, "2026-07-05")).toBe(9999);
  });

  test("counts a 0 estimate and is 0 for a day with none", () => {
    const activities = [activity({ date: "2026-07-04", estimatedCostMinor: 0 })];
    expect(dayPlannedMinor(activities, "2026-07-04")).toBe(0);
    expect(dayPlannedMinor(activities, "2026-07-06")).toBe(0);
  });
});

describe("budgetStatus", () => {
  test("planned === 0 guards to 'under' regardless of actual", () => {
    expect(budgetStatus(0, 0)).toBe("under");
    expect(budgetStatus(0, 5000)).toBe("under");
  });

  test("'over' when actual exceeds planned", () => {
    expect(budgetStatus(1000, 1001)).toBe("over");
  });

  test("'warning' at exactly 90% of planned (boundary)", () => {
    expect(budgetStatus(1000, 900)).toBe("warning");
    expect(budgetStatus(1000, 1000)).toBe("warning");
  });

  test("'under' just below the 90% threshold", () => {
    expect(budgetStatus(1000, 899)).toBe("under");
    expect(budgetStatus(1000, 0)).toBe("under");
  });
});

describe("activityCategoryToExpenseCategory", () => {
  test("maps every activity category to its expense category", () => {
    const map: Record<ActivityCategory, string> = {
      food: "food",
      sights: "activities",
      activity: "activities",
      transport: "transport",
      lodging: "accommodation",
      shopping: "shopping",
      other: "other",
    };
    for (const [activityCat, expenseCat] of Object.entries(map)) {
      expect(activityCategoryToExpenseCategory(activityCat as ActivityCategory)).toBe(expenseCat);
    }
  });
});
