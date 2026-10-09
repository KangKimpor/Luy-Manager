import { describe, expect, test } from "vitest";
import { reportingWindow, validTimezone } from "./reporting";

describe("Telegram reporting days", () => {
  test("Cambodia midnight is the previous UTC evening on a UTC host", () => {
    const window = reportingWindow(new Date("2026-09-30T18:00:00Z"), "today", "Asia/Phnom_Penh");
    expect(window.from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-10-01T17:00:00.000Z");
  });
  test("a new Cambodia month starts seven hours before the UTC month", () => {
    const window = reportingWindow(new Date("2026-09-30T18:00:00Z"), "month", "Asia/Phnom_Penh");
    expect(window.from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });
  test("each boundary resolves its own daylight-saving offset", () => {
    const window = reportingWindow(new Date("2026-03-20T12:00:00Z"), "month", "America/New_York");
    expect(window.from.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });
  test("an invalid saved timezone has a deterministic Cambodia fallback", () => {
    expect(validTimezone("bad-zone")).toBe("Asia/Phnom_Penh");
    expect(() => reportingWindow(new Date(), "today", "bad-zone")).not.toThrow();
  });
});
