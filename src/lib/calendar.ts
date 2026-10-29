const DEFAULT_TIMEZONE = "Asia/Phnom_Penh";
const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timezone: string): Intl.DateTimeFormat {
  const existing = PARTS_FORMATTERS.get(timezone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  PARTS_FORMATTERS.set(timezone, formatter);
  return formatter;
}

/** Calendar input stays in the profile's zone, independently of the device. */
export function validTimezone(value: string | null | undefined): string {
  const candidate = value || DEFAULT_TIMEZONE;
  if (PARTS_FORMATTERS.has(candidate)) return candidate;
  try {
    getPartsFormatter(candidate);
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function parts(date: Date, timezone: string) {
  const values = getPartsFormatter(validTimezone(timezone)).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of values) {
    if (part.type === "year") year = Number(part.value);
    else if (part.type === "month") month = Number(part.value);
    else if (part.type === "day") day = Number(part.value);
    else if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "minute") minute = Number(part.value);
    else if (part.type === "second") second = Number(part.value);
  }
  return { year, month, day, hour, minute, second };
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
  return wallTimeToInstant(target, timezone);
}

/** The target holds literal calendar fields in UTC, without device DST adjustment. */
function wallTimeToInstant(target: Date, timezone: string): Date {
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

export function calendarDate(date: Date = new Date(), timezone = DEFAULT_TIMEZONE): string {
  const p = parts(date, timezone);
  return `${String(p.year).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)}`;
}

export function calendarDateTime(date: Date, timezone = DEFAULT_TIMEZONE): string {
  const p = parts(date, timezone);
  return `${String(p.year).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
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
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(Number(match[2]), Number(match[3]), 0, 0);
  const instant = wallTimeToInstant(wall, timezone);
  if (calendarDateTime(instant, timezone) !== value) throw new Error("That time does not exist in your timezone. Choose another time.");
  return instant;
}
