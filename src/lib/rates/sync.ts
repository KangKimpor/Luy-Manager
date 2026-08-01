/**
 * The daily exchange rate job.
 *
 * PRD Section 7 requires automatic rates. This is the write half: fetch from the
 * web, store the figure as the published global rate for its date, and record
 * what happened either way.
 *
 * The recording is not incidental. `references/currency-data.md` is explicit that
 * a failed fetch must never quietly leave a stale rate in place, because the app
 * carries on converting balances with it and nothing on screen looks wrong. So
 * every run writes a row to `exchange_rate_sync_runs`, including the runs that
 * failed and the age of the figure users are consequently still seeing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExchangeRate } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  fetchUsdKhrRate,
  type FetchRateOptions,
  type RateAttempt,
  RateFetchError,
} from "./provider";
import { toExchangeRate } from "./repository";

export type RateSyncStatus =
  /** A new rate was stored for a date that had none. */
  | "inserted"
  /** A rate already existed for the date and was replaced with the fetched one. */
  | "updated"
  /** Every provider failed. The previously stored rate, if any, still applies. */
  | "failed";

export interface RateSyncResult {
  status: RateSyncStatus;
  /** YYYY-MM-DD the rate was filed under, on success. */
  asOfDate?: string;
  rate?: ExchangeRate;
  providerId?: string;
  /** The rate that was already on file for the same date, when one was. */
  previousRate?: number;
  /** The figure the app keeps using after a failure, and how stale it now is. */
  fallback?: { rate: number; asOfDate: string; ageDays: number } | null;
  error?: string;
  attempts: readonly RateAttempt[];
}

const USD_KHR = { base_currency: "USD", quote_currency: "KHR" } as const;

function daysBetween(isoDate: string, now: Date): number {
  const MS_PER_DAY = 86_400_000;
  const then = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.floor((now.getTime() - then) / MS_PER_DAY));
}

/** The most recent published rate of any date, to describe what a failure leaves behind. */
async function readNewestGlobalRate(
  supabase: SupabaseClient,
): Promise<{ rate: number; asOfDate: string } | null> {
  const { data } = await supabase
    .from("exchange_rates")
    .select("rate, base_currency, quote_currency, as_of, source, user_id")
    .match(USD_KHR)
    .is("user_id", null)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  try {
    return { rate: toExchangeRate(data).rate, asOfDate: data.as_of as string };
  } catch {
    return null;
  }
}

export interface SyncOptions extends FetchRateOptions {
  /** Injected in tests. Defaults to a service-role client. */
  client?: SupabaseClient;
  now?: Date;
}

/**
 * Fetch and store today's USD/KHR rate.
 *
 * Resolves rather than throws on a provider failure: the caller is a scheduled
 * job whose own job is to report the outcome, and a rejected promise there tends
 * to become an unread stack trace rather than a recorded fact.
 */
export async function syncUsdKhrRate(options: SyncOptions = {}): Promise<RateSyncResult> {
  const { client, now = new Date(), ...fetchOptions } = options;
  const supabase = client ?? createAdminClient();

  let fetched;
  try {
    fetched = await fetchUsdKhrRate(fetchOptions);
  } catch (error) {
    const attempts = error instanceof RateFetchError ? error.attempts : [];
    const message = error instanceof Error ? error.message : String(error);
    const newest = await readNewestGlobalRate(supabase);

    const fallback = newest
      ? { ...newest, ageDays: daysBetween(newest.asOfDate, now) }
      : null;

    await recordRun(supabase, {
      status: "failed",
      error: message,
      attempts,
      fallback,
      now,
    });

    return { status: "failed", error: message, attempts, fallback };
  }

  // Written through an RPC rather than `.upsert()`. The global uniqueness index
  // is partial (`where user_id is null`), and Postgres only infers a partial
  // index as an ON CONFLICT target when the statement repeats that predicate,
  // something PostgREST's `on_conflict` column list cannot express. Going through
  // `upsert_global_exchange_rate` (migration 0005) also returns whether the day's
  // rate was new or corrected, without a second round trip.
  const { data, error: writeError } = await supabase
    .rpc("upsert_global_exchange_rate", {
      p_base: "USD",
      p_quote: "KHR",
      p_rate: fetched.rate.rate,
      p_as_of: fetched.asOfDate,
      p_source: "api",
    })
    .maybeSingle<{ action: RateSyncStatus; previous_rate: string | number | null }>();

  if (writeError) {
    const message =
      `Fetched ${fetched.rate.rate} from ${fetched.providerId} ` +
      `but the write failed: ${writeError.message}`;
    await recordRun(supabase, {
      status: "failed",
      error: message,
      attempts: fetched.attempts,
      fallback: null,
      now,
    });
    return { status: "failed", error: message, attempts: fetched.attempts };
  }

  const status: RateSyncStatus = data?.action === "updated" ? "updated" : "inserted";
  const previousRate =
    data?.previous_rate === null || data?.previous_rate === undefined
      ? undefined
      : Number(data.previous_rate);

  await recordRun(supabase, {
    status,
    providerId: fetched.providerId,
    rate: fetched.rate.rate,
    asOfDate: fetched.asOfDate,
    attempts: fetched.attempts,
    now,
  });

  return {
    status,
    asOfDate: fetched.asOfDate,
    rate: fetched.rate,
    providerId: fetched.providerId,
    previousRate,
    attempts: fetched.attempts,
  };
}

interface RunRecord {
  status: RateSyncStatus;
  providerId?: string;
  rate?: number;
  asOfDate?: string;
  error?: string;
  attempts: readonly RateAttempt[];
  fallback?: { rate: number; asOfDate: string; ageDays: number } | null;
  now: Date;
}

/**
 * Append to the sync audit trail.
 *
 * Failures here are swallowed on purpose. A successfully stored rate that could
 * not be logged is still a stored rate, and throwing would turn a bookkeeping
 * problem into a failed job that a retry cannot fix.
 */
async function recordRun(supabase: SupabaseClient, record: RunRecord): Promise<void> {
  const { error } = await supabase.from("exchange_rate_sync_runs").insert({
    ...USD_KHR,
    status: record.status,
    provider_id: record.providerId ?? null,
    rate: record.rate ?? null,
    as_of: record.asOfDate ?? null,
    error_message: record.error ?? null,
    // The whole attempt chain, so a provider that has been quietly failing over
    // to the fallback for weeks is visible rather than inferred.
    attempts: record.attempts,
    fallback_rate: record.fallback?.rate ?? null,
    fallback_as_of: record.fallback?.asOfDate ?? null,
    fallback_age_days: record.fallback?.ageDays ?? null,
    ran_at: record.now.toISOString(),
  });

  if (error) {
    console.error("exchange rate sync: could not record run", error.message);
  }
}

/** One-line summary for logs and the job's HTTP response. */
export function describeSyncResult(result: RateSyncResult): string {
  if (result.status === "failed") {
    const stale = result.fallback
      ? `still serving ${result.fallback.rate} from ${result.fallback.asOfDate} (${result.fallback.ageDays} days old)`
      : "no stored rate available, using the built-in fallback";
    return `Rate sync failed: ${result.error}. Consequence: ${stale}.`;
  }

  const change =
    result.previousRate === undefined
      ? "new"
      : `was ${result.previousRate}`;

  return `Rate ${result.status}: ${result.rate?.rate} KHR per USD for ${result.asOfDate} from ${result.providerId} (${change}).`;
}
