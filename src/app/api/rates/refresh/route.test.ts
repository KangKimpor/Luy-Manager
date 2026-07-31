import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";
import type { RateSyncResult } from "@/lib/rates/sync";

/**
 * The scheduled job's entry point is a plain Request-to-Response function, so it
 * is tested directly rather than through a running server. What matters here is
 * the guard: this endpoint writes to the database with a key that bypasses Row
 * Level Security, so every way of reaching it without the secret has to be shut.
 */

const syncUsdKhrRate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rates/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rates/sync")>();
  return { ...actual, syncUsdKhrRate };
});

const SECRET = "correct-horse-battery-staple";

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/rates/refresh", { headers });
}

const successResult: RateSyncResult = {
  status: "inserted",
  asOfDate: "2026-07-31",
  providerId: "exchangerate-api",
  attempts: [{ providerId: "exchangerate-api", ok: true, rate: 4047.465227, durationMs: 12 }],
  rate: {
    rate: 4047.465227,
    base: "USD",
    quote: "KHR",
    asOf: new Date("2026-07-31T00:00:00.000Z"),
    source: "api",
  },
};

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  syncUsdKhrRate.mockReset();
  syncUsdKhrRate.mockResolvedValue(successResult);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authorization", () => {
  it("rejects a request with no credential", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(syncUsdKhrRate).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token", async () => {
    const response = await GET(request({ authorization: "Bearer nope" }));

    expect(response.status).toBe(401);
    expect(syncUsdKhrRate).not.toHaveBeenCalled();
  });

  it("rejects a token that merely shares a prefix", async () => {
    const response = await GET(request({ authorization: `Bearer ${SECRET.slice(0, 10)}` }));

    expect(response.status).toBe(401);
    expect(syncUsdKhrRate).not.toHaveBeenCalled();
  });

  it("does not leak why the credential failed", async () => {
    const response = await GET(request({ authorization: "Bearer nope" }));

    await expect(response.json()).resolves.toEqual({ ok: false, error: "Unauthorized." });
  });

  it("accepts the secret as a bearer token, the way Vercel Cron sends it", async () => {
    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(200);
    expect(syncUsdKhrRate).toHaveBeenCalledOnce();
  });

  it("accepts the secret in x-cron-secret, for other schedulers", async () => {
    const response = await GET(request({ "x-cron-secret": SECRET }));

    expect(response.status).toBe(200);
  });

  it("refuses to run at all when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    // An unprotected endpoint that writes to the database is worse than a
    // missing feature, so it must fail closed rather than run unauthenticated.
    expect(response.status).toBe(503);
    expect(syncUsdKhrRate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("CRON_SECRET"),
    });
  });

  it("works over POST as well as GET", async () => {
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(200);
  });
});

describe("configuration", () => {
  it("reports a missing service role key rather than failing opaquely", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(503);
    expect(syncUsdKhrRate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });

  it("reports missing Supabase configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(503);
  });
});

describe("outcomes", () => {
  it("returns the stored rate and provider on success", async () => {
    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "inserted",
      pair: "USD/KHR",
      rate: 4047.465227,
      asOf: "2026-07-31",
      provider: "exchangerate-api",
    });
  });

  it("answers 502 when every provider failed, so the scheduler flags it", async () => {
    syncUsdKhrRate.mockResolvedValue({
      status: "failed",
      error: "Every exchange rate provider failed",
      attempts: [
        { providerId: "exchangerate-api", ok: false, error: "timeout", durationMs: 8000 },
        { providerId: "currency-api", ok: false, error: "503", durationMs: 120 },
      ],
      fallback: { rate: 4047.46, asOfDate: "2026-07-22", ageDays: 9 },
    } satisfies RateSyncResult);

    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    // A 2xx here would let a silently stalled job look healthy for weeks.
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.ok).toBe(false);
    // The response has to say what users are still being shown, and how old it is.
    expect(body.fallback).toEqual({ rate: 4047.46, asOfDate: "2026-07-22", ageDays: 9 });
    expect(body.summary).toContain("9 days old");
    // Both providers are named, so a silent failover is visible.
    expect(body.attempts).toHaveLength(2);
  });

  it("surfaces a correction to an existing day as updated", async () => {
    syncUsdKhrRate.mockResolvedValue({
      ...successResult,
      status: "updated",
      previousRate: 4100,
    } satisfies RateSyncResult);

    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "updated",
      previousRate: 4100,
    });
  });
});
