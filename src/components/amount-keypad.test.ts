import { describe, expect, it } from "vitest";

import {
  parseKeypadAmount,
  pressAmountKey,
  truncateForCurrency,
} from "./amount-keypad";

describe("pressAmountKey", () => {
  it("appends digits", () => {
    expect(pressAmountKey("", "1", "USD")).toBe("1");
    expect(pressAmountKey("1", "2", "USD")).toBe("12");
  });

  it("replaces a lone leading zero rather than growing 05", () => {
    expect(pressAmountKey("0", "5", "USD")).toBe("5");
  });

  it("keeps the zero when it is the integer part of a decimal", () => {
    expect(pressAmountKey("0.", "5", "USD")).toBe("0.5");
  });

  it("deletes the last character", () => {
    expect(pressAmountKey("125", "del", "USD")).toBe("12");
    expect(pressAmountKey("", "del", "USD")).toBe("");
  });

  it("starts a decimal from an empty entry as 0.", () => {
    expect(pressAmountKey("", ".", "USD")).toBe("0.");
  });

  it("allows only one decimal point", () => {
    expect(pressAmountKey("1.5", ".", "USD")).toBe("1.5");
  });

  it("stops USD at two decimal places", () => {
    // A third digit would be rounded away on save, so it is refused instead.
    expect(pressAmountKey("1.25", "9", "USD")).toBe("1.25");
  });

  it("refuses a decimal point for KHR, which has no subunit", () => {
    expect(pressAmountKey("12000", ".", "KHR")).toBe("12000");
  });

  it("keeps accepting digits for KHR past two characters", () => {
    // The two-decimal cap must not be mistaken for a two-digit cap.
    expect(pressAmountKey("12000", "0", "KHR")).toBe("120000");
  });
});

describe("truncateForCurrency", () => {
  it("drops the fractional part for a zero-decimal currency", () => {
    expect(truncateForCurrency("12.75", "KHR")).toBe("12");
  });

  it("leaves a two-decimal currency alone", () => {
    expect(truncateForCurrency("12.75", "USD")).toBe("12.75");
  });

  it("truncates rather than rounds, so no unpressed digit appears", () => {
    expect(truncateForCurrency("12.99", "KHR")).toBe("12");
  });
});

describe("parseKeypadAmount", () => {
  it("reads dollars into cents", () => {
    expect(parseKeypadAmount("5.25", "USD").minor).toBe(525);
  });

  it("reads riel as whole units, not hundredths", () => {
    // 12,000៛ is 12000 minor units. Treating KHR as two-decimal would store
    // 1,200,000 and inflate the balance 100x.
    expect(parseKeypadAmount("12000", "KHR").minor).toBe(12_000);
  });

  it("treats an empty entry as zero", () => {
    expect(parseKeypadAmount("", "USD").minor).toBe(0);
  });

  it("treats a half-typed decimal as its integer part", () => {
    expect(parseKeypadAmount("5.", "USD").minor).toBe(500);
  });

  it("treats unparseable input as zero rather than NaN", () => {
    expect(parseKeypadAmount("..", "USD").minor).toBe(0);
  });

  it("carries the currency through", () => {
    expect(parseKeypadAmount("1", "KHR").currency).toBe("KHR");
  });
});
