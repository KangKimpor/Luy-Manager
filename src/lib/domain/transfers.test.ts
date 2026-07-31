import { describe, expect, it } from "vitest";

import {
  describeTransfer,
  planTransfer,
  transferInserts,
  transferIssues,
  type TransferAccount,
} from "./transfers";
import { exchangeRate, fromMajor, money } from "@/lib/money";

const rate = exchangeRate(4100, "USD", "KHR", new Date("2026-07-01"));

const abaUsd: TransferAccount = {
  accountId: "aba-usd",
  name: "ABA USD",
  type: "bank",
  currency: "USD",
  currentBalance: 184_250, // $1,842.50
};

const wingKhr: TransferAccount = {
  accountId: "wing-khr",
  name: "Wing",
  type: "ewallet",
  currency: "KHR",
  currentBalance: 385_000, // 385,000៛
};

const cashUsd: TransferAccount = {
  accountId: "cash-usd",
  name: "Cash USD",
  type: "cash",
  currency: "USD",
  currentBalance: 12_000, // $120
};

const cashKhr: TransferAccount = {
  accountId: "cash-khr",
  name: "Cash KHR",
  type: "cash",
  currency: "KHR",
  currentBalance: 148_000,
};

const card: TransferAccount = {
  accountId: "card",
  name: "ABA Credit Card",
  type: "credit_card",
  currency: "USD",
  currentBalance: -48_500,
};

