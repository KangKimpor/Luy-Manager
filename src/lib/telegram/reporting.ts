/** Explicit time zones keep a UTC deployment on the same day as the user. */
export function validTimezone(value: string | null | undefined): string {
  try {
    const timezone = value || "Asia/Phnom_Penh";
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "Asia/Phnom_Penh";
  }
}

function parts(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const number = (type: string) => Number(values.find((part) => part.type === type)?.value);
  return { year: number("year"), month: number("month"), day: number("day"),
    hour: number("hour"), minute: number("minute"), second: number("second") };
}

/** A user's wall-clock date represented in the host's local date system. */
export function wallClock(date: Date, timezone: string): Date {
  const p = parts(date, timezone);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Convert a local calendar boundary back to the user's actual UTC instant. */
export function utcBoundary(wall: Date, timezone: string): Date {
  const target = Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate(),
    wall.getHours(), wall.getMinutes(), wall.getSeconds());
  let instant = target;
  // Resolve the offset at the boundary itself. Using today's offset for the
  // start of a month fails across a daylight-saving transition.
  for (let pass = 0; pass < 3; pass += 1) {
    const p = parts(new Date(instant), timezone);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const adjustment = target - actual;
    instant += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(instant);
}

export function reportingWindow(now: Date, window: "today" | "month", timezone: string) {
  const zone = validTimezone(timezone);
  const local = wallClock(now, zone);
  const from = new Date(local.getFullYear(), local.getMonth(), window === "today" ? local.getDate() : 1);
  const to = window === "today"
    ? new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1)
    : new Date(local.getFullYear(), local.getMonth() + 1, 1);
  return { from: utcBoundary(from, zone), to: utcBoundary(to, zone) };
}
