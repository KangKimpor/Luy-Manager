import { describe, expect, it, vi } from "vitest";

import {
  CURRENCY_API,
  EXCHANGERATE_API,
  fetchUsdKhrRate,
  PLAUSIBLE_USD_KHR,
  RATE_PROVIDERS,
  RateFetchError,
  type RateProvider,
} from "./provider";
import { convert, fromMajor } from "@/lib/money";

/** A fetch stub that answers each URL from a map, in call order. */
function stubFetch(handlers: Record<string, () => unknown>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const handler = handlers[url];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);

    const body = handler();
    if (body instanceof Error) throw body;

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function erApiPayload(khr: unknown, updatedUnix = Date.UTC(2026, 6, 31) / 1000) {
  return {
    result: "success",
    base_code: "USD",
    time_last_update_unix: updatedUnix,
    rates: { USD: 1, KHR: khr },
  };
}

describe("EXCHANGERATE_API.parse", () => {
  it("reads the KHR rate and the publication date", () => {
    const parsed = EXCHANGERATE_API.parse(erApiPayload(4047.465227));

    expect(parsed.rate).toBe(4047.465227);
    expect(parsed.asOfDate).toBe("2026-07-31");
  });

  it("rejects a payload reporting failure", () => {
    expect(() => EXCHANGERATE_API.parse({ result: "error" })).toThrow(RateFetchError);
  });

  it("rejects a payload quoted against a different base", () => {
    // Silently accepting this would invert every conversion in the app.
    expect(() =>
      EXCHANGERATE_API.parse({
        result: "success",
        base_code: "EUR",
        time_last_update_unix: 1,
        rates: { KHR: 4400 },
      }),
    ).toThrow(/expected USD/);
  });

  it("rejects a payload with no KHR quote", () => {
    expect(() => EXCHANGERATE_API.parse(erApiPayload(undefined))).toThrow(/did not quote KHR/);
  });

  it("rejects a KHR quote that is not a number", () => {
    // A numeric string would coerce silently in arithmetic.
    expect(() => EXCHANGERATE_API.parse(erApiPayload("4047.46"))).toThrow(/did not quote KHR/);
  });

  it("rejects a non-object payload", () => {
    expect(() => EXCHANGERATE_API.parse("nope")).toThrow(RateFetchError);
  });
});

describe("CURRENCY_API.parse", () => {
  it("reads the lowercase khr rate and the stated date", () => {
    const parsed = CURRENCY_API.parse({ date: "2026-07-31", usd: { khr: 4041.50826679 } });

    expect(parsed.rate).toBe(4041.50826679);
    expect(parsed.asOfDate).toBe("2026-07-31");
  });

  it("rejects a malformed date rather than guessing", () => {
    expect(() => CURRENCY_API.parse({ date: "31-07-2026", usd: { khr: 4041 } })).toThrow(
      /unusable date/,
    );
  });

  it("rejects a payload with no usd object", () => {
    expect(() => CURRENCY_API.parse({ date: "2026-07-31" })).toThrow(/no usd object/);
  });
});

