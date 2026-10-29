import { cambodiaDate, cambodiaDateParts, cambodiaMidnight, monthParam, type Period } from "@/lib/period";
import type { CurrencyCode, ExchangeRate } from "@/lib/money";
import type { Transaction } from "./types";
import { EMPTY_CASH_FLOW, summarizeCashFlow } from "./transactions";

export interface ActivityFilter { account?: string; category?: string; type?: string; q?: string }

const CAMBODIA_WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "Asia/Phnom_Penh",
});

const CAMBODIA_DAY_LABEL_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Phnom_Penh",
});

export function filterActivity(transactions: readonly Transaction[], filter: ActivityFilter): Transaction[] {
  const search = filter.q?.trim().toLowerCase();
  return transactions.filter(transaction => {
    if (filter.account && transaction.accountId !== filter.account) return false;
    if (filter.category && transaction.categoryId !== (filter.category === "none" ? null : filter.category)) return false;
    // Report links follow signed cash flow, including refunds and adjustments.
    if (filter.type === "income" && (transaction.type === "transfer" || transaction.amount <= 0)) return false;
    if (filter.type === "expense" && (transaction.type === "transfer" || transaction.amount >= 0)) return false;
    if (filter.type && !["income", "expense"].includes(filter.type) && transaction.type !== filter.type) return false;
    return !search || (transaction.notes ?? "").toLowerCase().includes(search);
  });
}

export function activityDays(transactions: readonly Transaction[], base: CurrencyCode, rate: ExchangeRate) {
  const buckets = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const date = cambodiaDate(new Date(transaction.occurredAt));
    const bucket = buckets.get(date) ?? [];
    bucket.push(transaction); buckets.set(date, bucket);
  }
  return [...buckets].sort(([a], [b]) => b.localeCompare(a)).map(([date, rows]) => {
    rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
    const at = new Date(rows[0].occurredAt);
    return {
      date, transactions: rows, flow: summarizeCashFlow(rows, base, rate), day: cambodiaDateParts(at).day,
      weekday: CAMBODIA_WEEKDAY_FORMAT.format(at),
      label: CAMBODIA_DAY_LABEL_FORMAT.format(at),
    };
  });
}
export type ActivityDay = ReturnType<typeof activityDays>[number];

export function weekStart(value?: number): number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 6 ? value : 1;
}

export function weekdayLabels(start: number) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }, (_, index) => labels[(weekStart(start) + index) % 7]);
}

export function activityCalendar(period: Period, days: readonly ActivityDay[], base: CurrencyCode, startsOn = 1, now = new Date()) {
  const { year, month } = cambodiaDateParts(period.from);
  const calendar = new Date(0); calendar.setUTCFullYear(year, month, 1);
  const leading = (calendar.getUTCDay() - weekStart(startsOn) + 7) % 7;
  const length = cambodiaDateParts(period.to).day;
  const byDate = new Map(days.map(day => [day.date, day]));
  return Array.from({ length: Math.ceil((leading + length) / 7) * 7 }, (_, index) => {
    const at = cambodiaMidnight(year, month, index - leading + 1);
    const date = cambodiaDate(at);
    const group = byDate.get(date);
    return {
      date, day: cambodiaDateParts(at).day, inMonth: date.startsWith(monthParam(period)),
      today: date === cambodiaDate(now), count: group?.transactions.length ?? 0,
      flow: group?.flow ?? EMPTY_CASH_FLOW(base),
    };
  });
}
