/** Calendar input stays in the profile's zone, independently of the device. */
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
    timeZone: validTimezone(timezone), year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const number = (type: string) => Number(values.find((part) => part.type === type)?.value);
  return { year: number("year"), month: number("month"), day: number("day"),
    hour: number("hour"), minute: number("minute"), second: number("second") };
}

export function wallClock(date: Date, timezone: string): Date {
  const p = parts(date, timezone);
  const wall = new Date(0);
  wall.setFullYear(p.year, p.month - 1, p.day);
  wall.setHours(p.hour, p.minute, p.second, 0);
  return wall;
}

export function utcBoundary(wall: Date, timezone: string): Date {
  const target = new Date(0);
  target.setUTCFullYear(wall.getFullYear(), wall.getMonth(), wall.getDate());
  target.setUTCHours(wall.getHours(), wall.getMinutes(), wall.getSeconds(), 0);
  let instant = target.getTime();
  for (let pass = 0; pass < 3; pass += 1) {
    const p = parts(new Date(instant), timezone);
    const actual = new Date(0);
    actual.setUTCFullYear(p.year, p.month - 1, p.day);
    actual.setUTCHours(p.hour, p.minute, p.second, 0);
    const adjustment = target.getTime() - actual.getTime();
    instant += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(instant);
}

const pad = (value: number) => String(value).padStart(2, "0");

export function calendarDate(date: Date = new Date(), timezone = "Asia/Phnom_Penh"): string {
  const p = parts(date, timezone);
  return `${String(p.year).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)}`;
}

export function calendarDateTime(date: Date, timezone = "Asia/Phnom_Penh"): string {
  const p = parts(date, timezone);
  return `${calendarDate(date, timezone)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const test = new Date(0);
  test.setUTCFullYear(year, month - 1, day);
  return year > 0 && test.getUTCFullYear() === year && test.getUTCMonth() === month - 1 && test.getUTCDate() === day;
}

export function shiftCalendarDate(value: string, days: number): string {
  if (!isCalendarDate(value)) throw new Error("Choose a valid date.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day + days);
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Backdated entries use noon, avoiding nonexistent wall times at DST changes. */
export function transactionDate(value: string, timezone: string, now = new Date()): Date {
  if (!isCalendarDate(value)) throw new Error("Choose a valid transaction date.");
  if (value === calendarDate(now, timezone)) return now;
  return calendarDateTimeToInstant(`${value}T12:00`, timezone);
}

export function calendarDateTimeToInstant(value: string, timezone: string): Date {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !isCalendarDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59) {
    throw new Error("Choose a valid date and time.");
  }
  const [year, month, day] = match[1].split("-").map(Number);
  const wall = new Date(0);
  wall.setFullYear(year, month - 1, day);
  wall.setHours(Number(match[2]), Number(match[3]), 0, 0);
  const instant = utcBoundary(wall, timezone);
  if (calendarDateTime(instant, timezone) !== value) throw new Error("That time does not exist in your timezone. Choose another time.");
  return instant;
}