describe("planTransfer", () => {
  it("moves money between two accounts in the same currency without a rate", () => {
    const plan = planTransfer(
      { from: abaUsd, to: cashUsd, amount: fromMajor(50, "USD") },
      rate,
    );

    expect(plan.isCrossCurrency).toBe(false);
    expect(plan.sent.minor).toBe(5_000);
    expect(plan.received.minor).toBe(5_000);
    expect(plan.received.currency).toBe("USD");
    // No conversion happened, so there is no rate worth recording.
    expect(plan.appliedRate).toBeNull();
    expect(plan.receivedBasis).toBe("same-currency");
    expect(plan.fromBalanceAfter.minor).toBe(179_250);
    expect(plan.toBalanceAfter.minor).toBe(17_000);
  });

  it("converts across the minor-unit scale gap for USD to KHR", () => {
    const plan = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(100, "USD") },
      rate,
    );

    // $100 at 4100 is 410,000 riel, not 41,000,000: KHR has no subunit.
    expect(plan.received.minor).toBe(410_000);
    expect(plan.received.currency).toBe("KHR");
    expect(plan.appliedRate).toBeCloseTo(4100, 6);
    expect(plan.receivedBasis).toBe("rate-table");
    expect(plan.toBalanceAfter.minor).toBe(795_000);
    expect(plan.fromBalanceAfter.minor).toBe(174_250);
  });

  it("converts KHR to USD in the other direction", () => {
    const plan = planTransfer(
      { from: wingKhr, to: abaUsd, amount: fromMajor(205_000, "KHR") },
      rate,
    );

    // 205,000 riel at 4100 is exactly $50.
    expect(plan.received.minor).toBe(5_000);
    expect(plan.received.currency).toBe("USD");
    expect(plan.appliedRate).toBeCloseTo(1 / 4100, 10);
    expect(plan.fromBalanceAfter.minor).toBe(180_000);
    expect(plan.toBalanceAfter.minor).toBe(189_250);
  });

  it("lets the amount actually received override the table rate", () => {
    const plan = planTransfer(
      {
        from: abaUsd,
        to: wingKhr,
        amount: fromMajor(100, "USD"),
        // A money changer gave 4,000 rather than the table's 4,100.
        receivedAmount: fromMajor(400_000, "KHR"),
      },
      rate,
    );

    expect(plan.received.minor).toBe(400_000);
    expect(plan.receivedBasis).toBe("user-entered");
    // The reported rate is the one the user actually got, not the table's.
    expect(plan.appliedRate).toBeCloseTo(4000, 6);
    // The table's figure is still available for comparison.
    expect(plan.quotedReceived.minor).toBe(410_000);
  });

  it("keeps both legs summing to zero in value terms", () => {
    const plan = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(100, "USD") },
      rate,
    );

    const [out, incoming] = transferInserts(plan, "group-1", "USD", rate);

    // Different currencies and magnitudes, but the same value: the base-currency
    // figures must cancel, or a transfer would create or destroy money.
    expect(out.base_amount).toBeNull(); // already the base currency
    expect(out.amount).toBe(-10_000);
    expect(incoming.base_amount).toBe(10_000);
    expect(out.amount + (incoming.base_amount ?? 0)).toBe(0);
  });

  it("refuses a transfer to the same account", () => {
    expect(() =>
      planTransfer({ from: abaUsd, to: abaUsd, amount: fromMajor(10, "USD") }, rate),
    ).toThrow(/two different accounts/);
  });

  it("refuses an amount in a currency the source account does not hold", () => {
    expect(() =>
      planTransfer({ from: abaUsd, to: wingKhr, amount: fromMajor(10_000, "KHR") }, rate),
    ).toThrow(/ABA USD holds USD/);
  });

  it("refuses a received amount in a currency the destination does not hold", () => {
    expect(() =>
      planTransfer(
        {
          from: abaUsd,
          to: wingKhr,
          amount: fromMajor(100, "USD"),
          receivedAmount: fromMajor(100, "USD"),
        },
        rate,
      ),
    ).toThrow(/Wing holds KHR/);
  });

  it("refuses a zero transfer", () => {
    expect(() =>
      planTransfer({ from: abaUsd, to: cashUsd, amount: fromMajor(0, "USD") }, rate),
    ).toThrow(/non-zero/);
  });

  it("treats a negative entry as a magnitude rather than a reversed transfer", () => {
    // The direction is carried by from/to, so a stray minus must not silently
    // swap the accounts.
    const plan = planTransfer(
      { from: abaUsd, to: cashUsd, amount: money(-5_000, "USD") },
      rate,
    );

    expect(plan.sent.minor).toBe(5_000);
    expect(plan.fromBalanceAfter.minor).toBe(179_250);
  });

  it("suggests a cash-step figure when the destination holds physical cash", () => {
    const plan = planTransfer(
      { from: abaUsd, to: cashKhr, amount: fromMajor(1.5, "USD") },
      rate,
    );

    // $1.50 at 4100 is 6,150 riel, which cannot be handed over: the smallest
    // note in circulation is 100 riel.
    expect(plan.quotedReceived.minor).toBe(6_150);
    expect(plan.cashStepSuggestion?.minor).toBe(6_200);
    // The suggestion is never applied on its own; the ledger keeps the exact figure.
    expect(plan.received.minor).toBe(6_150);
  });

  it("does not suggest cash rounding for a bank account", () => {
    const plan = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(1.5, "USD") },
      rate,
    );

    expect(plan.cashStepSuggestion).toBeNull();
  });

  it("uses the rate in force rather than a newer one", () => {
    const laterRate = exchangeRate(4300, "USD", "KHR", new Date("2026-10-01"));

    const settled = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(100, "USD"), occurredAt: new Date("2026-07-05") },
      rate,
    );
    const today = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(100, "USD") },
      laterRate,
    );

    expect(settled.received.minor).toBe(410_000);
    expect(today.received.minor).toBe(430_000);
  });
});

