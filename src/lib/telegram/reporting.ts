import { validTimezone, wallClock, utcBoundary } from "@/lib/calendar";

export { validTimezone, wallClock, utcBoundary } from "@/lib/calendar";

export function reportingWindow(now: Date, window: "today" | "month", timezone: string) {
  const zone = validTimezone(timezone);
  const local = wallClock(now, zone);
  const from = new Date(local.getFullYear(), local.getMonth(), window === "today" ? local.getDate() : 1);
  const to = window === "today"
    ? new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1)
    : new Date(local.getFullYear(), local.getMonth() + 1, 1);
  return { from: utcBoundary(from, zone), to: utcBoundary(to, zone) };
}
