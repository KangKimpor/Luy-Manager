/**
 * Fetching the daily USD/KHR rate from the web.
 *
 * PRD Section 7 requires automatic exchange rates; PRD Section 17 decision 5
 * asks which provider supplies them and what happens when it is unavailable.
 * This module is that decision in code.
 *
 * Why not the National Bank of Cambodia, which `references/currency-data.md`
 * ranks as most authoritative: it publishes an official daily rate on a PHP page
 * with no API, and the host rejects programmatic requests outright (HTTP 403).
 * Scraping it would be a silent single point of failure. So the primary source
 * is a keyless commercial aggregator with a second, independent aggregator
 * behind it, and manual entry always remains available as an override — which
 * for a personal-finance product is often the truest figure anyway, because the
 * rate that matters is the one the user's own bank applied.
 *
 * This module does IO. Everything under `@/lib/money` stays pure; the only thing
 * that crosses back is a validated `ExchangeRate`.
 */

import { exchangeRate, type ExchangeRate } from "@/lib/money";

/**
 * The band a USD/KHR rate must fall in to be believed.
 *
 * The riel is managed in a narrow corridor around 4,000-4,100. A value outside
 * this band does not mean the riel moved, it means the payload was misread: a
 * units error is a factor of 100 or 1000, and an aggregator returning a
 * placeholder returns 1. Accepting such a figure would silently corrupt every
 * converted balance in the app, which is far worse than reporting no rate at
 * all. Deliberately wide, so a genuine devaluation is not mistaken for a bug.
 */
export const PLAUSIBLE_USD_KHR = { min: 2000, max: 8000 } as const;

/** How long to wait on any single provider before moving to the next. */
const REQUEST_TIMEOUT_MS = 8_000;

export interface RateProvider {
  /** Stable identifier, recorded against every sync attempt. */
  readonly id: string;
  readonly label: string;
  /** Where the provider's terms live, so attribution stays traceable. */
  readonly attribution: string;
  readonly url: string;
  /**
   * Pull the KHR-per-USD figure and its publication date out of a payload.
   *
   * Returns the date as YYYY-MM-DD exactly as the provider states it, rather
   * than deriving it from the local clock: `exchange_rates.as_of` is what
   * historical lookups key off, and a server in another timezone must not file
   * today's rate under yesterday's date.
   */
  parse(payload: unknown): { rate: number; asOfDate: string };
}

export class RateFetchError extends Error {
  constructor(
    message: string,
    readonly attempts: readonly RateAttempt[] = [],
  ) {
    super(message);
    this.name = "RateFetchError";
  }
}

/** One provider's outcome, kept whether it succeeded or not, for the audit trail. */
export interface RateAttempt {
  providerId: string;
  ok: boolean;
  /** Populated on success. */
  rate?: number;
  /** Populated on failure. */
  error?: string;
  durationMs: number;
}

export interface FetchedRate {
  /** Validated, ready to persist or convert with. `source` is always "api". */
  rate: ExchangeRate;
  providerId: string;
  providerLabel: string;
  attribution: string;
  /** Publication date, YYYY-MM-DD. Goes straight into `exchange_rates.as_of`. */
  asOfDate: string;
  /** Every provider tried, in order, including the ones that failed. */
  attempts: readonly RateAttempt[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: unknown, providerId: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new RateFetchError(`${providerId} returned an unusable date: ${String(value)}`);
  }
  return value;
}

/**
 * exchangerate-api's free, keyless endpoint. Updates once a day and states when
 * the next update is due, which is what makes a daily job meaningful rather
 * than a guess.
 */
export const EXCHANGERATE_API: RateProvider = {
  id: "exchangerate-api",
  label: "exchangerate-api.com (open access)",
  attribution: "https://www.exchangerate-api.com/terms",
  url: "https://open.er-api.com/v6/latest/USD",
  parse(payload) {
    if (!isRecord(payload)) {
      throw new RateFetchError("exchangerate-api returned a non-object payload.");
    }
    if (payload.result !== "success") {
      throw new RateFetchError(
        `exchangerate-api reported result=${String(payload.result)}.`,
      );
    }
    if (payload.base_code !== "USD") {
      // A different base would silently invert the whole conversion.
      throw new RateFetchError(
        `exchangerate-api returned base ${String(payload.base_code)}, expected USD.`,
      );
    }
    if (!isRecord(payload.rates)) {
      throw new RateFetchError("exchangerate-api payload had no rates object.");
    }

    const khr = payload.rates.KHR;
    if (typeof khr !== "number") {
      throw new RateFetchError("exchangerate-api payload did not quote KHR.");
    }

    const updated = payload.time_last_update_unix;
    if (typeof updated !== "number" || !Number.isFinite(updated)) {
      throw new RateFetchError("exchangerate-api payload had no update timestamp.");
    }

    return {
      rate: khr,
      asOfDate: new Date(updated * 1000).toISOString().slice(0, 10),
    };
  },
};

