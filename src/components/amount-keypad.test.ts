import { describe, expect, it } from "vitest";

import {
  parseKeypadAmount,
  pressAmountKey,
  truncateForCurrency,
} from "./amount-keypad";

describe("pressAmountKey", () => {
  it("refuses a digit that would make minor units unsafe instead of crashing the form", () => {
    expect(pressAmountKey("90071992547409", "9", "USD")).toBe("90071992547409");
    expect(pressAmountKey("900719925474099", "9", "KHR")).toBe("900719925474099");
  });
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

  it("accepts a decimal point for KHR bank amounts and caps precision at two places", () => {
    expect(pressAmountKey("12000", ".", "KHR")).toBe("12000.");
    expect(pressAmountKey("9993.55", "9", "KHR")).toBe("9993.55");
  });

  it("keeps accepting digits for KHR past two characters", () => {
    // The two-decimal cap must not be mistaken for a two-digit cap.
    expect(pressAmountKey("12000", "0", "KHR")).toBe("120000");
  });
});

describe("truncateForCurrency", () => {
  it("keeps bank decimals when switching to riel", () => {
    expect(truncateForCurrency("12.75", "KHR")).toBe("12.75");
  });

  it("leaves a two-decimal currency alone", () => {
    expect(truncateForCurrency("12.75", "USD")).toBe("12.75");
  });

  it("keeps the same fractional digits instead of changing the bank amount", () => {
    expect(truncateForCurrency("12.99", "KHR")).toBe("12.99");
  });
});

describe("parseKeypadAmount", () => {
  it("keeps the form usable if an oversized draft reaches the display", () => {
    expect(parseKeypadAmount("999999999999999999", "USD").minor).toBe(0);
  });
  it("reads dollars into cents", () => {
    expect(parseKeypadAmount("5.25", "USD").minor).toBe(525);
  });

  it("reads riel into integer hundredths", () => {
    expect(parseKeypadAmount("12000", "KHR").minor).toBe(1200000);
    expect(parseKeypadAmount("9993.55", "KHR").minor).toBe(999355);
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
