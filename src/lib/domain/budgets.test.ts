import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeRate, formatMoney } from "@/lib/money";

import {
  budgetProgress,
  computePaceStatus,
  currentPeriod,
  periodPace,
  spentForBudget,
  summarizeBudgets,
  summarizeBudgetsOverview,
  totalRemaining,
} from "./budgets";
import type { Budget, Transaction } from "./types";

const rate = exchangeRate(4100, "USD", "KHR", new Date("2026-07-01"));

const at = (year: number, month: number, day: number) =>
  new Date(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);

afterEach(() => vi.unstubAllEnvs());

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "b1",
    userId: "u1",
    categoryId: "cat-groceries",
    name: null,
    amount: 10_000, // $100
    currency: "USD",
    period: "monthly",
    startsOn: "2026-07-01",
    endsOn: null,
    rollover: false,
    alertThreshold: 0.8,
    isActive: true,
    ...overrides,
  };
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    userId: "u1",
    accountId: "a1",
    categoryId: "cat-groceries",
    merchantId: null,
    type: "expense",
    amount: -2_500,
    currency: "USD",
    exchangeRate: null,
    baseAmount: null,
    baseCurrency: null,
    occurredAt: "2026-07-10T03:00:00.000Z",
    notes: null,
    location: null,
    transferGroupId: null,
    createdVia: "web",
    isPending: false,
    ...overrides,
  };
}

describe("currentPeriod", () => {
  it.each(["UTC", "America/Los_Angeles", "Asia/Phnom_Penh"])("changes anchored periods at Cambodia midnight on a %s host", (timezone) => {
    vi.stubEnv("TZ", timezone);
    const b = { period: "monthly" as const, startsOn: "2026-07-15" };
    const before = currentPeriod(b, new Date("2026-08-14T16:59:59.999Z"));
    const after = currentPeriod(b, new Date("2026-08-14T17:00:00.000Z"));
    expect(before.from.toISOString()).toBe("2026-07-14T17:00:00.000Z");
    expect(before.to.toISOString()).toBe("2026-08-14T17:00:00.000Z");
    expect(after.from.toISOString()).toBe("2026-08-14T17:00:00.000Z");
    expect(after.to.toISOString()).toBe("2026-09-14T17:00:00.000Z");
  });

  it("keeps a weekly window seven full days across the host's DST transition", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    const window = currentPeriod({ period: "weekly", startsOn: "2026-03-06" }, new Date("2026-03-08T18:00:00Z"));
    expect(window.from.toISOString()).toBe("2026-03-05T17:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-03-12T17:00:00.000Z");
    expect(window.to.getTime() - window.from.getTime()).toBe(7 * 86_400_000);
  });

  it("restores the original 31st anchor after a leap February clamp", () => {
    const window = currentPeriod({ period: "monthly", startsOn: "2028-01-31" }, new Date("2028-02-29T18:00:00Z"));
    expect(window.from.toISOString()).toBe("2028-02-28T17:00:00.000Z");
    expect(window.to.toISOString()).toBe("2028-03-30T17:00:00.000Z");
  });

  it("runs from the budget's own anchor day, not the calendar month", () => {
    // Someone paid on the 15th thinks in 15th-to-14th months.
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-07-15" },
      at(2026, 7, 3), // 3 August
    );

    expect(window.from).toEqual(at(2026, 6, 15));
    expect(window.to).toEqual(at(2026, 7, 15));
  });

  it("advances to the next window once the anchor day passes", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-07-15" },
      at(2026, 7, 15),
    );

    expect(window.from).toEqual(at(2026, 7, 15));
    expect(window.to).toEqual(at(2026, 8, 15));
  });

  it("includes the first day of the window", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-07-01" },
      at(2026, 6, 1),
    );

    expect(window.from).toEqual(at(2026, 6, 1));
  });

  it("clamps a 31st anchor into a short month instead of rolling over", () => {
    // Naive date arithmetic turns 31 February into 3 March and shifts every later
    // window; the anchor has to stay put.
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-01-31" },
      at(2026, 1, 10), // 10 February
    );

    expect(window.from).toEqual(at(2026, 0, 31));
    expect(window.to).toEqual(at(2026, 1, 28));
  });

  it("handles weekly windows", () => {
    const window = currentPeriod(
      { period: "weekly", startsOn: "2026-07-06" },
      at(2026, 6, 16),
    );

    expect(window.from).toEqual(at(2026, 6, 13));
    expect(window.to).toEqual(at(2026, 6, 20));
  });

  it("handles quarterly windows", () => {
    const window = currentPeriod(
      { period: "quarterly", startsOn: "2026-01-01" },
      at(2026, 7, 15),
    );

    expect(window.from).toEqual(at(2026, 6, 1));
    expect(window.to).toEqual(at(2026, 9, 1));
  });

  it("handles yearly windows", () => {
    const window = currentPeriod(
      { period: "yearly", startsOn: "2024-03-01" },
      at(2026, 5, 1),
    );

    expect(window.from).toEqual(at(2026, 2, 1));
    expect(window.to).toEqual(at(2027, 2, 1));
  });

  it("reports the first window for a budget that has not started", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-12-01" },
      at(2026, 6, 1),
    );

    expect(window.from).toEqual(at(2026, 11, 1));
  });

  it("stays correct many periods out", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2020-01-10" },
      at(2026, 6, 20),
    );

    expect(window.from).toEqual(at(2026, 6, 10));
    expect(window.to).toEqual(at(2026, 7, 10));
  });
});

