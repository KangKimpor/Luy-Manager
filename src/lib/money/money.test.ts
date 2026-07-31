import { describe, expect, it } from "vitest";

import {
  absolute,
  add,
  compare,
  equals,
  formatMoney,
  fromMajor,
  isNegative,
  money,
  MoneyError,
  multiply,
  negate,
  parseAmount,
  roundToCashStep,
  splitByWeights,
  splitEvenly,
  subtract,
  sum,
  toMajor,
  zero,
} from "./money";

describe("construction", () => {
  it("rejects non-integer minor units so float drift cannot enter the ledger", () => {
    expect(() => money(10.5, "USD")).toThrow(MoneyError);
  });

  it("rejects unsafe integers", () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, "USD")).toThrow(MoneyError);
  });

  it("rejects unsupported currencies", () => {
    expect(() => money(100, "EUR" as never)).toThrow(MoneyError);
  });

  it("scales USD major units by 100", () => {
    expect(fromMajor(5.25, "USD").minor).toBe(525);
  });

  it("treats KHR as zero-decimal, so riel map 1:1 to minor units", () => {
    expect(fromMajor(12000, "KHR").minor).toBe(12000);
  });

  it("rounds half away from zero symmetrically, so refunds are not biased", () => {
    expect(fromMajor(2.005, "USD").minor).toBe(201);
    expect(fromMajor(-2.005, "USD").minor).toBe(-201);
  });

  it("never produces negative zero, which would render as -$0.00", () => {
    expect(money(-0, "USD").minor).toBe(0);
    expect(negate(zero("USD")).minor).toBe(0);
    expect(multiply(zero("USD"), -1).minor).toBe(0);
    expect(fromMajor(-0, "USD").minor).toBe(0);
    expect(formatMoney(negate(zero("USD")))).toBe("$0.00");
  });
});

describe("float safety", () => {
  it("adds 0.1 + 0.2 to exactly 0.30", () => {
    const total = add(fromMajor(0.1, "USD"), fromMajor(0.2, "USD"));
    expect(total.minor).toBe(30);
    expect(toMajor(total)).toBe(0.3);
  });

  it("stays exact across many additions where floats would drift", () => {
    let acc = zero("USD");
    for (let i = 0; i < 1000; i += 1) acc = add(acc, fromMajor(0.01, "USD"));
    expect(acc.minor).toBe(1000);
    expect(formatMoney(acc)).toBe("$10.00");
  });
});

describe("arithmetic", () => {
  it("refuses to mix currencies implicitly", () => {
    expect(() => add(money(100, "USD"), money(100, "KHR"))).toThrow(/Convert to a common currency/);
    expect(() => subtract(money(100, "USD"), money(100, "KHR"))).toThrow(MoneyError);
    expect(() => compare(money(100, "USD"), money(100, "KHR"))).toThrow(MoneyError);
  });

  it("subtracts into negatives for overspend", () => {
    const remaining = subtract(fromMajor(10, "USD"), fromMajor(12.5, "USD"));
    expect(remaining.minor).toBe(-250);
    expect(isNegative(remaining)).toBe(true);
  });

  it("negates and absolutes", () => {
    expect(negate(money(-500, "USD")).minor).toBe(500);
    expect(absolute(money(-500, "USD")).minor).toBe(500);
  });

  it("multiplies with half-away-from-zero rounding", () => {
    expect(multiply(money(333, "USD"), 0.5).minor).toBe(167);
    expect(multiply(money(-333, "USD"), 0.5).minor).toBe(-167);
  });

  it("sums a list", () => {
    const total = sum([fromMajor(1.1, "USD"), fromMajor(2.2, "USD"), fromMajor(3.3, "USD")], "USD");
    expect(total.minor).toBe(660);
  });

  it("compares and tests equality", () => {
    expect(compare(money(100, "USD"), money(200, "USD"))).toBe(-1);
    expect(compare(money(200, "USD"), money(100, "USD"))).toBe(1);
    expect(compare(money(100, "USD"), money(100, "USD"))).toBe(0);
    expect(equals(money(100, "USD"), money(100, "KHR"))).toBe(false);
  });
});

