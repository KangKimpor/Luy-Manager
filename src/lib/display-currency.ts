/**
 * The currency totals are reported in.
 *
 * PRD Section 7 requires net worth in a chosen base currency: someone in Phnom
 * Penh thinks in dollars for rent and riel for lunch, and needs to see one
 * number in whichever unit the question is about.
 *
 * Held in a cookie rather than client state for two reasons. It survives a
 * reload and applies across pages, so the dashboard and the accounts page never
 * disagree about which currency the totals are in. And because the server reads
 * it during render, the aggregation stays where it already is (in server
 * components calling pure functions) instead of moving the whole ledger to the
 * browser to be re-totalled there.
 *
 * `profiles.base_currency` already exists in migration 0001 and is the eventual
 * home for this once authentication lands; the cookie then becomes a cache of it
 * for anonymous and first-render use.
 */

import { cookies } from "next/headers";

import { type CurrencyCode, isCurrencyCode } from "@/lib/money";

export const DISPLAY_CURRENCY_COOKIE = "luy.display-currency";

/**
 * A year. A reporting-currency preference is not sensitive and does not go stale,
 * and being asked again every session would be worse than the cookie persisting.
 */
export const DISPLAY_CURRENCY_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * USD, matching `profiles.base_currency`'s default in migration 0001.
 *
 * Prices are commonly quoted in dollars in Cambodia, so it is the less surprising
 * first impression, and it is the value the database would report for a new user.
 */
export const DEFAULT_DISPLAY_CURRENCY: CurrencyCode = "USD";

/**
 * Validate a cookie value into a currency.
 *
 * A cookie is user-controlled input, so anything unrecognised falls back rather
 * than propagating. Passing an arbitrary string on to `money()` would throw
 * during render and take the page down.
 */
export function parseDisplayCurrency(value: string | undefined | null): CurrencyCode {
  return value && isCurrencyCode(value) ? value : DEFAULT_DISPLAY_CURRENCY;
}

/** The currency to report totals in for this request. */
export async function readDisplayCurrency(): Promise<CurrencyCode> {
  const store = await cookies();
  return parseDisplayCurrency(store.get(DISPLAY_CURRENCY_COOKIE)?.value);
}

/** The other currency, for the "or see it in ..." affordance beside a total. */
export function otherCurrency(currency: CurrencyCode): CurrencyCode {
  return currency === "USD" ? "KHR" : "USD";
}