describe("spentForBudget", () => {
  const now = at(2026, 6, 20);

  it("includes a Cambodia boundary entry exactly once and preserves USD/KHR conversion", () => {
    vi.stubEnv("TZ", "UTC");
    const { spent } = spentForBudget(budget(), [
      txn({ amount: -900, occurredAt: "2026-06-30T16:59:59.999Z" }),
      txn({ amount: -525, occurredAt: "2026-06-30T17:00:00.000Z" }),
      txn({ amount: -410000, currency: "KHR", occurredAt: "2026-07-31T16:59:59.999Z" }),
      txn({ amount: -900, occurredAt: "2026-07-31T17:00:00.000Z" }),
      txn({ amount: -5000, type: "transfer", occurredAt: "2026-06-30T17:00:00.000Z" }),
    ], rate, now);
    expect(spent.minor).toBe(625);
    expect(spent.currency).toBe("USD");
  });

  it("counts only outflows in the current window", () => {
    const { spent } = spentForBudget(
      budget(),
      [
        txn({ amount: -2_500 }),
        txn({ amount: -1_500 }),
        // Income must not offset spending, or a salary would blank the budget.
        txn({ amount: 50_000, type: "income", categoryId: "cat-groceries" }),
      ],
      rate,
      now,
    );

    expect(spent.minor).toBe(4_000);
  });

  it("ignores transactions outside the window", () => {
    const { spent } = spentForBudget(
      budget(),
      [txn({ amount: -2_500 }), txn({ amount: -9_900, occurredAt: "2026-06-10T03:00:00.000Z" })],
      rate,
      now,
    );

    expect(spent.minor).toBe(2_500);
  });

  it("ignores other categories", () => {
    const { spent } = spentForBudget(
      budget(),
      [txn({ amount: -2_500 }), txn({ amount: -7_000, categoryId: "cat-coffee" })],
      rate,
      now,
    );

    expect(spent.minor).toBe(2_500);
  });

  it("counts every category against an overall cap, uncategorised included", () => {
    const { spent } = spentForBudget(
      budget({ categoryId: null }),
      [
        txn({ amount: -2_500, categoryId: "cat-groceries" }),
        txn({ amount: -1_000, categoryId: "cat-coffee" }),
        txn({ amount: -500, categoryId: null }),
      ],
      rate,
      now,
    );

    expect(spent.minor).toBe(4_000);
  });

  it("excludes transfers, which move money without spending it", () => {
    const { spent } = spentForBudget(
      budget({ categoryId: null }),
      [
        txn({ amount: -2_500 }),
        txn({ amount: -50_000, type: "transfer", transferGroupId: "g1", categoryId: null }),
      ],
      rate,
      now,
    );

    expect(spent.minor).toBe(2_500);
  });

  it("converts riel spending into a dollar budget across the scale gap", () => {
    const { spent } = spentForBudget(
      budget(),
      [txn({ amount: -4100000, currency: "KHR" })],
      rate,
      now,
    );

    // 41,000៛ at 4,100 is $10.00, so 1000 cents, not 41,000.
    expect(spent.minor).toBe(1_000);
    expect(formatMoney(spent)).toBe("$10.00");
  });

  it("prefers the rate stored on the transaction, so history stays put", () => {
    const laterRate = exchangeRate(9_999, "USD", "KHR", new Date("2026-08-01"));

    const { spent } = spentForBudget(
      budget(),
      [
        txn({
          amount: -4100000,
          currency: "KHR",
          baseAmount: -1_000,
          baseCurrency: "USD",
          exchangeRate: 1 / 4100,
        }),
      ],
      laterRate,
      now,
    );

    expect(spent.minor).toBe(1_000);
  });
});

