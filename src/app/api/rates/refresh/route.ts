import { createHash, timingSafeEqual } from "node:crypto";

import { describeSyncResult, syncUsdKhrRate } from "@/lib/rates/sync";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The daily exchange rate job's HTTP entry point (PRD Section 7).
 *
 * A route handler rather than a server action because the caller is a scheduler,
 * not a user: there is no session, no form, and nothing to re-render. Vercel Cron
 * issues a GET with `Authorization: Bearer $CRON_SECRET`, so GET is the primary
 * verb; POST is exposed for manual runs and for schedulers that insist on it.
 *
 * Not cached. Route handlers are uncached by default in this version of Next.js,
 * and this one reads request headers, which pins it to request time regardless. A
 * cached response here would mean the job appearing to succeed without running.
 */

/** Recognised outcomes mapped to a status code a scheduler will treat correctly. */
function statusCodeFor(status: "inserted" | "updated" | "failed"): number {
  // 502 rather than 500 on failure: the fault is upstream, and Vercel Cron
  // surfaces a non-2xx as a failed invocation, which is exactly the alert we want.
  return status === "failed" ? 502 : 200;
}

/**
 * Compare a presented secret with the configured one in constant time.
 *
 * Hashed to a fixed width first because `timingSafeEqual` throws on a length
 * mismatch, and that throw is itself an oracle for the secret's length.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Pull the caller's secret from either header a scheduler might use.
 *
 * Vercel Cron sends `Authorization: Bearer <secret>`. A plain `x-cron-secret` is
 * accepted too so the endpoint can be driven from Supabase `pg_cron` or a manual
 * curl without constructing a bearer token.
 */
function presentedSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }
  return request.headers.get("x-cron-secret");
}

async function handle(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;

  // No secret configured means the endpoint is unprotected, and an unprotected
  // endpoint that writes to the database is worse than a missing feature. Refuse
  // rather than run, and say which variable is absent.
  if (!expected) {
    return Response.json(
      {
        ok: false,
        error:
          "CRON_SECRET is not set. Refusing to run an unauthenticated rate refresh. " +
          "Set it in the environment and in the scheduler's Authorization header.",
      },
      { status: 503 },
    );
  }

  const presented = presentedSecret(request);
  if (!presented || !secretMatches(presented, expected)) {
    // Deliberately terse. Naming what was wrong with the credential helps an
    // attacker more than it helps an operator, who has the logs.
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return Response.json(
      {
        ok: false,
        error:
          "Supabase is not fully configured. The rate writer needs " +
          "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and " +
          "SUPABASE_SERVICE_ROLE_KEY, because the published rate is stored with a " +
          "null user_id that Row Level Security will not let a user session write.",
      },
      { status: 503 },
    );
  }

  const result = await syncUsdKhrRate();
  const summary = describeSyncResult(result);

  // Logged as well as returned: the scheduler's response body is easy to lose,
  // and a stalled job is diagnosed from logs weeks later.
  if (result.status === "failed") console.error(summary);
  else console.info(summary);

  return Response.json(
    {
      ok: result.status !== "failed",
      status: result.status,
      summary,
      pair: "USD/KHR",
      rate: result.rate?.rate ?? null,
      asOf: result.asOfDate ?? null,
      provider: result.providerId ?? null,
      previousRate: result.previousRate ?? null,
      // Every provider tried, so a silent failover to the backup source is
      // visible in the job's own output.
      attempts: result.attempts,
      // Only present on failure: what users keep seeing, and how old it is.
      fallback: result.fallback ?? null,
      error: result.error ?? null,
    },
    { status: statusCodeFor(result.status) },
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
