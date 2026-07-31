/**
 * Exchange rates and conversion.
 *
 * PRD Section 7. A rate is always stored in one canonical direction — how many
 * KHR to one USD — because storing both directions invites the two from
 * drifting out of sync and disagreeing about the same moment in time. The
 * inverse is derived on demand.
 */

import {
  CURRENCIES,
  type CurrencyCode,
  minorUnitScale,
} from "./currency";
import { money, MoneyError, type Money, zero } from "./money";

/**
 * KHR per 1 USD.
 *
 * The riel has been managed in a narrow band around 4000-4100 for years, so a
 * static default is a safe cold-start value. It is only a fallback: any real
 * rate from the `exchange_rates` table takes precedence.
 */
export const DEFAULT_USD_KHR_RATE = 4100;

export interface ExchangeRate {
  /** How many units of `quote` equal one unit of `base`, in major units. */
  readonly rate: number;
  readonly base: CurrencyCode;
  readonly quote: CurrencyCode;
  /** The moment this rate applies from. */
  readonly asOf: Date;
  readonly source?: "manual" | "api" | "default";
}

export function exchangeRate(
  rate: number,
  base: CurrencyCode,
  quote: CurrencyCode,
  asOf: Date = new Date(),
  source: ExchangeRate["source"] = "manual",
): ExchangeRate {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new MoneyError(`Exchange rate must be a positive finite number, received ${rate}.`);
  }
  if (base === quote && rate !== 1) {
    throw new MoneyError(`A ${base}/${base} rate must be exactly 1, received ${rate}.`);
  }
  return { rate, base, quote, asOf, source };
}

export const DEFAULT_RATE: ExchangeRate = {
  rate: DEFAULT_USD_KHR_RATE,
  base: "USD",
  quote: "KHR",
  asOf: new Date(0),
  source: "default",
};

/**
 * Resolve the multiplier that takes `from` major units to `to` major units.
 *
 * Accepts a rate quoted in either direction so callers do not have to care
 * which way round the stored row happens to be.
 */
export function resolveMultiplier(
  from: CurrencyCode,
  to: CurrencyCode,
  rate: ExchangeRate,
): number {
  if (from === to) return 1;

  if (rate.base === from && rate.quote === to) return rate.rate;
  if (rate.base === to && rate.quote === from) return 1 / rate.rate;

  throw new MoneyError(
    `Rate ${rate.base}/${rate.quote} cannot convert ${from} to ${to}.`,
  );
}

/**
 * Convert an amount into another currency.
 *
 * Crosses the minor-unit scale gap explicitly: USD has 2 decimals and KHR has
 * 0, so the scales differ by 100 and a naive multiply by the rate alone would
 * be off by that factor.
 */
export function convert(
  amount: Money,
  to: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): Money {
  if (amount.currency === to) return amount;

  const multiplier = resolveMultiplier(amount.currency, to, rate);
  const fromScale = minorUnitScale(amount.currency);
  const toScale = minorUnitScale(to);

  const targetMinor = (amount.minor / fromScale) * multiplier * toScale;
  const rounded = Math.sign(targetMinor) * Math.round(Math.abs(targetMinor));

  return money(rounded, to);
}

/**
 * The effective rate actually applied to a conversion, for audit purposes.
 *
 * `transactions.exchange_rate` (PRD Section 8) stores this so a historical row
 * can be re-derived exactly as the user saw it, even after the rate table moves
 * on.
 */
export function effectiveRate(
  from: CurrencyCode,
  to: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): number {
  return resolveMultiplier(from, to, rate);
}

/**
 * A time-ordered set of rates supporting historical lookup.
 *
 * PRD Section 7 requires historical rates so that last month's net worth does
 * not silently change when today's rate moves.
 */
export class RateTable {
  private readonly rates: ExchangeRate[];

  constructor(rates: readonly ExchangeRate[] = []) {
    this.rates = [...rates].sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
  }

  /** The rate in force at `when`: the most recent one on or before that moment. */
  rateAt(when: Date = new Date()): ExchangeRate {
    const target = when.getTime();
    let found: ExchangeRate | undefined;

    for (const rate of this.rates) {
      if (rate.asOf.getTime() <= target) found = rate;
      else break;
    }

    return found ?? DEFAULT_RATE;
  }

  convertAt(amount: Money, to: CurrencyCode, when: Date = new Date()): Money {
    return convert(amount, to, this.rateAt(when));
  }

  withRate(rate: ExchangeRate): RateTable {
    return new RateTable([...this.rates, rate]);
  }

  get all(): readonly ExchangeRate[] {
    return this.rates;
  }
}

/**
 * A single real-world payment settled partly in USD and partly in KHR.
 *
 * PRD Section 7's example is one purchase paid with $3 and 20,000៛. This is
 * routine in Cambodia: prices are quoted in dollars, change comes back in riel,
 * and people top up with whatever is in their pocket. Modelling it as two
 * unrelated transactions would double-count the purchase and break category
 * totals, so the tenders are kept together and the total is reported in a
 * single chosen currency.
 */
export interface MixedTender {
  readonly tenders: readonly Money[];
}

export function mixedTotal(
  tender: MixedTender,
  target: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): Money {
  return tender.tenders.reduce(
    (acc, part) => money(acc.minor + convert(part, target, rate).minor, target),
    zero(target),
  );
}

/** Net worth across accounts held in different currencies, in one base currency. */
export function totalInBaseCurrency(
  balances: readonly Money[],
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): Money {
  return balances.reduce(
    (acc, balance) => money(acc.minor + convert(balance, base, rate).minor, base),
    zero(base),
  );
}

/** Every ordered currency pair, for seeding and validation. */
export function allPairs(): Array<[CurrencyCode, CurrencyCode]> {
  const pairs: Array<[CurrencyCode, CurrencyCode]> = [];
  for (const from of CURRENCIES) {
    for (const to of CURRENCIES) {
      if (from !== to) pairs.push([from, to]);
    }
  }
  return pairs;
}
