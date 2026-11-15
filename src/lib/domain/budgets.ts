/**
 * Budget periods and progress.
 *
 * PRD Section 11 puts "Budget Remaining" on the dashboard. Producing that number
 * needs two things the ledger does not state directly: which window a repeating
 * budget is currently in, and how much of it has been spent.
 *
 * The window matters more than it looks. A monthly budget is not "this calendar
 * month": it repeats from whatever day the user set it up, because someone paid on
 * the 15th thinks in 15th-to-14th months. Getting that wrong silently compares
 * spending against the wrong period and reports a number that is simply untrue.
 *
 * Pure, so all of it is testable without a database.
 */

import {
  add,
  convert,
  DEFAULT_RATE,
  type CurrencyCode,
  type ExchangeRate,
  money,
  type Money,
  subtract,
} from "@/lib/money";

import { calendarDate, validTimezone } from "@/lib/calendar";
import { cambodiaDateParts, cambodiaMidnight } from "@/lib/period";
import { amountInBase } from "./transactions";
import type { Budget, BudgetPeriod, LedgerLine } from "./types";

export interface DateWindow {
  from: Date;
  /** Exclusive: the instant the next period begins. */
  to: Date;
}

const MS_PER_DAY = 86_400_000;
/** Tolerance around +/-10pp boundaries so exact tenths don't flip on float representation. */
const PACE_BAND = 0.1;
const PACE_EPSILON = 1e-9;

/** How many months one period spans. Weekly is handled separately. */
const MONTHS_PER_PERIOD: Record<Exclude<BudgetPeriod, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function startOfDay(date: Date): Date {
  const { year, month, day } = cambodiaDateParts(date);
  return cambodiaMidnight(year, month, day);
}

/** A budget date starts at midnight in Cambodia, regardless of deployment zone. */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return cambodiaMidnight(year, (month ?? 1) - 1, day ?? 1);
}

/**
 * Resolve "today" as a calendar-midnight instant aligned with budget windows,
 * using the user's configured timezone from `src/lib/calendar`.
 */
function calendarToday(now: Date, timezone?: string): Date {
  return parseIsoDate(calendarDate(now, validTimezone(timezone)));
}

/**
 * Add whole months, clamping the day to the target month's length.
 *
 * A budget anchored on the 31st has no 31st in February. JavaScript's Date would
 * roll that over into March, which would silently shift every later window by a
 * few days. Clamping to the 28th keeps the anchor stable.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const anchor = cambodiaDateParts(date);
  const candidate = cambodiaDateParts(cambodiaMidnight(anchor.year, anchor.month + months, 1));
  const daysInTarget = cambodiaDateParts(cambodiaMidnight(candidate.year, candidate.month + 1, 0)).day;
  return cambodiaMidnight(candidate.year, candidate.month, Math.min(anchor.day, daysInTarget));
}

function addPeriods(anchor: Date, period: BudgetPeriod, count: number): Date {
  if (period === "weekly") {
    return new Date(anchor.getTime() + count * 7 * MS_PER_DAY);
  }
  return addMonthsClamped(anchor, count * MONTHS_PER_PERIOD[period]);
}

/**
 * The window a repeating budget is in at `now`.
 *
 * Counts elapsed periods from the budget's own start date rather than snapping to
 * a calendar boundary, so a budget set up on the 15th runs 15th to 14th.
 */
export function currentPeriod(
  budget: Pick<Budget, "period" | "startsOn">,
  now: Date = new Date(),
): DateWindow {
  const anchor = startOfDay(parseIsoDate(budget.startsOn));
  const today = startOfDay(now);

  // Before the budget starts, the first window is the relevant one: reporting a
  // window in the past would show spending the budget was never meant to cover.
  if (today < anchor) {
    return { from: anchor, to: addPeriods(anchor, budget.period, 1) };
  }

  let elapsed =
    budget.period === "weekly"
      ? Math.floor((today.getTime() - anchor.getTime()) / (7 * MS_PER_DAY))
      : estimateElapsedMonthPeriods(anchor, today, budget.period);

  // The month estimate can be one out either way because of clamping, so it is
  // corrected by stepping rather than trusted.
  while (addPeriods(anchor, budget.period, elapsed + 1) <= today) elapsed += 1;
  while (elapsed > 0 && addPeriods(anchor, budget.period, elapsed) > today) elapsed -= 1;

  return {
    from: addPeriods(anchor, budget.period, elapsed),
    to: addPeriods(anchor, budget.period, elapsed + 1),
  };
}

function estimateElapsedMonthPeriods(
  anchor: Date,
  today: Date,
  period: Exclude<BudgetPeriod, "weekly">,
): number {
  const first = cambodiaDateParts(anchor);
  const current = cambodiaDateParts(today);
  const months = (current.year - first.year) * 12 + (current.month - first.month);

  return Math.max(0, Math.floor(months / MONTHS_PER_PERIOD[period]));
}

