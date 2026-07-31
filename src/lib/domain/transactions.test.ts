import { describe, expect, it } from "vitest";

import { exchangeRate, formatMoney, fromMajor, money } from "@/lib/money";

import type { Transaction, TransactionType } from "./types";
import {
  amountInBase,
  buildTransaction,
  buildTransfer,
  dailyCashFlow,
  netWorthHistory,
  signedAmount,
  spendingByCategory,
  summarizeCashFlow,
} from "./transactions";

const rate = exchangeRate(4100, "USD", "KHR", new Date("2026-01-01"));

function txn(overrides: Partial<Transaction> & Pick<Transaction, "amount" | "currency">): Transaction {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    accountId: "account-1",
    categoryId: null,
    merchantId: null,
    type: "expense",
    exchangeRate: null,
    baseAmount: null,
    baseCurrency: null,
    occurredAt: "2026-07-15T10:00:00.000Z",
    notes: null,
    location: null,
    transferGroupId: null,
    createdVia: "web",
    isPending: false,
    ...overrides,
  } as Transaction;
}

describe("signedAmount", () => {
  it("makes expenses negative from a positive user entry", () => {
    expect(signedAmount("expense", fromMajor(5, "USD")).minor).toBe(-500);
  });

  it("makes income positive", () => {
    expect(signedAmount("income", fromMajor(600, "USD")).minor).toBe(60000);
  });

  it("treats a refund as an inflow", () => {
    expect(signedAmount("refund", fromMajor(20, "USD")).minor).toBe(2000);
  });

  it("is idempotent when the user already typed a negative expense", () => {
    expect(signedAmount("expense", fromMajor(-5, "USD")).minor).toBe(-500);
  });

  it("preserves the caller's sign for adjustments, which go either way", () => {
    expect(signedAmount("adjustment", fromMajor(-3, "USD")).minor).toBe(-300);
    expect(signedAmount("adjustment", fromMajor(3, "USD")).minor).toBe(300);
  });
});

describe("buildTransaction", () => {
  it("stores a same-currency expense with no conversion fields", () => {
    const row = buildTransaction(
      { accountId: "a1", type: "expense", amount: fromMajor(5, "USD") },
      "USD",
      rate,
    );

    expect(row.amount).toBe(-500);
    expect(row.currency).toBe("USD");
    expect(row.exchange_rate).toBeNull();
    expect(row.base_amount).toBeNull();
    expect(row.base_currency).toBeNull();
  });

  it("records the rate and base amount when currencies differ", () => {
    const row = buildTransaction(
      { accountId: "a1", type: "expense", amount: fromMajor(12000, "KHR") },
      "USD",
      rate,
    );

    expect(row.amount).toBe(-12000);
    expect(row.currency).toBe("KHR");
    expect(row.exchange_rate).toBeCloseTo(1 / 4100, 12);
    // 12,000 riel at 4100 is $2.93.
    expect(row.base_amount).toBe(-293);
    expect(row.base_currency).toBe("USD");
  });

  it("defaults provenance to web and carries it through when set", () => {
    const web = buildTransaction(
      { accountId: "a1", type: "expense", amount: fromMajor(1, "USD") },
      "USD",
      rate,
    );
    expect(web.created_via).toBe("web");

    const bot = buildTransaction(
      { accountId: "a1", type: "expense", amount: fromMajor(1, "USD"), createdVia: "telegram" },
      "USD",
      rate,
    );
    expect(bot.created_via).toBe("telegram");
  });
});

describe("buildTransfer", () => {
  it("produces two legs that net to zero in a single currency", () => {
    const [out, incoming] = buildTransfer(
      { fromAccountId: "aba", toAccountId: "wing", amount: fromMajor(100, "USD") },
      "group-1",
      "USD",
      rate,
    );

    expect(out.amount).toBe(-10000);
    expect(incoming.amount).toBe(10000);
    expect(out.amount + incoming.amount).toBe(0);
    expect(out.transfer_group_id).toBe("group-1");
    expect(incoming.transfer_group_id).toBe("group-1");
    expect(out.type).toBe("transfer");
  });

  it("keeps each leg in its own currency for a cross-currency transfer", () => {
    const [out, incoming] = buildTransfer(
      {
        fromAccountId: "aba-usd",
        toAccountId: "wing-khr",
        amount: fromMajor(100, "USD"),
        receivedAmount: fromMajor(410000, "KHR"),
      },
      "group-2",
      "USD",
      rate,
    );

    expect(out.amount).toBe(-10000);
    expect(out.currency).toBe("USD");
    expect(incoming.amount).toBe(410000);
    expect(incoming.currency).toBe("KHR");
    // The receiving leg is converted back for reporting.
    expect(incoming.base_amount).toBe(10000);
  });

  it("honours the actual amount received over the table rate", () => {
    const [, incoming] = buildTransfer(
      {
        fromAccountId: "aba-usd",
        toAccountId: "wing-khr",
        amount: fromMajor(100, "USD"),
        // A worse rate than the table's 4100.
        receivedAmount: fromMajor(400000, "KHR"),
      },
      "group-3",
      "USD",
      rate,
    );

    expect(incoming.amount).toBe(400000);
  });

  it("refuses a transfer to the same account", () => {
    expect(() =>
      buildTransfer(
        { fromAccountId: "same", toAccountId: "same", amount: fromMajor(10, "USD") },
        "group-4",
        "USD",
        rate,
      ),
    ).toThrow(/two different accounts/);
  });
});

