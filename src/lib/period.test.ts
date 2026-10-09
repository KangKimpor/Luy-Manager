import { afterEach, describe, expect, it, vi } from "vitest";
import { cambodiaDate, dayPeriod, monthFromParam, monthParam, monthPeriod, shiftMonth, trailingMonths } from "./period";

afterEach(() => vi.unstubAllEnvs());

describe.each(["UTC", "Asia/Phnom_Penh", "America/Los_Angeles"])("Cambodia calendar on a %s host", (timezone) => {
  it("changes month at Cambodia midnight, seven hours before UTC midnight", () => {
    vi.stubEnv("TZ", timezone);
    expect(monthParam(monthPeriod(new Date("2026-09-30T16:59:59.999Z")))).toBe("2026-09");
    const period = monthPeriod(new Date("2026-09-30T17:00:00.000Z"));
    expect(monthParam(period)).toBe("2026-10");
    expect(period.label).toBe("October 2026");
    expect(period.from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-10-31T16:59:59.999Z");
  });

  it("makes day boundaries and form defaults agree during Cambodia's early morning", () => {
    vi.stubEnv("TZ", timezone);
    const instant = new Date("2026-12-31T18:00:00.000Z");
    expect(cambodiaDate(instant)).toBe("2027-01-01");
    const day = dayPeriod(instant);
    expect(day.from.toISOString()).toBe("2026-12-31T17:00:00.000Z");
    expect(day.to.toISOString()).toBe("2027-01-01T16:59:59.999Z");
  });

  it("round-trips historical month URLs across year boundaries", () => {
    vi.stubEnv("TZ", timezone);
    const january = monthFromParam("2026-01");
    expect(monthParam(january)).toBe("2026-01");
    expect(january.from.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(monthParam(shiftMonth(january, -1))).toBe("2025-12");
    expect(monthParam(shiftMonth(january, 12))).toBe("2027-01");
  });

  it("keeps a leap day's final millisecond inside February", () => {
    vi.stubEnv("TZ", timezone);
    const february = monthFromParam("2028-02");
    expect(february.to.toISOString()).toBe("2028-02-29T16:59:59.999Z");
    expect(monthParam(monthPeriod(new Date(february.to.getTime() + 1)))).toBe("2028-03");
  });

  it("includes twelve whole Cambodia months without depending on host DST", () => {
    vi.stubEnv("TZ", timezone);
    const window = trailingMonths(12, new Date("2026-09-30T18:00:00.000Z"));
    expect(window.from.toISOString()).toBe("2025-10-31T17:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-10-31T16:59:59.999Z");
  });
});

it("invalid month parameters use the current Cambodia month", () => {
  const now = new Date("2026-09-30T18:00:00.000Z");
  for (const raw of [undefined, "2026-00", "2026-13", "2026-1", "bad", "0000-01"]) {
    expect(monthParam(monthFromParam(raw, now))).toBe("2026-10");
  }
});

it("does not remap a historical year below 100 into the 1900s", () => {
  const period = monthFromParam("0099-02");
  expect(period.from.toISOString()).toBe("0099-01-31T17:00:00.000Z");
  expect(monthParam(period)).toBe("0099-02");
});

it("rejects invalid window lengths and fractional month offsets", () => {
  expect(() => trailingMonths(0)).toThrow(RangeError);
  expect(() => trailingMonths(1.5)).toThrow(RangeError);
  expect(() => shiftMonth(monthFromParam("2026-01"), 0.5)).toThrow(RangeError);
});
