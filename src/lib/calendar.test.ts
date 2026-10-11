import { describe, expect, test } from "vitest";
import { calendarDate, calendarDateTime, calendarDateTimeToInstant, isCalendarDate, shiftCalendarDate, transactionDate } from "./calendar";

describe("transaction calendar", () => {
  test("today follows the profile zone during Cambodia's first seven hours", () => {
    const now = new Date("2026-10-10T19:15:00Z");
    expect(calendarDate(now, "Asia/Phnom_Penh")).toBe("2026-10-11");
    expect(transactionDate("2026-10-11", "Asia/Phnom_Penh", now)).toEqual(now);
    expect(transactionDate("2026-10-10", "Asia/Phnom_Penh", now).toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });
  test("editing preserves the profile's wall time on a UTC host", () => {
    const instant = new Date("2026-10-10T19:15:00Z");
    expect(calendarDateTime(instant, "Asia/Phnom_Penh")).toBe("2026-10-11T02:15");
    expect(calendarDateTimeToInstant("2026-10-11T02:15", "Asia/Phnom_Penh")).toEqual(instant);
  });
  test("uses the offset on the chosen date across daylight saving changes", () => {
    expect(transactionDate("2026-01-11", "America/New_York").toISOString()).toBe("2026-01-11T17:00:00.000Z");
    expect(transactionDate("2026-07-11", "America/New_York").toISOString()).toBe("2026-07-11T16:00:00.000Z");
    expect(() => calendarDateTimeToInstant("2026-03-08T02:30", "America/New_York")).toThrow("does not exist");
  });
  test.each(["2026-02-30", "2026-13-01", "2026-00-01", "2026-04-31", "0000-01-01", "", "2026-1-1"])("refuses the invalid date %s", (date) => {
    expect(isCalendarDate(date)).toBe(false);
    expect(() => transactionDate(date, "Asia/Phnom_Penh")).toThrow();
  });
  test("yesterday crosses month and year boundaries correctly", () => {
    expect(shiftCalendarDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftCalendarDate("2024-03-01", -1)).toBe("2024-02-29");
  });
});