export type BudgetStatus =
  /** Comfortably within the limit. */
  | "under"
  /** Past the alert threshold but not over. */
  | "warning"
  /** Spent more than the limit. */
  | "over";

export type BudgetPaceStatus =
  /** More than 10 percentage points below elapsed share of the period. */
  | "under-pace"
  /** Within 10 percentage points of elapsed share. */
  | "on-pace"
  /** More than 10 percentage points above elapsed share, up to 100%. */
  | "ahead-of-pace"
  /** Spent more than 100% of the limit. */
  | "over";

export interface PeriodPace {
  /** Whole days in this budget window. */
  totalDays: number;
  /** Days elapsed up through today (1-indexed while inside the window, 0 before, totalDays after). */
  elapsedDays: number;
  /** Fraction of period elapsed (`elapsedDays / totalDays`), or `null` outside an active period (past/future). */
  elapsedShare: number | null;
}

/**
 * Whole days in a span of milliseconds.
 *
 * Rounded rather than floored because a window that crosses a daylight saving
 * change is an hour off a whole number of days. Half away from zero, the same
 * rule money uses, so a negative span cannot round toward the window.
 */
function wholeDays(ms: number): number {
  return Math.sign(ms) * Math.round(Math.abs(ms) / MS_PER_DAY);
}

export function periodPace(
  period: DateWindow,
  now: Date = new Date(),
  timezone?: string,
): PeriodPace {
  const totalDays = Math.max(1, wholeDays(period.to.getTime() - period.from.getTime()));
  const today = calendarToday(now, timezone);

  if (today < period.from) {
    return { totalDays, elapsedDays: 0, elapsedShare: null };
  }
  if (today >= period.to) {
    return { totalDays, elapsedDays: totalDays, elapsedShare: null };
  }

  const dayIndex = wholeDays(today.getTime() - period.from.getTime());
  const elapsedDays = Math.min(totalDays, Math.max(1, dayIndex + 1));
  return {
    totalDays,
    elapsedDays,
    elapsedShare: elapsedDays / totalDays,
  };
}

export function computePaceStatus(
  fraction: number,
  elapsedShare: number | null,
  isOver: boolean,
): BudgetPaceStatus {
  if (isOver || fraction > 1 + PACE_EPSILON) return "over";
  if (elapsedShare === null) return "under-pace";
  const diff = fraction - elapsedShare;
  if (diff > PACE_BAND + PACE_EPSILON) return "ahead-of-pace";
  if (diff < -PACE_BAND - PACE_EPSILON) return "under-pace";
  return "on-pace";
}

export interface BudgetProgress {
  budget: Budget;
  /** The limit, in the budget's own currency. */
  limit: Money;
  /** Spending in the current window, reported positive. */
  spent: Money;
  /** Limit minus spent. Negative means overspent. */
  remaining: Money;
  /** Share of the limit used, 0 upward. Can exceed 1. */
  fraction: number;
  /** Bar fill ratio clamped to [0, 1]. */
  fillRatio: number;
  status: BudgetStatus;
  paceStatus: BudgetPaceStatus;
  /** Fraction of the period elapsed (0..1), or `null` for non-active/past windows. */
  elapsedShare: number | null;
  elapsedDays: number;
  totalDays: number;
  period: DateWindow;
  /** Whole days left in the window, 0 on the last day. */
  daysRemaining: number;
}

/**
 * How much of a budget has been spent in its current window.
 *
 * Only outflows count. Including income would let a salary erase a month of
 * spending and report a grocery budget as untouched. Transfers are already
 * excluded by `amountInBase`'s callers, but they are filtered here too because a
 * transfer into a budgeted category would otherwise read as spending.
 */
export function spentForBudget(
  budget: Budget,
  transactions: readonly LedgerLine[],
  rate: ExchangeRate = DEFAULT_RATE,
  now: Date = new Date(),
): { spent: Money; period: DateWindow } {
  const period = currentPeriod(budget, now);
  let minor = 0;

  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;

    const at = new Date(transaction.occurredAt);
    if (at < period.from || at >= period.to) continue;

    // A null categoryId on the budget means an overall cap, which every category
    // contributes to, uncategorised spending included.
    if (budget.categoryId !== null && transaction.categoryId !== budget.categoryId) {
      continue;
    }

    const value = amountInBase(transaction, budget.currency, rate).minor;
    if (value < 0) minor += -value;
  }

  return { spent: money(minor, budget.currency), period };
}