describe("budgetProgress", () => {
  const now = at(2026, 6, 20);

  it("reports remaining and the fraction used", () => {
    const progress = budgetProgress(budget(), [txn({ amount: -2_500 })], rate, now);

    expect(progress.limit.minor).toBe(10_000);
    expect(progress.spent.minor).toBe(2_500);
    expect(progress.remaining.minor).toBe(7_500);
    expect(progress.fraction).toBeCloseTo(0.25, 6);
    expect(progress.status).toBe("under");
  });

  it("warns once the alert threshold is reached", () => {
    const progress = budgetProgress(budget(), [txn({ amount: -8_000 })], rate, now);

    expect(progress.fraction).toBeCloseTo(0.8, 6);
    expect(progress.status).toBe("warning");
  });

  it("reports overspending with a negative remaining", () => {
    const progress = budgetProgress(budget(), [txn({ amount: -12_500 })], rate, now);

    expect(progress.status).toBe("over");
    expect(progress.remaining.minor).toBe(-2_500);
    expect(progress.fraction).toBeCloseTo(1.25, 6);
  });

  it("treats exactly the limit as not yet over", () => {
    // Spending your whole budget is not overspending it.
    const progress = budgetProgress(budget(), [txn({ amount: -10_000 })], rate, now);

    expect(progress.status).toBe("warning");
    expect(progress.remaining.minor).toBe(0);
  });

  it("reports zero remaining as exactly zero, never negative zero", () => {
    const progress = budgetProgress(budget(), [txn({ amount: -10_000 })], rate, now);
    expect(Object.is(progress.remaining.minor, -0)).toBe(false);
    expect(formatMoney(progress.remaining)).toBe("$0.00");
  });

  it("counts the days left in the window", () => {
    const progress = budgetProgress(
      budget({ startsOn: "2026-07-01" }),
      [],
      rate,
      at(2026, 6, 30),
    );

    // Window ends 1 August, so 30 July has one day left after today.
    expect(progress.daysRemaining).toBe(1);
  });

  it("reports no days remaining on the last day", () => {
    const progress = budgetProgress(
      budget({ startsOn: "2026-07-01" }),
      [],
      rate,
      at(2026, 6, 31),
    );

    expect(progress.daysRemaining).toBe(0);
  });

  it("handles a riel budget", () => {
    const progress = budgetProgress(
      budget({ amount: 40000000, currency: "KHR" }),
      [txn({ amount: -10000000, currency: "KHR" })],
      rate,
      now,
    );

    expect(progress.spent.minor).toBe(10000000);
    expect(progress.remaining.minor).toBe(30000000);
    expect(formatMoney(progress.remaining)).toBe("300,000៛");
  });
});

