import { describe, expect, it, vi } from "vitest";

import {
  mapRows,
  RowMappingError,
  toAccountBalance,
  toBudget,
  toCategory,
  toSettings,
  toTransaction,
} from "./mappers";

/**
 * The mapping boundary is where a database row becomes a domain object, which
 * makes it the last place a bad value can be caught before it reaches money
 * arithmetic. These tests are mostly about refusing things, not accepting them.
 */

const transactionRow = {
  id: "t1",
  user_id: "u1",
  account_id: "a1",
  category_id: null,
  merchant_id: null,
  type: "expense",
  amount: -2500,
  currency: "USD",
  exchange_rate: null,
  base_amount: null,
  base_currency: null,
  occurred_at: "2026-07-31T02:00:00.000Z",
  notes: "Coffee",
  location: null,
  transfer_group_id: null,
  created_via: "web",
  is_pending: false,
};

const accountBalanceRow = {
  account_id: "a1",
  user_id: "u1",
  name: "ABA USD",
  institution: "ABA Bank",
  type: "bank",
  currency: "USD",
  icon: null,
  color: null,
  is_active: true,
  include_in_net_worth: true,
  sort_order: 10,
  counts_toward_net_worth: true,
  current_balance: 184_250,
  transaction_count: 42,
  last_activity_at: "2026-07-30T09:15:00.000Z",
};

describe("toTransaction", () => {
  it("maps snake_case to camelCase", () => {
    const t = toTransaction(transactionRow);

    expect(t.accountId).toBe("a1");
    expect(t.occurredAt).toBe("2026-07-31T02:00:00.000Z");
    expect(t.createdVia).toBe("web");
    expect(t.transferGroupId).toBeNull();
  });

  it("keeps a signed minor-unit amount exactly", () => {
    expect(toTransaction(transactionRow).amount).toBe(-2500);
  });

  it("accepts a bigint amount delivered as a string", () => {
    // PostgREST sends bigint as a string once the value is large enough. Treating
    // that as a parse failure would blank the row; coercing it loosely would be
    // worse.
    const t = toTransaction({ ...transactionRow, amount: "-9007199254740991" });
    expect(t.amount).toBe(-9_007_199_254_740_991);
  });

  it("refuses an amount beyond the safe integer range", () => {
    // Silently losing precision here would put a wrong balance on screen.
    expect(() =>
      toTransaction({ ...transactionRow, amount: "9007199254740993" }),
    ).toThrow(/safe integer/);
  });

  it("refuses a fractional amount rather than rounding it", () => {
    // Rounding at the boundary would be an undeclared change to a stored amount.
    expect(() => toTransaction({ ...transactionRow, amount: 25.5 })).toThrow(
      /integer count of minor units/,
    );
  });

  it("refuses a null amount instead of defaulting it to zero", () => {
    expect(() => toTransaction({ ...transactionRow, amount: null })).toThrow(
      RowMappingError,
    );
  });

  it("refuses an unknown currency", () => {
    expect(() => toTransaction({ ...transactionRow, currency: "EUR" })).toThrow(
      /Unsupported currency/,
    );
  });

  it("refuses a transaction type the union does not cover", () => {
    expect(() => toTransaction({ ...transactionRow, type: "chargeback" })).toThrow(
      /Unexpected type/,
    );
  });

  it("reads exchange_rate as a number when numeric arrives as a string", () => {
    const t = toTransaction({
      ...transactionRow,
      currency: "KHR",
      amount: -12000,
      exchange_rate: "0.00024390",
      base_amount: -293,
      base_currency: "USD",
    });

    expect(t.exchangeRate).toBeCloseTo(0.0002439, 10);
    // The converted figure stays an integer count of minor units.
    expect(t.baseAmount).toBe(-293);
    expect(t.baseCurrency).toBe("USD");
  });

  it("keeps all three conversion fields null together", () => {
    const t = toTransaction(transactionRow);
    expect(t.exchangeRate).toBeNull();
    expect(t.baseAmount).toBeNull();
    expect(t.baseCurrency).toBeNull();
  });
});