describe("parseAmount", () => {
  it("reads symbols, separators and spaces out of user input", () => {
    expect(parseAmount("$5.25", "USD").minor).toBe(525);
    expect(parseAmount("12,000", "KHR").minor).toBe(12000);
    expect(parseAmount("1 200៛", "KHR").minor).toBe(1200);
    expect(parseAmount("20000 KHR", "KHR").minor).toBe(20000);
  });

  it("reads negatives", () => {
    expect(parseAmount("-5.50", "USD").minor).toBe(-550);
  });

  it("rejects text that holds no number", () => {
    expect(() => parseAmount("coffee", "USD")).toThrow(MoneyError);
    expect(() => parseAmount("", "USD")).toThrow(MoneyError);
  });
});

describe("splitEvenly", () => {
  it("preserves the total when the division is not exact", () => {
    const parts = splitEvenly(fromMajor(10, "USD"), 3);
    expect(parts.map((p) => p.minor)).toEqual([334, 333, 333]);
    expect(sum(parts, "USD").minor).toBe(1000);
  });

  it("preserves the total for riel", () => {
    const parts = splitEvenly(fromMajor(20000, "KHR"), 3);
    expect(sum(parts, "KHR").minor).toBe(20000);
  });

  it("keeps the sign on refunds", () => {
    const parts = splitEvenly(fromMajor(-10, "USD"), 3);
    expect(sum(parts, "USD").minor).toBe(-1000);
    expect(parts.every((p) => p.minor < 0)).toBe(true);
  });

  it("returns the whole amount for a single part", () => {
    expect(splitEvenly(fromMajor(7.77, "USD"), 1)[0].minor).toBe(777);
  });

  it("rejects a non-positive split count", () => {
    expect(() => splitEvenly(fromMajor(10, "USD"), 0)).toThrow(MoneyError);
  });
});

describe("splitByWeights", () => {
  it("preserves the total for an uneven shared bill", () => {
    const parts = splitByWeights(fromMajor(12, "USD"), [8, 4]);
    expect(parts.map((p) => p.minor)).toEqual([800, 400]);
    expect(sum(parts, "USD").minor).toBe(1200);
  });

  it("gives residual minor units to the largest fractional claim", () => {
    const parts = splitByWeights(fromMajor(10, "USD"), [1, 1, 1]);
    expect(sum(parts, "USD").minor).toBe(1000);
  });

  it("handles a zero weight", () => {
    const parts = splitByWeights(fromMajor(10, "USD"), [1, 0]);
    expect(parts.map((p) => p.minor)).toEqual([1000, 0]);
  });

  it("rejects weights that sum to zero", () => {
    expect(() => splitByWeights(fromMajor(10, "USD"), [0, 0])).toThrow(MoneyError);
  });

  it("rejects negative weights", () => {
    expect(() => splitByWeights(fromMajor(10, "USD"), [-1, 2])).toThrow(MoneyError);
  });
});

describe("roundToCashStep", () => {
  it("rounds riel to the smallest note that circulates", () => {
    expect(roundToCashStep(money(12345, "KHR")).minor).toBe(12300);
    expect(roundToCashStep(money(12360, "KHR")).minor).toBe(12400);
  });

  it("leaves USD cents alone", () => {
    expect(roundToCashStep(money(1234, "USD")).minor).toBe(1234);
  });
});

describe("formatMoney", () => {
  it("puts the dollar sign in front", () => {
    expect(formatMoney(fromMajor(1234.5, "USD"))).toBe("$1,234.50");
  });

  it("puts the riel sign after, with no decimals", () => {
    expect(formatMoney(fromMajor(20000, "KHR"))).toBe("20,000៛");
  });

  it("puts the minus outside the symbol", () => {
    expect(formatMoney(fromMajor(-5.5, "USD"))).toBe("-$5.50");
  });

  it("can omit the symbol for input fields", () => {
    expect(formatMoney(fromMajor(1234.5, "USD"), { showSymbol: false })).toBe("1,234.50");
  });
});
