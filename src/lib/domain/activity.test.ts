import { expect, test } from "vitest";
import { DEMO_RATE, DEMO_TRANSACTIONS } from "@/lib/demo-data";
import { monthFromParam } from "@/lib/period";
import { activityCalendar, activityDays, filterActivity, weekdayLabels, weekStart } from "./activity";

const row = DEMO_TRANSACTIONS[0];
test("Cambodia midnight groups, orders, converts, and excludes both transfer legs", () => {
  const rows = [
    { ...row, id: "old", type: "expense" as const, amount: -100, currency: "USD" as const, occurredAt: "2026-10-09T16:59:59Z" },
    { ...row, id: "riel", type: "expense" as const, amount: -1200000, currency: "KHR" as const, baseAmount: -293, baseCurrency: "USD" as const, occurredAt: "2026-10-09T17:00:00Z" },
    { ...row, id: "income", type: "income" as const, amount: 500, currency: "USD" as const, occurredAt: "2026-10-10T01:00:00Z" },
    { ...row, id: "out", type: "transfer" as const, amount: -1000, currency: "USD" as const, occurredAt: "2026-10-10T02:00:00Z" },
    { ...row, id: "in", type: "transfer" as const, amount: 1000, currency: "USD" as const, occurredAt: "2026-10-10T02:00:00Z" },
  ];
  const groups = activityDays(rows, "USD", DEMO_RATE);
  expect(groups.map(group => group.date)).toEqual(["2026-10-10", "2026-10-09"]);
  expect(groups[0]).toMatchObject({ weekday: "Sat", day: 10, flow: { income: { minor: 500 }, expense: { minor: 293 }, net: { minor: 207 } } });
  expect(groups[0].transactions).toHaveLength(4);
  const days = activityCalendar(monthFromParam("2026-10"), groups, "USD", 1, new Date("2026-10-09T18:00:00Z"));
  expect(days[0].date).toBe("2026-09-28");
  expect(days).toHaveLength(35);
  expect(days.find(day => day.date === "2026-10-10")).toMatchObject({ today: true, count: 4, flow: groups[0].flow });
});
test("leap years, month boundaries, and the saved start of week do not depend on host timezone", () => {
  const feb = activityCalendar(monthFromParam("2024-02"), [], "KHR", 0);
  expect(feb.filter(day => day.inMonth)).toHaveLength(29);
  expect(feb[0].date).toBe("2024-01-28");
  expect(weekdayLabels(0)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  expect(weekdayLabels(1)[0]).toBe("Mon");
  expect(weekStart(undefined)).toBe(1);
  expect(weekStart(8)).toBe(1);
});
test("filters apply equally to daily groups and calendar cells, including report links", () => {
  const rows = [
    { ...row, id: "expense", type: "expense" as const, amount: -100, categoryId: null, notes: "Fuel", accountId: "aba" },
    { ...row, id: "refund", type: "refund" as const, amount: 100, categoryId: "fuel", notes: "Fuel refund", accountId: "aba" },
    { ...row, id: "transfer", type: "transfer" as const, amount: 100, categoryId: "fuel", notes: "Fuel refund", accountId: "aba" },
  ];
  expect(filterActivity(rows, { account: "aba", category: "none", q: "fuel", type: "expense" }).map(row => row.id)).toEqual(["expense"]);
  expect(filterActivity(rows, { type: "income", category: "fuel" }).map(row => row.id)).toEqual(["refund"]);
  expect(filterActivity(rows, { type: "transfer" }).map(row => row.id)).toEqual(["transfer"]);
  const filtered = filterActivity(rows, { q: "no match" });
  expect(activityDays(filtered, "USD", DEMO_RATE)).toEqual([]);
  expect(activityCalendar(monthFromParam("2026-07"), [], "USD").every(day => day.count === 0)).toBe(true);
});
