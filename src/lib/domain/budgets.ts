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
  convert,
  DEFAULT_RATE,
  type CurrencyCode,
  type ExchangeRate,
  money,
  type Money,
  subtract,
} from "@/lib/money";

import { amountInBase } from "./transactions";
import type { Budget, BudgetPeriod, Transaction } from "./types";

export interface DateWindow {
  from: Date;
  /** Exclusive: the instant the next period begins. */
  to: Date;
}

const MS_PER_DAY = 86_400_000;

/** How many months one period spans. Weekly is handled separately. */
const MONTHS_PER_PERIOD: Record<Exclude<BudgetPeriod, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parse a YYYY-MM-DD as a local date, not UTC, so the window does not shift. */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/**
 * Add whole months, clamping the day to the target month's length.
 *
 * A budget anchored on the 31st has no 31st in February. JavaScript's Date would
 * roll that over into March, which would silently shift every later window by a
 * few days. Clamping to the 28th keeps the anchor stable.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getMonth() + months;
  const candidate = new Date(date.getFullYear(), targetMonth, 1);
  const daysInTarget = new Date(
    candidate.getFullYear(),
    candidate.getMonth() + 1,
    0,
  ).getDate();

  return new Date(
    candidate.getFullYear(),
    candidate.getMonth(),
    Math.min(date.getDate(), daysInTarget),
  );
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
  const months =
    (today.getFullYear() - anchor.getFullYear()) * 12 +
    (today.getMonth() - anchor.getMonth());

  return Math.max(0, Math.floor(months / MONTHS_PER_PERIOD[period]));
}

export type BudgetStatus =
  /** Comfortably within the limit. */
  | "under"
  /** Past the alert threshold but not over. */
  | "warning"
  /** Spent more than the limit. */
  | "over";

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
  status: BudgetStatus;
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
  transactions: readonly Transaction[],
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
  transactions: readonly Transaction[],
  rate: ExchangeRate = DEFAULT_RATE,
  now: Date = new Date(),
): BudgetProgress {
  const limit = money(budget.amount, budget.currency);
  const { spent, period } = spentForBudget(budget, transactions, rate, now);

  const fraction = limit.minor === 0 ? 0 : spent.minor / limit.minor;

  const status: BudgetStatus =
    spent.minor > limit.minor
      ? "over"
      : fraction >= budget.alertThreshold
        ? "warning"
        : "under";

  const daysRemaining = Math.max(
    0,
    Math.ceil((period.to.getTime() - startOfDay(now).getTime()) / MS_PER_DAY) - 1,
  );

  return {
    budget,
    limit,
    spent,
    remaining: subtract(limit, spent),
    fraction,
    status,
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
  transactions: readonly Transaction[],
  rate: ExchangeRate = DEFAULT_RATE,
  now: Date = new Date(),
): BudgetProgress[] {
  return budgets
    .filter((budget) => budget.isActive)
    .map((budget) => budgetProgress(budget, transactions, rate, now))
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
