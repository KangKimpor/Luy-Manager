import { describe, expect, it } from "vitest";

import { exchangeRate, formatMoney } from "@/lib/money";

import {
  budgetProgress,
  currentPeriod,
  spentForBudget,
  summarizeBudgets,
  totalRemaining,
} from "./budgets";
import type { Budget, Transaction } from "./types";

const rate = exchangeRate(4100, "USD", "KHR", new Date("2026-07-01"));

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
  it("runs from the budget's own anchor day, not the calendar month", () => {
    // Someone paid on the 15th thinks in 15th-to-14th months.
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-07-15" },
      new Date(2026, 7, 3), // 3 August
    );

    expect(window.from).toEqual(new Date(2026, 6, 15));
    expect(window.to).toEqual(new Date(2026, 7, 15));
  });

  it("advances to the next window once the anchor day passes", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-07-15" },
      new Date(2026, 7, 15),
    );

    expect(window.from).toEqual(new Date(2026, 7, 15));
    expect(window.to).toEqual(new Date(2026, 8, 15));
  });

  it("includes the first day of the window", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-07-01" },
      new Date(2026, 6, 1),
    );

    expect(window.from).toEqual(new Date(2026, 6, 1));
  });

  it("clamps a 31st anchor into a short month instead of rolling over", () => {
    // Naive date arithmetic turns 31 February into 3 March and shifts every later
    // window; the anchor has to stay put.
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-01-31" },
      new Date(2026, 1, 10), // 10 February
    );

    expect(window.from).toEqual(new Date(2026, 0, 31));
    expect(window.to).toEqual(new Date(2026, 1, 28));
  });

  it("handles weekly windows", () => {
    const window = currentPeriod(
      { period: "weekly", startsOn: "2026-07-06" },
      new Date(2026, 6, 16),
    );

    expect(window.from).toEqual(new Date(2026, 6, 13));
    expect(window.to).toEqual(new Date(2026, 6, 20));
  });

  it("handles quarterly windows", () => {
    const window = currentPeriod(
      { period: "quarterly", startsOn: "2026-01-01" },
      new Date(2026, 7, 15),
    );

    expect(window.from).toEqual(new Date(2026, 6, 1));
    expect(window.to).toEqual(new Date(2026, 9, 1));
  });

  it("handles yearly windows", () => {
    const window = currentPeriod(
      { period: "yearly", startsOn: "2024-03-01" },
      new Date(2026, 5, 1),
    );

    expect(window.from).toEqual(new Date(2026, 2, 1));
    expect(window.to).toEqual(new Date(2027, 2, 1));
  });

  it("reports the first window for a budget that has not started", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2026-12-01" },
      new Date(2026, 6, 1),
    );

    expect(window.from).toEqual(new Date(2026, 11, 1));
  });

  it("stays correct many periods out", () => {
    const window = currentPeriod(
      { period: "monthly", startsOn: "2020-01-10" },
      new Date(2026, 6, 20),
    );

    expect(window.from).toEqual(new Date(2026, 6, 10));
    expect(window.to).toEqual(new Date(2026, 7, 10));
  });
});

describe("spentForBudget", () => {
  const now = new Date(2026, 6, 20);

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
      [txn({ amount: -41_000, currency: "KHR" })],
      rate,
      now,
    );

    // 41,000៛ at 4,100 is $10.00, so 1000 cents — not 41,000.
    expect(spent.minor).toBe(1_000);
    expect(formatMoney(spent)).toBe("$10.00");
  });

  it("prefers the rate stored on the transaction, so history stays put", () => {
    const laterRate = exchangeRate(9_999, "USD", "KHR", new Date("2026-08-01"));

    const { spent } = spentForBudget(
      budget(),
      [
        txn({
          amount: -41_000,
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
  const now = new Date(2026, 6, 20);

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
      new Date(2026, 6, 30),
    );

    // Window ends 1 August, so 30 July has one day left after today.
    expect(progress.daysRemaining).toBe(1);
  });

  it("reports no days remaining on the last day", () => {
    const progress = budgetProgress(
      budget({ startsOn: "2026-07-01" }),
      [],
      rate,
      new Date(2026, 6, 31),
    );

    expect(progress.daysRemaining).toBe(0);
  });

  it("handles a riel budget", () => {
    const progress = budgetProgress(
      budget({ amount: 400_000, currency: "KHR" }),
      [txn({ amount: -100_000, currency: "KHR" })],
      rate,
      now,
    );

    expect(progress.spent.minor).toBe(100_000);
    expect(progress.remaining.minor).toBe(300_000);
    expect(formatMoney(progress.remaining)).toBe("300,000៛");
  });
});

describe("summarizeBudgets", () => {
  const now = new Date(2026, 6, 20);

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
  const now = new Date(2026, 6, 20);

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
      [budget({ amount: 410_000, currency: "KHR" })],
      [],
      rate,
      now,
    );

    expect(totalRemaining(progress, "USD", rate).minor).toBe(10_000);
  });
});
