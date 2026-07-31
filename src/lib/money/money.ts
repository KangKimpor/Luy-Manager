/**
 * Money primitives.
 *
 * Amounts are integer minor units (US cents, whole riel), never floats.
 * `0.1 + 0.2 !== 0.3` in IEEE-754, and a finance ledger that drifts by a cent
 * per operation is a ledger you cannot reconcile. Every amount in the database
 * and in transit is an integer; conversion to a decimal string happens only at
 * the display boundary.
 */

import {
  CURRENCY_META,
  type CurrencyCode,
  isCurrencyCode,
  minorUnitScale,
} from "./currency";

export interface Money {
  /** Integer minor units. Negative means an outflow. */
  readonly minor: number;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Construct a Money from integer minor units. */
export function money(minor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minor)) {
    throw new MoneyError(
      `Minor units must be an integer, received ${minor}. Use fromMajor() for decimal input.`,
    );
  }
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError(`Amount ${minor} exceeds safe integer range.`);
  }
  if (!isCurrencyCode(currency)) {
    throw new MoneyError(`Unsupported currency: ${String(currency)}`);
  }
  // Collapse -0 to 0. Negating or scaling a zero amount yields -0, which is
  // invisible in most arithmetic but leaks at the edges: it fails Object.is
  // comparisons against 0, and any formatter testing the sign bit rather than
  // `< 0` would render "-$0.00".
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

/**
 * Build a Money from a major-unit value, e.g. 5.25 USD or 12000 KHR.
 *
 * Rounds half away from zero, which is what a person expects when they type an
 * amount, and is symmetric for refunds (-2.5 and 2.5 round to the same
 * magnitude). Math.round() alone is asymmetric on negatives: it rounds -2.5 to
 * -2, biasing every rounded refund in the app's favour.
 */
export function fromMajor(major: number, currency: CurrencyCode): Money {
  if (!Number.isFinite(major)) {
    throw new MoneyError(`Amount must be finite, received ${major}.`);
  }
  const scaled = major * minorUnitScale(currency);
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return money(rounded, currency);
}

/** Parse user text such as "$5.25", "12,000", "1 200៛" into Money. */
export function parseAmount(input: string, currency: CurrencyCode): Money {
  const cleaned = input.replace(/[\s,$៛]/g, "").replace(/USD|KHR/gi, "");
  if (cleaned === "" || cleaned === "-") {
    throw new MoneyError(`Could not read an amount from "${input}".`);
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new MoneyError(`Could not read an amount from "${input}".`);
  }
  return fromMajor(parsed, currency);
}

/** Minor units expressed as a major-unit number. Display only, never for math. */
export function toMajor(m: Money): number {
  return m.minor / minorUnitScale(m.currency);
}

function assertSameCurrency(a: Money, b: Money, op: string): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Cannot ${op} ${a.currency} and ${b.currency} directly. Convert to a common currency first.`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b, "add");
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b, "subtract");
  return money(a.minor - b.minor, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.minor, m.currency);
}

export function absolute(m: Money): Money {
  return money(Math.abs(m.minor), m.currency);
}

/** Multiply by a plain number, e.g. splitting or scaling. Rounds half away from zero. */
export function multiply(m: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`Factor must be finite, received ${factor}.`);
  }
  const scaled = m.minor * factor;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return money(rounded, m.currency);
}

export function sum(amounts: readonly Money[], currency: CurrencyCode): Money {
  return amounts.reduce((acc, m) => add(acc, m), zero(currency));
}

export function isZero(m: Money): boolean {
  return m.minor === 0;
}

export function isNegative(m: Money): boolean {
  return m.minor < 0;
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b, "compare");
  return a.minor === b.minor ? 0 : a.minor < b.minor ? -1 : 1;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minor === b.minor;
}

/**
 * Split an amount into n parts that sum back to exactly the original.
 *
 * Naive division loses or invents minor units: $10.00 into 3 gives 3.33 x 3 =
 * 9.99, and the missing cent has to live somewhere. The remainder is
 * distributed one minor unit at a time across the leading parts, so the parts
 * are as even as the currency allows and the total is always preserved.
 * This is what `transaction_splits` (PRD Section 8) relies on.
 */
export function splitEvenly(m: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`Split count must be a positive integer, received ${parts}.`);
  }
  const sign = m.minor < 0 ? -1 : 1;
  const magnitude = Math.abs(m.minor);
  const base = Math.floor(magnitude / parts);
  const remainder = magnitude - base * parts;

  return Array.from({ length: parts }, (_, i) =>
    money(sign * (base + (i < remainder ? 1 : 0)), m.currency),
  );
}

/**
 * Split an amount by weights that sum back to exactly the original.
 *
 * Used for uneven splits, e.g. a shared bill where one person had the $8 dish
 * and another the $4. Uses largest-remainder so the residual minor units go to
 * the parts with the biggest fractional claim rather than always to the front.
 */
export function splitByWeights(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new MoneyError("Split requires at least one weight.");
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError("Weights must be finite and non-negative.");
  }
  const totalWeight = weights.reduce((a, w) => a + w, 0);
  if (totalWeight <= 0) {
    throw new MoneyError("Weights must sum to more than zero.");
  }

  const sign = m.minor < 0 ? -1 : 1;
  const magnitude = Math.abs(m.minor);

  const exact = weights.map((w) => (magnitude * w) / totalWeight);
  const floored = exact.map(Math.floor);
  let remainder = magnitude - floored.reduce((a, v) => a + v, 0);

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }

  return result.map((v) => money(sign * v, m.currency));
}

/** Round to the smallest denomination that physically circulates. */
export function roundToCashStep(m: Money): Money {
  const { cashStep } = CURRENCY_META[m.currency];
  if (cashStep <= 1) return m;
  const sign = m.minor < 0 ? -1 : 1;
  const magnitude = Math.abs(m.minor);
  return money(sign * Math.round(magnitude / cashStep) * cashStep, m.currency);
}

/** Locale-aware display string, e.g. "$5.25" or "12,000៛". */
export function formatMoney(
  m: Money,
  options: { showSymbol?: boolean; locale?: string } = {},
): string {
  const { showSymbol = true, locale = "en-US" } = options;
  const meta = CURRENCY_META[m.currency];

  const body = Math.abs(toMajor(m)).toLocaleString(locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });

  const sign = m.minor < 0 ? "-" : "";
  if (!showSymbol) return `${sign}${body}`;

  return meta.symbolLeading
    ? `${sign}${meta.symbol}${body}`
    : `${sign}${body}${meta.symbol}`;
}