describe("transferIssues", () => {
  it("warns when a bank account would go below zero", () => {
    const plan = planTransfer(
      { from: cashUsd, to: abaUsd, amount: fromMajor(500, "USD") },
      rate,
    );

    expect(transferIssues(plan).map((i) => i.code)).toContain("insufficient-funds");
  });

  it("does not warn when a credit card goes further negative", () => {
    const plan = planTransfer(
      { from: card, to: abaUsd, amount: fromMajor(100, "USD") },
      rate,
    );

    expect(transferIssues(plan)).toHaveLength(0);
  });

  it("stays quiet when the balance covers the transfer", () => {
    const plan = planTransfer(
      { from: abaUsd, to: cashUsd, amount: fromMajor(10, "USD") },
      rate,
    );

    expect(transferIssues(plan)).toHaveLength(0);
  });

  it("flags a received amount far from the current rate", () => {
    const plan = planTransfer(
      {
        from: abaUsd,
        to: wingKhr,
        amount: fromMajor(100, "USD"),
        // 100x out: a decimal-point slip when typing riel.
        receivedAmount: fromMajor(41_000, "KHR"),
      },
      rate,
    );

    expect(transferIssues(plan).map((i) => i.code)).toContain("rate-deviation");
  });

  it("accepts a plausible spread without complaint", () => {
    const plan = planTransfer(
      {
        from: abaUsd,
        to: wingKhr,
        amount: fromMajor(100, "USD"),
        // 4,050 against a table rate of 4,100: an ordinary money changer margin.
        receivedAmount: fromMajor(405_000, "KHR"),
      },
      rate,
    );

    expect(transferIssues(plan)).toHaveLength(0);
  });
});

describe("transferInserts", () => {
  it("gives both legs the same group id, opposite signs and their own currencies", () => {
    const plan = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(100, "USD") },
      rate,
    );

    const [out, incoming] = transferInserts(plan, "group-42", "USD", rate);

    expect(out.transfer_group_id).toBe("group-42");
    expect(incoming.transfer_group_id).toBe("group-42");
    expect(out.type).toBe("transfer");
    expect(incoming.type).toBe("transfer");
    expect(out.amount).toBeLessThan(0);
    expect(incoming.amount).toBeGreaterThan(0);
    expect(out.currency).toBe("USD");
    expect(incoming.currency).toBe("KHR");
    // Both legs record the same instant, so they sort together.
    expect(out.occurred_at).toBe(incoming.occurred_at);
  });

  it("records the rate applied on the converted leg", () => {
    const plan = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(100, "USD") },
      rate,
    );

    const [, incoming] = transferInserts(plan, "group-43", "USD", rate);

    // All three conversion fields together, or the row is not reproducible.
    expect(incoming.exchange_rate).not.toBeNull();
    expect(incoming.base_amount).toBe(10_000);
    expect(incoming.base_currency).toBe("USD");
  });

  it("carries a user-entered received figure through to the row", () => {
    const plan = planTransfer(
      {
        from: abaUsd,
        to: wingKhr,
        amount: fromMajor(100, "USD"),
        receivedAmount: fromMajor(400_000, "KHR"),
      },
      rate,
    );

    const [, incoming] = transferInserts(plan, "group-44", "USD", rate);

    expect(incoming.amount).toBe(400_000);
  });

  it("leaves conversion fields null when the base currency is KHR and the leg is KHR", () => {
    const plan = planTransfer(
      { from: wingKhr, to: cashKhr, amount: fromMajor(50_000, "KHR") },
      rate,
    );

    const [out, incoming] = transferInserts(plan, "group-45", "KHR", rate);

    expect(out.exchange_rate).toBeNull();
    expect(out.base_amount).toBeNull();
    expect(out.base_currency).toBeNull();
    expect(incoming.exchange_rate).toBeNull();
  });
});

describe("describeTransfer", () => {
  it("names both figures for a cross-currency transfer", () => {
    const plan = planTransfer(
      { from: abaUsd, to: wingKhr, amount: fromMajor(100, "USD") },
      rate,
    );

    expect(describeTransfer(plan)).toBe("$100.00 from ABA USD → 410,000៛ into Wing");
  });

  it("names one figure when no conversion happened", () => {
    const plan = planTransfer(
      { from: abaUsd, to: cashUsd, amount: fromMajor(25, "USD") },
      rate,
    );

    expect(describeTransfer(plan)).toBe("$25.00 from ABA USD → Cash USD");
  });
});