describe("amountInBase", () => {
  it("prefers the stored base amount, so history stays stable", () => {
    const stored = txn({
      amount: -12000,
      currency: "KHR",
      baseAmount: -293,
      baseCurrency: "USD",
      exchangeRate: 1 / 4100,
    });

    // A later, very different rate must not change a settled row.
    const laterRate = exchangeRate(9999, "USD", "KHR", new Date("2026-08-01"));
    expect(amountInBase(stored, "USD", laterRate).minor).toBe(-293);
  });

  it("converts on the fly when no base amount was stored", () => {
    const row = txn({ amount: -12000, currency: "KHR" });
    expect(amountInBase(row, "USD", rate).minor).toBe(-293);
  });
});

describe("summarizeCashFlow", () => {
  const transactions = [
    txn({ type: "income", amount: 60000, currency: "USD" }), // +$600 salary
    txn({ type: "expense", amount: -500, currency: "USD" }), // -$5 coffee
    txn({ type: "expense", amount: -20000, currency: "KHR" }), // -20,000 riel = -$4.88
    txn({ type: "refund", amount: 1000, currency: "USD" }), // +$10 refund
  ];

  it("separates income from expense in the base currency", () => {
    const summary = summarizeCashFlow(transactions, "USD", rate);
    expect(summary.income.minor).toBe(61000);
    expect(summary.expense.minor).toBe(988);
    expect(summary.net.minor).toBe(60012);
    expect(formatMoney(summary.net)).toBe("$600.12");
  });

  it("excludes transfers, which would otherwise inflate both sides", () => {
    const withTransfer = [
      ...transactions,
      txn({ type: "transfer", amount: -10000, currency: "USD", transferGroupId: "g1" }),
      txn({ type: "transfer", amount: 10000, currency: "USD", transferGroupId: "g1" }),
    ];

    const summary = summarizeCashFlow(withTransfer, "USD", rate);
    expect(summary.income.minor).toBe(61000);
    expect(summary.expense.minor).toBe(988);
  });

  it("returns zeros for an empty ledger", () => {
    const summary = summarizeCashFlow([], "USD", rate);
    expect(summary.net.minor).toBe(0);
  });

  it("reports in riel when that is the base currency", () => {
    const summary = summarizeCashFlow(
      [txn({ type: "expense", amount: -500, currency: "USD" })],
      "KHR",
      rate,
    );
    expect(summary.expense.minor).toBe(20500);
  });
});

describe("spendingByCategory", () => {
  const transactions = [
    txn({ type: "expense", amount: -2000, currency: "USD", categoryId: "coffee" }),
    txn({ type: "expense", amount: -1000, currency: "USD", categoryId: "coffee" }),
    txn({ type: "expense", amount: -1000, currency: "USD", categoryId: "fuel" }),
    txn({ type: "income", amount: 50000, currency: "USD", categoryId: "salary" }),
  ];

  it("ranks categories by spend and computes shares", () => {
    const totals = spendingByCategory(transactions, "USD", rate);

    expect(totals).toHaveLength(2);
    expect(totals[0].categoryId).toBe("coffee");
    expect(totals[0].total.minor).toBe(3000);
    expect(totals[0].transactionCount).toBe(2);
    expect(totals[0].share).toBeCloseTo(0.75, 10);
    expect(totals[1].categoryId).toBe("fuel");
    expect(totals[1].share).toBeCloseTo(0.25, 10);
  });

  it("excludes income, so shares stay meaningful", () => {
    const totals = spendingByCategory(transactions, "USD", rate);
    expect(totals.some((t) => t.categoryId === "salary")).toBe(false);
  });

  it("shares sum to 1", () => {
    const totals = spendingByCategory(transactions, "USD", rate);
    expect(totals.reduce((a, t) => a + t.share, 0)).toBeCloseTo(1, 10);
  });

  it("groups uncategorised spending under null", () => {
    const totals = spendingByCategory(
      [txn({ type: "expense", amount: -500, currency: "USD", categoryId: null })],
      "USD",
      rate,
    );
    expect(totals[0].categoryId).toBeNull();
  });
});

describe("dailyCashFlow", () => {
  it("fills days with no activity so the chart does not bridge gaps", () => {
    const series = dailyCashFlow(
      [txn({ type: "expense", amount: -500, currency: "USD", occurredAt: "2026-07-02T08:00:00.000Z" })],
      new Date(2026, 6, 1),
      new Date(2026, 6, 5),
      "USD",
      rate,
    );

    expect(series).toHaveLength(5);
    expect(series[0].date).toBe("2026-07-01");
    expect(series[4].date).toBe("2026-07-05");
    expect(series.filter((d) => d.expense.minor > 0)).toHaveLength(1);
  });

  it("is ordered by date ascending", () => {
    const series = dailyCashFlow([], new Date(2026, 6, 1), new Date(2026, 6, 10), "USD", rate);
    const dates = series.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("netWorthHistory", () => {
  it("accumulates from the opening balance", () => {
    const series = netWorthHistory(
      [
        txn({ type: "income", amount: 10000, currency: "USD", occurredAt: "2026-07-01T08:00:00.000Z" }),
        txn({ type: "expense", amount: -2500, currency: "USD", occurredAt: "2026-07-02T08:00:00.000Z" }),
      ],
      money(100000, "USD"),
      new Date(2026, 6, 1),
      new Date(2026, 6, 3),
      "USD",
      rate,
    );

    expect(series[0].value.minor).toBe(110000);
    expect(series[1].value.minor).toBe(107500);
    // No activity on day 3, so the line holds flat rather than dropping.
    expect(series[2].value.minor).toBe(107500);
  });
});

describe("transaction type coverage", () => {
  it("assigns a direction to every declared type", () => {
    const types: TransactionType[] = ["expense", "income", "transfer", "refund", "adjustment"];
    for (const type of types) {
      expect(() => signedAmount(type, fromMajor(1, "USD"))).not.toThrow();
    }
  });
});