describe("summarizeBudgets", () => {
  const now = at(2026, 6, 20);

  it("skips inactive budgets", () => {
    const result = summarizeBudgets(
      [budget(), budget({ id: "b2", isActive: false })],
      [],
      rate,
      now,
    );

    expect(result).toHaveLength(1);
  });

  it("puts the most-used budget first, since that is the one to act on", () => {
    const result = summarizeBudgets(
      [
        budget({ id: "quiet", categoryId: "cat-coffee", amount: 10_000 }),
        budget({ id: "blown", categoryId: "cat-groceries", amount: 2_000 }),
      ],
      [
        txn({ amount: -500, categoryId: "cat-coffee" }),
        txn({ amount: -3_000, categoryId: "cat-groceries" }),
      ],
      rate,
      now,
    );

    expect(result[0].budget.id).toBe("blown");
    expect(result[0].status).toBe("over");
  });
});

describe("totalRemaining", () => {
  const now = at(2026, 6, 20);

  it("sums what is left across category budgets", () => {
    const progress = summarizeBudgets(
      [
        budget({ id: "b1", categoryId: "cat-groceries", amount: 10_000 }),
        budget({ id: "b2", categoryId: "cat-coffee", amount: 5_000 }),
      ],
      [txn({ amount: -2_500, categoryId: "cat-groceries" })],
      rate,
      now,
    );

    // 7,500 + 5,000 left.
    expect(totalRemaining(progress, "USD", rate).minor).toBe(12_500);
  });

  it("excludes an overall cap, which would double-count the same spending", () => {
    const progress = summarizeBudgets(
      [
        budget({ id: "cat", categoryId: "cat-groceries", amount: 10_000 }),
        budget({ id: "all", categoryId: null, amount: 100_000 }),
      ],
      [txn({ amount: -2_500 })],
      rate,
      now,
    );

    expect(totalRemaining(progress, "USD", rate).minor).toBe(7_500);
  });

  it("converts a riel budget into a dollar total", () => {
    const progress = summarizeBudgets(
      [budget({ amount: 41000000, currency: "KHR" })],
      [],
      rate,
      now,
    );

    expect(totalRemaining(progress, "USD", rate).minor).toBe(10_000);
  });
});

