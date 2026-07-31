/**
 * Reading exchange rates back out of the database.
 *
 * PRD Section 7 requires historical rates: last month's net worth must not move
 * when today's rate does. That means reads are always "the rate in force on this
 * date", never "the newest rate", which is what `RateTable` in `@/lib/money`
 * implements once the rows are loaded.
 *
 * Every read reports how old the figure is. A rate silently three weeks stale
 * looks exactly like a fresh one on screen, and the whole point of fetching
 * daily is undermined if a stalled job is invisible.
 */

import {
  DEFAULT_RATE,
  exchangeRate,
  type ExchangeRate,
  RateTable,
} from "@/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** A rate older than this many days is called out in the UI. */
export const STALE_AFTER_DAYS = 2;

export type RateFreshness =
  /** Published today or yesterday. */
  | "fresh"
  /** Real, but older than `STALE_AFTER_DAYS`. The sync job may be stalled. */
  | "stale"
  /** No stored rate at all, so the built-in cold-start value is in use. */
  | "fallback";

export interface RateSnapshot {
  rate: ExchangeRate;
  freshness: RateFreshness;
  /** Whole days between the rate's `as_of` date and today. Null when falling back. */
  ageDays: number | null;
  /** True when a user's own override outranked the published figure. */
  isUserOverride: boolean;
}

/** The columns the queries below select. `rate` arrives as a string from numeric. */
interface ExchangeRateRow {
  rate: string | number;
  base_currency: string;
  quote_currency: string;
  as_of: string;
  source: string;
  user_id: string | null;
}

function isRateSource(value: string): value is NonNullable<ExchangeRate["source"]> {
  return value === "manual" || value === "api" || value === "default";
}

/**
 * Turn a database row into an `ExchangeRate`.
 *
 * `numeric(18,8)` comes back from PostgREST as a string, because a JavaScript
 * number cannot hold every value the column can. Coercing without checking would
 * turn a malformed value into NaN and poison every conversion downstream, so an
 * unusable rate is rejected here instead.
 */
export function toExchangeRate(row: ExchangeRateRow): ExchangeRate {
  const value = typeof row.rate === "number" ? row.rate : Number(row.rate);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `exchange_rates row for ${row.as_of} holds an unusable rate: ${String(row.rate)}`,
    );
  }
  if (row.base_currency !== "USD" && row.base_currency !== "KHR") {
    throw new Error(`Unsupported base currency in exchange_rates: ${row.base_currency}`);
  }
  if (row.quote_currency !== "USD" && row.quote_currency !== "KHR") {
    throw new Error(`Unsupported quote currency in exchange_rates: ${row.quote_currency}`);
  }

  return exchangeRate(
    value,
    row.base_currency,
    row.quote_currency,
    // `as_of` is a DATE, so anchor it at UTC midnight rather than letting the
    // server's local timezone shift it a day either way.
    new Date(`${row.as_of}T00:00:00.000Z`),
    isRateSource(row.source) ? row.source : "manual",
  );
}

function wholeDaysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function classify(rate: ExchangeRate, now: Date): RateSnapshot {
  const ageDays = Math.max(0, wholeDaysBetween(rate.asOf, now));

  return {
    rate,
    freshness: ageDays > STALE_AFTER_DAYS ? "stale" : "fresh",
    ageDays,
    isUserOverride: false,
  };
}

/** What to report when there is nothing stored, or nowhere to read from. */
export function fallbackSnapshot(): RateSnapshot {
  return { rate: DEFAULT_RATE, freshness: "fallback", ageDays: null, isUserOverride: false };
}

/**
 * The USD/KHR rate to report with, as at `asOf`.
 *
 * Prefers the user's own override for a given day over the published figure,
 * because someone who recorded the rate their money changer gave them means it.
 * Falls back to the built-in cold-start rate when Supabase is not configured, so
 * the app still renders against demo data.
 */
export async function loadUsdKhrRate(
  { asOf = new Date() }: { asOf?: Date } = {},
): Promise<RateSnapshot> {
  if (!isSupabaseConfigured()) return fallbackSnapshot();

  const supabase = await createClient();
  const asOfDate = asOf.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("exchange_rates")
    .select("rate, base_currency, quote_currency, as_of, source, user_id")
    .eq("base_currency", "USD")
    .eq("quote_currency", "KHR")
    // Most recent rate on or before the date, never a future one: a settled
    // figure must stay settled.
    .lte("as_of", asOfDate)
    .order("as_of", { ascending: false })
    // A user override and the global row can share a date; fetch both and prefer
    // the override rather than relying on row order.
    .limit(8);

  if (error || !data || data.length === 0) return fallbackSnapshot();

  const newestDate = data[0].as_of;
  const sameDay = data.filter((row) => row.as_of === newestDate);
  const override = sameDay.find((row) => row.user_id !== null);
  const chosen = override ?? sameDay[0];

  try {
    const snapshot = classify(toExchangeRate(chosen as ExchangeRateRow), asOf);
    return { ...snapshot, isUserOverride: override !== undefined };
  } catch {
    // A corrupt row must not take the page down; the cold-start rate is honest
    // about being a fallback.
    return fallbackSnapshot();
  }
}

/**
 * Every rate from `since` onward, as a `RateTable`.
 *
 * Reports over a date range need the rate in force on each transaction's own
 * date, not one rate applied to the whole period.
 */
export async function loadRateTable(
  { since }: { since: Date },
): Promise<RateTable> {
  if (!isSupabaseConfigured()) return new RateTable([DEFAULT_RATE]);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("exchange_rates")
    .select("rate, base_currency, quote_currency, as_of, source, user_id")
    .eq("base_currency", "USD")
    .eq("quote_currency", "KHR")
    .gte("as_of", since.toISOString().slice(0, 10))
    .order("as_of", { ascending: true });

  if (error || !data || data.length === 0) return new RateTable([DEFAULT_RATE]);

  const rates: ExchangeRate[] = [];
  for (const row of data) {
    try {
      rates.push(toExchangeRate(row as ExchangeRateRow));
    } catch {
      // Skip the bad row rather than losing the whole table.
    }
  }

  // RateTable sorts and resolves duplicates by recency, so a user override
  // loaded after the global row for the same day wins.
  return rates.length > 0 ? new RateTable(rates) : new RateTable([DEFAULT_RATE]);
}

/** How to describe a snapshot in the UI, in a few words. */
export function describeFreshness(snapshot: RateSnapshot): string {
  if (snapshot.freshness === "fallback") return "built-in fallback rate";
  if (snapshot.isUserOverride) return "your rate";
  if (snapshot.ageDays === 0) return "updated today";
  if (snapshot.ageDays === 1) return "updated yesterday";
  return `${snapshot.ageDays} days old`;
}
