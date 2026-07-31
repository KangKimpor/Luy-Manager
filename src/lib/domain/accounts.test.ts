import { describe, expect, it } from "vitest";

import { exchangeRate, formatMoney } from "@/lib/money";

import { ACCOUNT_PRESETS, ACCOUNT_TYPE_LABELS, summarizeNetWorth } from "./accounts";
import { ACCOUNT_TYPES, type AccountBalance, type AccountType } from "./types";

const rate = exchangeRate(4100, "USD", "KHR", new Date("2026-01-01"));

function balance(
  overrides: Partial<AccountBalance> & Pick<AccountBalance, "currentBalance" | "currency" | "type">,
): AccountBalance {
  const isActive = overrides.isActive ?? true;
  const includeInNetWorth = overrides.includeInNetWorth ?? true;

  return {
    accountId: crypto.randomUUID(),
    userId: "user-1",
    name: "Account",
    institution: null,
    icon: null,
    color: null,
    sortOrder: 0,
    transactionCount: 0,
    lastActivityAt: null,
    ...overrides,
    isActive,
    includeInNetWorth,
    // Derived in the view, mirrored here so the tests exercise the same rule
    // rather than letting a caller set an inconsistent combination.
    countsTowardNetWorth: isActive && includeInNetWorth,
  } as AccountBalance;
}

describe("presets", () => {
  it("covers the institutions named in PRD Section 6", () => {
    const labels = ACCOUNT_PRESETS.map((p) => p.label);
    for (const expected of ["ABA Bank", "ACLEDA Bank", "Wing", "TrueMoney", "Credit Card"]) {
      expect(labels).toContain(expected);
    }
  });

  it("offers both a USD and a KHR cash account, since people hold both", () => {
    const cash = ACCOUNT_PRESETS.filter((p) => p.type === "cash");
    expect(cash.map((p) => p.currencies[0]).sort()).toEqual(["KHR", "USD"]);
  });

  it("gives every preset at least one currency and a valid type", () => {
    for (const preset of ACCOUNT_PRESETS) {
      expect(preset.currencies.length).toBeGreaterThan(0);
      expect(ACCOUNT_TYPES).toContain(preset.type);
    }
  });

  it("labels every account type", () => {
    for (const type of ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPE_LABELS[type as AccountType]).toBeTruthy();
    }
  });
});

describe("summarizeNetWorth", () => {
  const balances = [
    balance({ currentBalance: 150_000, currency: "USD", type: "bank" }), // $1,500
    balance({ currentBalance: 2_050_000, currency: "KHR", type: "ewallet" }), // $500
    balance({ currentBalance: 25_000, currency: "USD", type: "cash" }), // $250
    balance({ currentBalance: 500_000, currency: "USD", type: "savings" }), // $5,000
    balance({ currentBalance: 300_000, currency: "USD", type: "investment" }), // $3,000
    balance({ currentBalance: -45_000, currency: "USD", type: "credit_card" }), // -$450
  ];

  it("totals mixed-currency accounts into the base currency", () => {
    const summary = summarizeNetWorth(balances, "USD", rate);
    // 1500 + 500 + 250 + 5000 + 3000 - 450 = 9800
    expect(summary.netWorth.minor).toBe(980_000);
    expect(formatMoney(summary.netWorth)).toBe("$9,800.00");
  });

  it("counts bank, e-wallet and cash as spendable today", () => {
    const summary = summarizeNetWorth(balances, "USD", rate);
    expect(summary.cash.minor).toBe(225_000);
  });

  it("separates savings and investments from cash", () => {
    const summary = summarizeNetWorth(balances, "USD", rate);
    expect(summary.savings.minor).toBe(500_000);
    expect(summary.investments.minor).toBe(300_000);
  });

  it("reports a credit card as a positive amount owed", () => {
    const summary = summarizeNetWorth(balances, "USD", rate);
    expect(summary.liabilities.minor).toBe(45_000);
    expect(formatMoney(summary.liabilities)).toBe("$450.00");
  });

  it("honours the net worth exclusion flag", () => {
    const withExcluded = [
      ...balances,
      balance({ currentBalance: 1_000_000, currency: "USD", type: "bank", includeInNetWorth: false }),
    ];
    expect(summarizeNetWorth(withExcluded, "USD", rate).netWorth.minor).toBe(980_000);
  });

  it("leaves a closed account out of the total, even when it is flagged for inclusion", () => {
    // A closed account keeps its balance and history, but counting it would
    // report money the user no longer considers theirs to spend.
    const withClosed = [
      ...balances,
      balance({ currentBalance: 1_000_000, currency: "USD", type: "bank", isActive: false }),
    ];
    expect(summarizeNetWorth(withClosed, "USD", rate).netWorth.minor).toBe(980_000);
  });

  it("keeps a closed account out of the cash figure too", () => {
    const withClosed = [
      balance({ currentBalance: 25_000, currency: "USD", type: "cash" }),
      balance({ currentBalance: 90_000, currency: "USD", type: "cash", isActive: false }),
    ];
    expect(summarizeNetWorth(withClosed, "USD", rate).cash.minor).toBe(25_000);
  });

  it("can report in riel", () => {
    const summary = summarizeNetWorth(
      [balance({ currentBalance: 10_000, currency: "USD", type: "cash" })],
      "KHR",
      rate,
    );
    expect(summary.netWorth.minor).toBe(410_000);
  });

  it("returns zeros for no accounts", () => {
    const summary = summarizeNetWorth([], "USD", rate);
    expect(summary.netWorth.minor).toBe(0);
    expect(summary.liabilities.minor).toBe(0);
  });
});