describe("pace marker and elapsed share", () => {
  it("computes elapsed days 1-indexed inside the active month", () => {
    const window = { from: at(2026, 6, 1), to: at(2026, 7, 1) }; // 31 days in July
    const day1 = periodPace(window, new Date("2026-07-01T05:00:00Z"), "Asia/Phnom_Penh");
    expect(day1).toEqual({ totalDays: 31, elapsedDays: 1, elapsedShare: 1 / 31 });

    const day15 = periodPace(window, new Date("2026-07-15T05:00:00Z"), "Asia/Phnom_Penh");
    expect(day15).toEqual({ totalDays: 31, elapsedDays: 15, elapsedShare: 15 / 31 });

    const lastDay = periodPace(window, new Date("2026-07-31T10:00:00Z"), "Asia/Phnom_Penh");
    expect(lastDay).toEqual({ totalDays: 31, elapsedDays: 31, elapsedShare: 1 });
  });

  it("returns null elapsedShare for past and future periods so no pace tick renders", () => {
    const pastWindow = { from: at(2026, 5, 1), to: at(2026, 6, 1) }; // June
    const futureWindow = { from: at(2026, 7, 1), to: at(2026, 8, 1) }; // August
    const midJuly = new Date("2026-07-15T05:00:00Z");

    expect(periodPace(pastWindow, midJuly, "Asia/Phnom_Penh").elapsedShare).toBeNull();
    expect(periodPace(futureWindow, midJuly, "Asia/Phnom_Penh").elapsedShare).toBeNull();
  });

  it("uses the user timezone to determine today at midnight boundaries", () => {
    const window = { from: at(2026, 6, 1), to: at(2026, 7, 1) };
    // 2026-07-15T20:00:00Z is July 16 in Phnom Penh (UTC+7), still July 15 in Los Angeles (UTC-7).
    const instant = new Date("2026-07-15T20:00:00Z");
    expect(periodPace(window, instant, "Asia/Phnom_Penh").elapsedDays).toBe(16);
    expect(periodPace(window, instant, "America/Los_Angeles").elapsedDays).toBe(15);
  });

  it("classifies pace status across +/-10pp boundaries and over 100%", () => {
    // At 50% elapsed: <40% under-pace, [40%, 60%] on-pace, (60%, 100%] ahead-of-pace, >100% over
    expect(computePaceStatus(0.39, 0.5, false)).toBe("under-pace");
    expect(computePaceStatus(0.4, 0.5, false)).toBe("on-pace");
    expect(computePaceStatus(0.5, 0.5, false)).toBe("on-pace");
    expect(computePaceStatus(0.6, 0.5, false)).toBe("on-pace");
    expect(computePaceStatus(0.61, 0.5, false)).toBe("ahead-of-pace");
    expect(computePaceStatus(1.0, 0.5, false)).toBe("ahead-of-pace");
    expect(computePaceStatus(1.01, 0.5, true)).toBe("over");

    // Float boundary at 80% elapsed: 70% is exactly 10pp under -> on-pace, 69.9% -> under-pace
    expect(computePaceStatus(0.7, 0.8, false)).toBe("on-pace");
    expect(computePaceStatus(0.699, 0.8, false)).toBe("under-pace");
  });

  it("populates fillRatio and paceStatus on budgetProgress and clamps fillRatio at 1", () => {
    // 1 June to 1 July (30 days); on 15 June elapsedDays = 15, elapsedShare = 0.5.
    const now = new Date("2026-06-15T05:00:00Z");
    const b = budget({ startsOn: "2026-06-01", amount: 10_000 });

    const under = budgetProgress(b, [txn({ amount: -2_000, occurredAt: "2026-06-10T05:00:00Z" })], rate, now, "Asia/Phnom_Penh");
    expect(under.paceStatus).toBe("under-pace");
    expect(under.fillRatio).toBeCloseTo(0.2, 6);
    expect(under.elapsedShare).toBeCloseTo(0.5, 6);

    const onPace = budgetProgress(b, [txn({ amount: -5_000, occurredAt: "2026-06-10T05:00:00Z" })], rate, now, "Asia/Phnom_Penh");
    expect(onPace.paceStatus).toBe("on-pace");

    const ahead = budgetProgress(b, [txn({ amount: -7_500, occurredAt: "2026-06-10T05:00:00Z" })], rate, now, "Asia/Phnom_Penh");
    expect(ahead.paceStatus).toBe("ahead-of-pace");

    const over = budgetProgress(b, [txn({ amount: -12_500, occurredAt: "2026-06-10T05:00:00Z" })], rate, now, "Asia/Phnom_Penh");
    expect(over.paceStatus).toBe("over");
    expect(over.fillRatio).toBe(1);
    expect(over.remaining.minor).toBe(-2_500);
  });

  it("summarizes budgets overview across currencies without double-counting overall caps", () => {
    const now = new Date("2026-06-15T05:00:00Z");
    const progress = summarizeBudgets(
      [
        budget({ id: "b1", categoryId: "cat-groceries", startsOn: "2026-06-01", amount: 10_000 }),
        budget({ id: "b2", categoryId: "cat-coffee", startsOn: "2026-06-01", amount: 41_000_000, currency: "KHR" }), // $100
        budget({ id: "overall", categoryId: null, startsOn: "2026-06-01", amount: 50_000 }),
      ],
      [
        txn({ amount: -5_000, categoryId: "cat-groceries", occurredAt: "2026-06-10T05:00:00Z" }),
        txn({ amount: -20_500_000, currency: "KHR", categoryId: "cat-coffee", occurredAt: "2026-06-10T05:00:00Z" }),
      ],
      rate,
      now,
      "Asia/Phnom_Penh",
    );
    const overview = summarizeBudgetsOverview(progress, "USD", rate);
    expect(overview.totalLimit.minor).toBe(20_000);
    expect(overview.totalSpent.minor).toBe(10_000);
    expect(overview.percent).toBe(50);
    expect(overview.paceStatus).toBe("on-pace");
  });
});