/** Combine a budget with its actual spending. */
export function budgetProgress(
  budget: Budget,
  transactions: readonly LedgerLine[],
  rate: ExchangeRate = DEFAULT_RATE,
  now: Date = new Date(),
  timezone?: string,
): BudgetProgress {
  const limit = money(budget.amount, budget.currency);
  const { spent, period } = spentForBudget(budget, transactions, rate, now);

  const fraction = limit.minor === 0 ? 0 : spent.minor / limit.minor;
  const fillRatio = Math.min(1, Math.max(0, fraction));

  const status: BudgetStatus =
    spent.minor > limit.minor
      ? "over"
      : fraction >= budget.alertThreshold
        ? "warning"
        : "under";

  const pace = periodPace(period, now, timezone);
  const paceStatus = computePaceStatus(fraction, pace.elapsedShare, spent.minor > limit.minor);

  const todayForRemaining = timezone ? calendarToday(now, timezone) : startOfDay(now);
  const daysRemaining = Math.max(
    0,
    Math.ceil((period.to.getTime() - todayForRemaining.getTime()) / MS_PER_DAY) - 1,
  );

  return {
    budget,
    limit,
    spent,
    remaining: subtract(limit, spent),
    fraction,
    fillRatio,
    status,
    paceStatus,
    elapsedShare: pace.elapsedShare,
    elapsedDays: pace.elapsedDays,
    totalDays: pace.totalDays,
    period,
    daysRemaining,
  };
}

/**
 * Every active budget with its progress, worst first.
 *
 * Ordered by how much of the limit is used rather than by name, because the
 * budget that needs attention is the one nearest to being blown.
 */
export function summarizeBudgets(
  budgets: readonly Budget[],
  transactions: readonly LedgerLine[],
  rate: ExchangeRate = DEFAULT_RATE,
  now: Date = new Date(),
  timezone?: string,
): BudgetProgress[] {
  return budgets
    .filter((budget) => budget.isActive)
    .map((budget) => budgetProgress(budget, transactions, rate, now, timezone))
    .sort((a, b) => b.fraction - a.fraction);
}

/**
 * What is left across every category budget, in one currency.
 *
 * This is the dashboard's "Budget Remaining" card. Overall caps are excluded so
 * the figure is not double-counted: an overall budget covers the same spending its
 * category budgets already account for.
 */
export function totalRemaining(
  progress: readonly BudgetProgress[],
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): Money {
  return progress
    .filter((entry) => entry.budget.categoryId !== null)
    .reduce(
      (acc, entry) => money(acc.minor + convert(entry.remaining, base, rate).minor, base),
      money(0, base),
    );
}

export interface BudgetsOverview {
  totalSpent: Money;
  totalLimit: Money;
  ratio: number;
  fillRatio: number;
  percent: number;
  paceStatus: BudgetPaceStatus;
  elapsedShare: number | null;
  elapsedDays: number;
  totalDays: number;
  verdict: string;
}

/** Overall summary across category budgets (or overall caps if no category budgets exist). */
export function summarizeBudgetsOverview(
  progress: readonly BudgetProgress[],
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): BudgetsOverview {
  const categoryEntries = progress.filter((entry) => entry.budget.categoryId !== null);
  const scope = categoryEntries.length > 0 ? categoryEntries : progress;

  let totalSpent = money(0, base);
  let totalLimit = money(0, base);
  for (const entry of scope) {
    totalSpent = add(totalSpent, convert(entry.spent, base, rate));
    totalLimit = add(totalLimit, convert(entry.limit, base, rate));
  }

  const ratio = totalLimit.minor === 0 ? 0 : totalSpent.minor / totalLimit.minor;
  const fillRatio = Math.min(1, Math.max(0, ratio));
  const percent = Math.round(ratio * 100);

  // Representative active period for calendar pace on the ring.
  const activeWithPace = scope.find((entry) => entry.elapsedShare !== null) ?? scope[0];
  const elapsedShare = activeWithPace?.elapsedShare ?? null;
  const elapsedDays = activeWithPace?.elapsedDays ?? 0;
  const totalDays = activeWithPace?.totalDays ?? 30;
  const paceStatus = computePaceStatus(ratio, elapsedShare, totalSpent.minor > totalLimit.minor);

  let verdict: string;
  if (paceStatus === "over") {
    verdict = "Spending has passed your budgeted total.";
  } else if (paceStatus === "ahead-of-pace") {
    verdict = "Your spending is slightly ahead of the calendar.";
  } else if (paceStatus === "on-pace") {
    verdict = "Your spending is right on pace with the calendar.";
  } else {
    verdict = "You are comfortably under pace for this period.";
  }

  return {
    totalSpent,
    totalLimit,
    ratio,
    fillRatio,
    percent,
    paceStatus,
    elapsedShare,
    elapsedDays,
    totalDays,
    verdict,
  };
}