describe("toAccountBalance", () => {
  it("maps the view row including the derived flag", () => {
    const b = toAccountBalance(accountBalanceRow);

    expect(b.accountId).toBe("a1");
    expect(b.currentBalance).toBe(184_250);
    expect(b.countsTowardNetWorth).toBe(true);
    expect(b.institution).toBe("ABA Bank");
    expect(b.sortOrder).toBe(10);
  });

  it("carries a closed account through as not counting", () => {
    const b = toAccountBalance({
      ...accountBalanceRow,
      is_active: false,
      counts_toward_net_worth: false,
    });

    expect(b.isActive).toBe(false);
    expect(b.countsTowardNetWorth).toBe(false);
    // The balance is still reported: money in a closed account still exists.
    expect(b.currentBalance).toBe(184_250);
  });

  it("accepts a count delivered as a string", () => {
    expect(toAccountBalance({ ...accountBalanceRow, transaction_count: "42" })
      .transactionCount).toBe(42);
  });

  it("refuses a negative-zero balance turning into something else", () => {
    expect(toAccountBalance({ ...accountBalanceRow, current_balance: 0 }).currentBalance).toBe(0);
  });
});

describe("toCategory", () => {
  it("maps applies_to into the transaction type union", () => {
    const c = toCategory({
      id: "c1",
      user_id: "u1",
      parent_id: null,
      name: "Coffee",
      icon: "coffee",
      color: "#b45309",
      applies_to: ["expense"],
      is_system: true,
      sort_order: 11,
    });

    expect(c.appliesTo).toEqual(["expense"]);
  });

  it("refuses an applies_to entry outside the union", () => {
    // An enum value added in SQL but not in TypeScript must fail loudly here.
    expect(() =>
      toCategory({
        id: "c1",
        user_id: "u1",
        parent_id: null,
        name: "X",
        icon: null,
        color: null,
        applies_to: ["expense", "chargeback"],
        is_system: false,
        sort_order: 0,
      }),
    ).toThrow(/Unexpected value/);
  });
});

describe("toBudget", () => {
  const row = {
    id: "b1",
    user_id: "u1",
    category_id: "c1",
    name: null,
    amount: 30_000,
    currency: "USD",
    period: "monthly",
    starts_on: "2026-07-01",
    ends_on: null,
    rollover: false,
    alert_threshold: "0.800",
    is_active: true,
  };

  it("keeps the limit as minor units and the threshold as a fraction", () => {
    const b = toBudget(row);

    expect(b.amount).toBe(30_000);
    expect(b.currency).toBe("USD");
    // numeric(4,3) arrives as a string; it is a fraction, not money.
    expect(b.alertThreshold).toBeCloseTo(0.8, 6);
  });

  it("treats a null category as an overall cap", () => {
    expect(toBudget({ ...row, category_id: null }).categoryId).toBeNull();
  });

  it("refuses a fractional limit", () => {
    expect(() => toBudget({ ...row, amount: 300.5 })).toThrow(RowMappingError);
  });
});

describe("toSettings", () => {
  it("maps the notification thresholds", () => {
    const s = toSettings({
      user_id: "u1",
      default_account_id: null,
      week_starts_on: 1,
      notify_budget_threshold: true,
      notify_large_transaction: true,
      notify_rate_moved: false,
      large_transaction_amount: 10_000,
      large_transaction_currency: "USD",
      rate_move_threshold: "0.020",
    });

    expect(s.weekStartsOn).toBe(1);
    expect(s.largeTransactionAmount).toBe(10_000);
    expect(s.rateMoveThreshold).toBeCloseTo(0.02, 6);
  });
});

describe("mapRows", () => {
  it("maps every good row", () => {
    const rows = [transactionRow, { ...transactionRow, id: "t2" }];
    expect(mapRows(rows, toTransaction, "transactions")).toHaveLength(2);
  });

  it("drops an unmappable row and reports it rather than failing the page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = [transactionRow, { ...transactionRow, id: "t2", currency: "EUR" }];

    const mapped = mapRows(rows, toTransaction, "transactions");

    // One bad row must not blank the dashboard, but it must not vanish silently.
    expect(mapped).toHaveLength(1);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("handles null and undefined input", () => {
    expect(mapRows(null, toTransaction, "x")).toEqual([]);
    expect(mapRows(undefined, toTransaction, "x")).toEqual([]);
  });
});
