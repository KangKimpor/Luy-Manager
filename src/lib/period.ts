/**
 * Reporting windows.
 *
 * All local-time, never UTC. Cambodia is UTC+7, so deriving a month boundary from
 * `toISOString()` would put the first seven hours of every month in the previous
 * one — a coffee bought at 8am on the 1st would land in last month's total. The
 * same reason `toIsoDate` in the domain layer avoids `toISOString`.
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

/** Midnight at the start of a month. */
function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1, 0, 0, 0, 0);
}

/** The last representable instant of a month, so `<=` comparisons include it. */
function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

export function monthPeriod(date: Date = new Date()): Period {
  const year = date.getFullYear();
  const month = date.getMonth();

  return {
    from: startOfMonth(year, month),
    to: endOfMonth(year, month),
    label: `${MONTHS[month]} ${year}`,
  };
}

/** Shift a month window by `offset` months; -1 is the previous month. */
export function shiftMonth(period: Period, offset: number): Period {
  return monthPeriod(new Date(period.from.getFullYear(), period.from.getMonth() + offset, 1));
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
  if (month < 1 || month > 12) return monthPeriod(now);

  return monthPeriod(new Date(year, month - 1, 1));
}

/** The `?month=` value for a period, for building links. */
export function monthParam(period: Period): string {
  return `${period.from.getFullYear()}-${String(period.from.getMonth() + 1).padStart(2, "0")}`;
}

/** A window covering the last `months` whole months including the current one. */
export function trailingMonths(months: number, now: Date = new Date()): Period {
  const start = startOfMonth(now.getFullYear(), now.getMonth() - (months - 1));
  const current = monthPeriod(now);

  return { from: start, to: current.to, label: `Last ${months} months` };
}
