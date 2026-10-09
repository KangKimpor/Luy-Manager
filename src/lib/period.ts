/**
 * Reporting windows.
 *
 * Cambodia's calendar is UTC+7. Use it explicitly, because a deployment's host
 * clock is often UTC while Safari uses the device zone. Boundary instants stay
 * UTC for database queries, but labels and form dates use the Cambodia calendar.
 */

export interface Period {
  from: Date;
  to: Date;
  label: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const CAMBODIA_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Calendar fields, independent of the browser or server's own time zone. */
export function cambodiaDateParts(date: Date) {
  const calendar = new Date(date.getTime() + CAMBODIA_OFFSET_MS);
  return { year: calendar.getUTCFullYear(), month: calendar.getUTCMonth(), day: calendar.getUTCDate() };
}

/** Month is zero-based, like Date's constructor; overflow normalises the month. */
export function cambodiaMidnight(year: number, month: number, day: number): Date {
  const calendar = new Date(0);
  // setUTCFullYear avoids Date.UTC's surprising 1900 offset for years 0 to 99.
  calendar.setUTCFullYear(year, month, day);
  calendar.setUTCHours(0, 0, 0, 0);
  return new Date(calendar.getTime() - CAMBODIA_OFFSET_MS);
}

/** YYYY-MM-DD for date inputs and defaults, including the first seven hours. */
export function cambodiaDate(date: Date = new Date()): string {
  const { year, month, day } = cambodiaDateParts(date);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Inclusive daily window, suitable for the same database filters as a month. */
export function dayPeriod(date: Date = new Date()): Period {
  const { year, month, day } = cambodiaDateParts(date);
  return {
    from: cambodiaMidnight(year, month, day),
    to: new Date(cambodiaMidnight(year, month, day + 1).getTime() - 1),
    label: cambodiaDate(date),
  };
}

/** Midnight at the start of a month. */
function startOfMonth(year: number, month: number): Date {
  return cambodiaMidnight(year, month, 1);
}

/** The last representable instant of a month, so `<=` comparisons include it. */
function endOfMonth(year: number, month: number): Date {
  return new Date(cambodiaMidnight(year, month + 1, 1).getTime() - 1);
}

export function monthPeriod(date: Date = new Date()): Period {
  const { year, month } = cambodiaDateParts(date);

  return {
    from: startOfMonth(year, month),
    to: endOfMonth(year, month),
    label: `${MONTHS[month]} ${year}`,
  };
}

/** Shift a month window by `offset` months; -1 is the previous month. */
export function shiftMonth(period: Period, offset: number): Period {
  if (!Number.isInteger(offset)) throw new RangeError("Month offset must be an integer.");
  const { year, month } = cambodiaDateParts(period.from);
  return monthPeriod(startOfMonth(year, month + offset));
}

/**
 * Parse a `?month=YYYY-MM` parameter.
 *
 * Falls back to the current month rather than throwing: a hand-edited URL should
 * show something sensible, not an error page.
 */
export function monthFromParam(raw: string | undefined, now: Date = new Date()): Period {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return monthPeriod(now);

  const [year, month] = raw.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return monthPeriod(now);

  return monthPeriod(startOfMonth(year, month - 1));
}

/** The `?month=` value for a period, for building links. */
export function monthParam(period: Period): string {
  return cambodiaDate(period.from).slice(0, 7);
}

/** A window covering the last `months` whole months including the current one. */
export function trailingMonths(months: number, now: Date = new Date()): Period {
  if (!Number.isInteger(months) || months < 1) throw new RangeError("Month count must be a positive integer.");
  const { year, month } = cambodiaDateParts(now);
  const start = startOfMonth(year, month - (months - 1));
  const current = monthPeriod(now);

  return { from: start, to: current.to, label: `Last ${months} months` };
}
