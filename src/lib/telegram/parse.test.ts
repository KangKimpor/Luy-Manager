import { describe, expect, test } from "vitest";

import { CONFIRM_THRESHOLD, needsConfirmation, parseMessage } from "./parse";

/**
 * Every example message in PRD Section 9 is a test here, because that list is the
 * spec. If one of them stops parsing, the bot has regressed against the document
 * that defines it.
 */

function record(text: string) {
  const intent = parseMessage(text);
  if (intent.kind !== "record") {
    throw new Error(`expected a record intent from "${text}", got ${intent.kind}`);
  }
  return intent;
}

describe("PRD Section 9 examples", () => {
  test("Spent $5 coffee", () => {
    const intent = record("Spent $5 coffee");
    expect(intent.type).toBe("expense");
    expect(intent.amount).toEqual({ minor: 500, currency: "USD" });
    expect(intent.descriptor).toBe("coffee");
    expect(needsConfirmation(intent)).toBe(false);
  });

  test("Spent 12000 riel lunch", () => {
    const intent = record("Spent 12000 riel lunch");
    expect(intent.type).toBe("expense");
    // Zero-decimal currency: 12,000 riel is 12000 minor units, not 1,200,000.
    expect(intent.amount).toEqual({ minor: 12000, currency: "KHR" });
    expect(intent.descriptor).toBe("lunch");
    expect(needsConfirmation(intent)).toBe(false);
  });

  test("Salary $600", () => {
    const intent = record("Salary $600");
    expect(intent.type).toBe("income");
    expect(intent.amount).toEqual({ minor: 60000, currency: "USD" });
    expect(needsConfirmation(intent)).toBe(false);
  });

  test("Received $50", () => {
    const intent = record("Received $50");
    expect(intent.type).toBe("income");
    expect(intent.amount).toEqual({ minor: 5000, currency: "USD" });
  });

  test("Fuel $20 has no verb, so it is assumed and must be confirmed", () => {
    const intent = record("Fuel $20");
    expect(intent.type).toBe("expense");
    expect(intent.amount).toEqual({ minor: 2000, currency: "USD" });
    expect(intent.descriptor).toBe("fuel");
    // Direction was never stated, so this drops below the threshold on purpose.
    expect(intent.confidence).toBeLessThan(CONFIRM_THRESHOLD);
    expect(needsConfirmation(intent)).toBe(true);
  });

  test("Transfer $100 ABA to Wing", () => {
    const intent = parseMessage("Transfer $100 ABA to Wing");
    expect(intent.kind).toBe("transfer");
    if (intent.kind !== "transfer") return;
    expect(intent.amount).toEqual({ minor: 10000, currency: "USD" });
    expect(intent.fromHint).toBe("aba");
    expect(intent.toHint).toBe("wing");
    expect(needsConfirmation(intent)).toBe(false);
  });

  test("Undo last transaction", () => {
    expect(parseMessage("Undo last transaction").kind).toBe("undo");
  });

  test("Show budget", () => {
    expect(parseMessage("Show budget").kind).toBe("budget");
  });

  test("Summary today", () => {
    const intent = parseMessage("Summary today");
    expect(intent).toMatchObject({ kind: "summary", window: "today" });
  });

  test("Summary month", () => {
    const intent = parseMessage("Summary month");
    expect(intent).toMatchObject({ kind: "summary", window: "month" });
  });
});

describe("currency detection", () => {
  test.each([
    ["Spent $3 coffee", 300, "USD"],
    ["Spent 3 usd coffee", 300, "USD"],
    ["Spent 3 dollars coffee", 300, "USD"],
    ["Spent 12000 khr lunch", 12000, "KHR"],
    ["Spent 12000៛ lunch", 12000, "KHR"],
    ["Spent 12000 riels lunch", 12000, "KHR"],
  ])("%s", (text, minor, currency) => {
    expect(record(text).amount).toEqual({ minor, currency });
  });

  test("a trailing bare r means riel", () => {
    // The lookbehind in the marker pattern cannot be reused on the captured text
    // alone; this asserts the separate resolver handles it.
    expect(record("Spent 12000r lunch").amount).toEqual({ minor: 12000, currency: "KHR" });
  });

  test("rice does not parse as riel", () => {
    expect(record("Spent $4 rice").amount).toEqual({ minor: 400, currency: "USD" });
  });

  test("decimals survive on a two-decimal currency", () => {
    expect(record("Spent $4.50 coffee").amount).toEqual({ minor: 450, currency: "USD" });
  });

  test("thousands separators are ignored", () => {
    expect(record("Spent 20,000 riel groceries").amount).toEqual({
      minor: 20000,
      currency: "KHR",
    });
  });
});