describe("fetchUsdKhrRate", () => {
  it("returns a validated rate from the primary provider", async () => {
    const fetchImpl = stubFetch({
      [EXCHANGERATE_API.url]: () => erApiPayload(4047.465227),
    });

    const result = await fetchUsdKhrRate({ fetchImpl });

    expect(result.providerId).toBe("exchangerate-api");
    expect(result.rate.rate).toBe(4047.465227);
    expect(result.rate.base).toBe("USD");
    expect(result.rate.quote).toBe("KHR");
    // Marked as machine-fetched so a manual override can outrank it.
    expect(result.rate.source).toBe("api");
    expect(result.asOfDate).toBe("2026-07-31");
    expect(result.attempts).toHaveLength(1);
  });

  it("does not call the fallback when the primary succeeds", async () => {
    const fetchImpl = stubFetch({
      [EXCHANGERATE_API.url]: () => erApiPayload(4100),
    });

    await fetchUsdKhrRate({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the second provider when the first fails", async () => {
    const fetchImpl = stubFetch({
      [EXCHANGERATE_API.url]: () => new Error("network down"),
      [CURRENCY_API.url]: () => ({ date: "2026-07-31", usd: { khr: 4041.5 } }),
    });

    const result = await fetchUsdKhrRate({ fetchImpl });

    expect(result.providerId).toBe("currency-api");
    expect(result.rate.rate).toBe(4041.5);
    // Both attempts are kept, so the audit trail shows the primary was tried.
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({ providerId: "exchangerate-api", ok: false });
    expect(result.attempts[1]).toMatchObject({ providerId: "currency-api", ok: true });
  });

  it("falls back when the first provider returns a non-200", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === EXCHANGERATE_API.url) {
        return new Response("gateway timeout", { status: 504 });
      }
      return new Response(JSON.stringify({ date: "2026-07-31", usd: { khr: 4040 } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await fetchUsdKhrRate({ fetchImpl });

    expect(result.providerId).toBe("currency-api");
    expect(result.attempts[0].error).toMatch(/504/);
  });

  it("throws rather than inventing a rate when every provider fails", async () => {
    const fetchImpl = stubFetch({
      [EXCHANGERATE_API.url]: () => new Error("primary down"),
      [CURRENCY_API.url]: () => new Error("fallback down"),
    });

    // A silent fall back to 1.0, or to yesterday's figure, is the failure this
    // guards against: it would corrupt every converted balance invisibly.
    await expect(fetchUsdKhrRate({ fetchImpl })).rejects.toThrow(RateFetchError);
  });

  it("carries every attempt on the thrown error", async () => {
    const fetchImpl = stubFetch({
      [EXCHANGERATE_API.url]: () => new Error("primary down"),
      [CURRENCY_API.url]: () => new Error("fallback down"),
    });

    await expect(fetchUsdKhrRate({ fetchImpl })).rejects.toMatchObject({
      attempts: [
        { providerId: "exchangerate-api", ok: false },
        { providerId: "currency-api", ok: false },
      ],
    });
  });

  it("rejects an implausibly low rate as a misread payload", async () => {
    // A placeholder 1.0 is the classic silent-conversion bug.
    const fetchImpl = stubFetch({ [EXCHANGERATE_API.url]: () => erApiPayload(1) });

    await expect(
      fetchUsdKhrRate({ fetchImpl, providers: [EXCHANGERATE_API] }),
    ).rejects.toThrow(/plausible/);
  });

  it("rejects an implausibly high rate, which means a units error", async () => {
    // 100x out: riel quoted in sen, or cents mistaken for dollars.
    const fetchImpl = stubFetch({ [EXCHANGERATE_API.url]: () => erApiPayload(410_000) });

    await expect(
      fetchUsdKhrRate({ fetchImpl, providers: [EXCHANGERATE_API] }),
    ).rejects.toThrow(/plausible/);
  });

  it("accepts a real devaluation inside the band", async () => {
    const fetchImpl = stubFetch({ [EXCHANGERATE_API.url]: () => erApiPayload(5200) });

    const result = await fetchUsdKhrRate({ fetchImpl, providers: [EXCHANGERATE_API] });

    expect(result.rate.rate).toBe(5200);
    expect(result.rate.rate).toBeLessThan(PLAUSIBLE_USD_KHR.max);
  });

  it("errors when no providers are configured", async () => {
    await expect(fetchUsdKhrRate({ providers: [] })).rejects.toThrow(/No exchange rate/);
  });

  it("produces a rate that converts across the minor-unit scale gap", async () => {
    const fetchImpl = stubFetch({ [EXCHANGERATE_API.url]: () => erApiPayload(4100) });

    const { rate } = await fetchUsdKhrRate({ fetchImpl, providers: [EXCHANGERATE_API] });

    // $3.00 must become 12,300៛, not 1,230,000: KHR has no subunit.
    expect(convert(fromMajor(3, "USD"), "KHR", rate).minor).toBe(12_300);
  });

  it("tries providers in the declared order", async () => {
    const calls: string[] = [];
    const record = (id: string): RateProvider => ({
      id,
      label: id,
      attribution: "",
      url: `https://example.test/${id}`,
      parse: () => {
        calls.push(id);
        throw new RateFetchError(`${id} refused`);
      },
    });

    const first = record("first");
    const second = record("second");
    const fetchImpl = stubFetch({ [first.url]: () => ({}), [second.url]: () => ({}) });

    await expect(
      fetchUsdKhrRate({ fetchImpl, providers: [first, second] }),
    ).rejects.toThrow(RateFetchError);
    expect(calls).toEqual(["first", "second"]);
  });

  it("ships with the verified primary ahead of the independent fallback", () => {
    expect(RATE_PROVIDERS.map((p) => p.id)).toEqual(["exchangerate-api", "currency-api"]);
  });
});
