import { describe, expect, it } from "vitest";

import {
  convert,
  DEFAULT_RATE,
  DEFAULT_USD_KHR_RATE,
  effectiveRate,
  exchangeRate,
  mixedTotal,
  RateTable,
  resolveMultiplier,
  totalInBaseCurrency,
} from "./exchange";
import { formatMoney, fromMajor, money, MoneyError } from "./money";

const usdKhr = exchangeRate(4100, "USD", "KHR", new Date("2026-01-01"));

describe("exchangeRate", () => {
  it("rejects a non-positive rate", () => {
    expect(() => exchangeRate(0, "USD", "KHR")).toThrow(MoneyError);
    expect(() => exchangeRate(-4100, "USD", "KHR")).toThrow(MoneyError);
  });

  it("rejects a same-currency rate that is not 1", () => {
    expect(() => exchangeRate(2, "USD", "USD")).toThrow(MoneyError);
  });
});

describe("resolveMultiplier", () => {
  it("uses a rate quoted in either direction", () => {
    expect(resolveMultiplier("USD", "KHR", usdKhr)).toBe(4100);
    expect(resolveMultiplier("KHR", "USD", usdKhr)).toBeCloseTo(1 / 4100, 12);
  });

  it("is 1 for the same currency", () => {
    expect(resolveMultiplier("USD", "USD", usdKhr)).toBe(1);
  });
});

describe("convert", () => {
  it("crosses the minor-unit scale gap between USD cents and whole riel", () => {
    // $3.00 at 4100 is 12,300 riel, not 1,230,000.
    expect(convert(fromMajor(3, "USD"), "KHR", usdKhr).minor).toBe(12300);
  });

  it("converts riel back to dollars", () => {
    expect(convert(fromMajor(20000, "KHR"), "USD", usdKhr).minor).toBe(488);
  });

  it("is a no-op for the same currency", () => {
    const amount = fromMajor(5, "USD");
    expect(convert(amount, "USD", usdKhr)).toBe(amount);
  });

  it("preserves sign on refunds", () => {
    expect(convert(fromMajor(-3, "USD"), "KHR", usdKhr).minor).toBe(-12300);
  });

  it("round-trips within one minor unit of the target currency", () => {
    const original = fromMajor(25, "USD");
    const roundTripped = convert(convert(original, "KHR", usdKhr), "USD", usdKhr);
    expect(Math.abs(roundTripped.minor - original.minor)).toBeLessThanOrEqual(1);
  });

  it("rejects a rate for an unrelated pair", () => {
    const selfRate = exchangeRate(1, "USD", "USD");
    expect(() => convert(fromMajor(1, "KHR"), "USD", selfRate)).toThrow(MoneyError);
  });

  it("falls back to the default rate", () => {
    expect(DEFAULT_RATE.rate).toBe(DEFAULT_USD_KHR_RATE);
    expect(convert(fromMajor(1, "USD"), "KHR").minor).toBe(DEFAULT_USD_KHR_RATE);
  });
});

describe("effectiveRate", () => {
  it("reports the multiplier actually applied, for the audit trail", () => {
    expect(effectiveRate("USD", "KHR", usdKhr)).toBe(4100);
  });
});

describe("RateTable historical lookup", () => {
  const table = new RateTable([
    exchangeRate(4000, "USD", "KHR", new Date("2026-01-01")),
    exchangeRate(4100, "USD", "KHR", new Date("2026-04-01")),
    exchangeRate(4150, "USD", "KHR", new Date("2026-07-01")),
  ]);

  it("uses the rate in force on the given date, not the newest one", () => {
    expect(table.rateAt(new Date("2026-02-15")).rate).toBe(4000);
    expect(table.rateAt(new Date("2026-05-15")).rate).toBe(4100);
    expect(table.rateAt(new Date("2026-08-15")).rate).toBe(4150);
  });

  it("uses the rate effective exactly at its own timestamp", () => {
    expect(table.rateAt(new Date("2026-04-01")).rate).toBe(4100);
  });

  it("falls back to the default before any rate exists", () => {
    expect(table.rateAt(new Date("2025-01-01")).source).toBe("default");
  });

  it("keeps a historical conversion stable as newer rates arrive", () => {
    const january = new Date("2026-02-15");
    const before = table.convertAt(fromMajor(10, "USD"), "KHR", january);
    const extended = table.withRate(exchangeRate(4300, "USD", "KHR", new Date("2026-10-01")));
    expect(extended.convertAt(fromMajor(10, "USD"), "KHR", january).minor).toBe(before.minor);
    expect(before.minor).toBe(40000);
  });

  it("sorts rates supplied out of order", () => {
    const unsorted = new RateTable([
      exchangeRate(4150, "USD", "KHR", new Date("2026-07-01")),
      exchangeRate(4000, "USD", "KHR", new Date("2026-01-01")),
    ]);
    expect(unsorted.rateAt(new Date("2026-02-15")).rate).toBe(4000);
    expect(unsorted.all.length).toBe(2);
  });
});

describe("mixed-currency purchase (PRD Section 7)", () => {
  it("totals one purchase paid with $3 and 20,000 riel", () => {
    const tender = { tenders: [fromMajor(3, "USD"), fromMajor(20000, "KHR")] };

    // 20,000 riel at 4100 is $4.88, so the purchase came to $7.88.
    const inUsd = mixedTotal(tender, "USD", usdKhr);
    expect(inUsd.minor).toBe(788);
    expect(formatMoney(inUsd)).toBe("$7.88");

    // The same purchase expressed in riel: $3 is 12,300, plus 20,000.
    const inKhr = mixedTotal(tender, "KHR", usdKhr);
    expect(inKhr.minor).toBe(32300);
    expect(formatMoney(inKhr)).toBe("32,300៛");
  });

  it("totals an empty tender to zero", () => {
    expect(mixedTotal({ tenders: [] }, "USD", usdKhr).minor).toBe(0);
  });
});

describe("net worth in a base currency (PRD Section 11)", () => {
  it("adds accounts held in different currencies", () => {
    const balances = [
      money(150_000, "USD"), // $1,500.00 in ABA
      money(2_050_000, "KHR"), // 2,050,000 riel in Wing = $500.00
      money(25_000, "USD"), // $250.00 cash
    ];

    const netWorth = totalInBaseCurrency(balances, "USD", usdKhr);
    expect(netWorth.minor).toBe(225_000);
    expect(formatMoney(netWorth)).toBe("$2,250.00");
  });

  it("nets a negative credit card balance against assets", () => {
    const balances = [money(100_000, "USD"), money(-40_000, "USD")];
    expect(totalInBaseCurrency(balances, "USD", usdKhr).minor).toBe(60_000);
  });

  it("totals an empty portfolio to zero", () => {
    expect(totalInBaseCurrency([], "USD", usdKhr).minor).toBe(0);
  });
});