describe("the magnitude heuristic for a bare number", () => {
  test("a small bare number reads as dollars", () => {
    const intent = record("Spent 5 coffee");
    expect(intent.amount).toEqual({ minor: 500, currency: "USD" });
  });

  test("a large bare number reads as riel", () => {
    const intent = record("Spent 12000 lunch");
    expect(intent.amount).toEqual({ minor: 12000, currency: "KHR" });
  });

  test("either way it is a guess, so it must be confirmed", () => {
    // This is the guard that matters. Mistaking riel for dollars is a 4000x error,
    // so a bare number must never save silently.
    expect(needsConfirmation(record("Spent 5 coffee"))).toBe(true);
    expect(needsConfirmation(record("Spent 12000 lunch"))).toBe(true);
  });

  test("an explicit unit is never treated as a guess", () => {
    expect(needsConfirmation(record("Spent 12000 riel lunch"))).toBe(false);
    expect(needsConfirmation(record("Spent $5 coffee"))).toBe(false);
  });
});

describe("direction", () => {
  test("refund wins over income, being the more specific reading", () => {
    expect(record("Refund $12 shirt").type).toBe("refund");
  });

  test.each([
    ["Paid $30 electricity", "expense"],
    ["Bought $8 lunch", "expense"],
    ["Got $200 bonus", "income"],
    ["Deposit $500", "income"],
    ["Earned $75 freelance", "income"],
  ])("%s is %s", (text, type) => {
    expect(record(text).type).toBe(type);
  });
});

describe("linking and help", () => {
  test("/start with a payload is a link request", () => {
    expect(parseMessage("/start abc.def")).toMatchObject({
      kind: "link",
      token: "abc.def",
    });
  });

  test("/start with a bot suffix still links", () => {
    expect(parseMessage("/start@LuyBot tok")).toMatchObject({ kind: "link", token: "tok" });
  });

  test("bare /start asks for help rather than linking", () => {
    expect(parseMessage("/start").kind).toBe("help");
  });

  test("/help", () => {
    expect(parseMessage("/help").kind).toBe("help");
  });
});

describe("messages the parser should refuse", () => {
  test.each(["", "hello", "thanks!", "how much did I spend"])("%s", (text) => {
    expect(parseMessage(text).kind).toBe("unknown");
  });

  test("a transfer with no destination is refused rather than guessed", () => {
    expect(parseMessage("Transfer $100").kind).toBe("unknown");
  });

  test("zero is not an amount", () => {
    expect(parseMessage("Spent $0 nothing").kind).toBe("unknown");
  });

  test("read-only intents never ask for confirmation", () => {
    for (const text of ["Show budget", "Summary today", "Undo last transaction", "/help"]) {
      expect(needsConfirmation(parseMessage(text))).toBe(false);
    }
  });
});

describe("answers to a confirmation prompt", () => {
  test.each(["yes", "y", "Yep", "confirm", "OK", "save", "correct"])("%s confirms", (text) => {
    expect(parseMessage(text).kind).toBe("confirm");
  });

  test.each(["no", "n", "nope", "cancel", "stop", "wrong"])("%s cancels", (text) => {
    expect(parseMessage(text).kind).toBe("cancel");
  });

  test("'cancel last' still means undo, not dismiss", () => {
    // Ordering matters: a bare "cancel" dismisses a pending confirmation, but
    // "cancel last" is the PRD's undo phrasing and must reach the ledger.
    expect(parseMessage("cancel last").kind).toBe("undo");
  });

  test("a word merely starting with n is not a cancellation", () => {
    expect(parseMessage("Nham24 $6").kind).toBe("record");
  });
});

describe("confidence is bounded", () => {
  test("never negative, however many guesses stack up", () => {
    const intent = record("12000 some very long trailing description here");
    expect(intent.confidence).toBeGreaterThanOrEqual(0);
  });

  test("never above one", () => {
    expect(record("Spent $5 coffee").confidence).toBeLessThanOrEqual(1);
  });
});