/**
 * An independent fallback built from a different upstream dataset, served over
 * jsDelivr's CDN. Chosen because a second aggregator sharing the primary's
 * upstream would fail at the same moment and add no resilience.
 */
export const CURRENCY_API: RateProvider = {
  id: "currency-api",
  label: "@fawazahmed0/currency-api via jsDelivr",
  attribution: "https://github.com/fawazahmed0/exchange-api",
  url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
  parse(payload) {
    if (!isRecord(payload) || !isRecord(payload.usd)) {
      throw new RateFetchError("currency-api payload had no usd object.");
    }

    const khr = payload.usd.khr;
    if (typeof khr !== "number") {
      throw new RateFetchError("currency-api payload did not quote KHR.");
    }

    return { rate: khr, asOfDate: assertIsoDate(payload.date, "currency-api") };
  },
};

/** Primary first. Order is the fallback order. */
export const RATE_PROVIDERS: readonly RateProvider[] = [EXCHANGERATE_API, CURRENCY_API];

export interface FetchRateOptions {
  /** Injected in tests so the parsing and fallback logic runs without a network. */
  fetchImpl?: typeof fetch;
  providers?: readonly RateProvider[];
  timeoutMs?: number;
}

async function askProvider(
  provider: RateProvider,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ rate: number; asOfDate: string }> {
  const response = await fetchImpl(provider.url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
    // The whole point of this call is to learn something that changed today.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new RateFetchError(`${provider.id} responded ${response.status}.`);
  }

  const parsed = provider.parse(await response.json());

  if (!Number.isFinite(parsed.rate) || parsed.rate <= 0) {
    throw new RateFetchError(`${provider.id} quoted an invalid rate: ${parsed.rate}.`);
  }
  if (parsed.rate < PLAUSIBLE_USD_KHR.min || parsed.rate > PLAUSIBLE_USD_KHR.max) {
    throw new RateFetchError(
      `${provider.id} quoted ${parsed.rate} KHR per USD, outside the plausible ` +
        `${PLAUSIBLE_USD_KHR.min}-${PLAUSIBLE_USD_KHR.max} band. Treating it as a ` +
        `misread payload rather than a real move.`,
    );
  }

  return parsed;
}

/**
 * Fetch today's USD/KHR rate, trying each provider in turn.
 *
 * Throws `RateFetchError` when every provider fails, carrying all attempts.
 * It deliberately does not fall back to a stale or default rate: that decision
 * belongs to the caller, which is the only layer that can record having made it.
 * Quietly returning yesterday's number is the failure mode this design exists to
 * prevent.
 */
export async function fetchUsdKhrRate(
  options: FetchRateOptions = {},
): Promise<FetchedRate> {
  const {
    fetchImpl = fetch,
    providers = RATE_PROVIDERS,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  if (providers.length === 0) {
    throw new RateFetchError("No exchange rate providers configured.");
  }

  const attempts: RateAttempt[] = [];

  for (const provider of providers) {
    const startedAt = Date.now();

    try {
      const { rate, asOfDate } = await askProvider(provider, fetchImpl, timeoutMs);
      attempts.push({
        providerId: provider.id,
        ok: true,
        rate,
        durationMs: Date.now() - startedAt,
      });

      return {
        rate: exchangeRate(rate, "USD", "KHR", new Date(`${asOfDate}T00:00:00.000Z`), "api"),
        providerId: provider.id,
        providerLabel: provider.label,
        attribution: provider.attribution,
        asOfDate,
        attempts,
      };
    } catch (error) {
      attempts.push({
        providerId: provider.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
    }
  }

  throw new RateFetchError(
    `Every exchange rate provider failed: ${attempts
      .map((a) => `${a.providerId} (${a.error})`)
      .join("; ")}`,
    attempts,
  );
}
