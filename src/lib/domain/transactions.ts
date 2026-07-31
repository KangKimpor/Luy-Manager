/**
 * Transaction construction and aggregation.
 *
 * PRD Section 8. The sign convention is enforced here, in one place: outflows
 * are negative and inflows positive, so summing any slice of the ledger gives
 * the right answer without inspecting `type`. The database mirrors this with
 * check constraints, but doing it here means the UI never has to think about it.
 */

import {
  absolute,
  convert,
  DEFAULT_RATE,
  effectiveRate,
  type CurrencyCode,
  type ExchangeRate,
  money,
  type Money,
  negate,
  zero,
} from "@/lib/money";

import type { Transaction, TransactionType } from "./types";

/** Types that move money out of an account. */
const OUTFLOW_TYPES: readonly TransactionType[] = ["expense"];
/** Types that move money in. */
const INFLOW_TYPES: readonly TransactionType[] = ["income", "refund"];

/**
 * Apply the sign convention to a user-entered magnitude.
 *
 * People type "5" for a $5 coffee, not "-5". Transfers and adjustments keep the
 * caller's sign because their direction is not implied by the type: an
 * adjustment can correct a balance either way, and a transfer has one leg of
 * each sign.
 */
export function signedAmount(type: TransactionType, amount: Money): Money {
  if (OUTFLOW_TYPES.includes(type)) return negate(absolute(amount));
  if (INFLOW_TYPES.includes(type)) return absolute(amount);
  return amount;
}

export interface TransactionDraft {
  accountId: string;
  type: TransactionType;
  /** Magnitude as entered; the sign is applied by `signedAmount`. */
  amount: Money;
  categoryId?: string | null;
  merchantId?: string | null;
  occurredAt?: Date;
  notes?: string | null;
  location?: string | null;
  createdVia?: string;
  /** Extra currencies used in a mixed-currency payment (PRD Section 7). */
  tenders?: readonly Money[];
}

export interface TransactionInsert {
  account_id: string;
  category_id: string | null;
  merchant_id: string | null;
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  exchange_rate: number | null;
  base_amount: number | null;
  base_currency: CurrencyCode | null;
  occurred_at: string;
  notes: string | null;
  location: string | null;
  transfer_group_id: string | null;
  created_via: string;
}

/**
 * Turn a draft into a database row.
 *
 * Stores the rate applied and the base-currency equivalent alongside the native
 * amount. Recomputing them at read time would make last month's report change
 * whenever the rate moves, which is exactly what PRD Section 7's historical
 * rate requirement exists to prevent.
 */
export function buildTransaction(
  draft: TransactionDraft,
  baseCurrency: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): TransactionInsert {
  const signed = signedAmount(draft.type, draft.amount);
  const needsConversion = signed.currency !== baseCurrency;

  return {
    account_id: draft.accountId,
    category_id: draft.categoryId ?? null,
    merchant_id: draft.merchantId ?? null,
    type: draft.type,
    amount: signed.minor,
    currency: signed.currency,
    exchange_rate: needsConversion ? effectiveRate(signed.currency, baseCurrency, rate) : null,
    base_amount: needsConversion ? convert(signed, baseCurrency, rate).minor : null,
    base_currency: needsConversion ? baseCurrency : null,
    occurred_at: (draft.occurredAt ?? new Date()).toISOString(),
    notes: draft.notes ?? null,
    location: draft.location ?? null,
    transfer_group_id: null,
    created_via: draft.createdVia ?? "web",
  };
}

export interface TransferDraft {
  fromAccountId: string;
  toAccountId: string;
  /** Amount leaving the source account, in the source account's currency. */
  amount: Money;
  /**
   * Amount arriving in the destination account. Omit when both accounts share a
   * currency, or to let the exchange rate decide.
   */
  receivedAmount?: Money;
  occurredAt?: Date;
  notes?: string | null;
  createdVia?: string;
}

/**
 * Build the two legs of a transfer.
 *
 * "Transfer $100 ABA to Wing" (PRD Section 9) cannot be one row: money leaves a
 * USD account and may arrive in a KHR one, so the two sides differ in amount and
 * currency. Two rows sharing a `transfer_group_id` keep both account balances
 * correct while still being recognisable as one action.
 *
 * `receivedAmount` exists because the rate a bank actually applied is rarely the
 * rate in the table. When the user knows what landed, that figure wins.
 */
export function buildTransfer(
  draft: TransferDraft,
  transferGroupId: string,
  baseCurrency: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): [TransactionInsert, TransactionInsert] {
  if (draft.fromAccountId === draft.toAccountId) {
    throw new Error("A transfer needs two different accounts.");
  }

  const sent = absolute(draft.amount);
  const received = draft.receivedAmount
    ? absolute(draft.receivedAmount)
    : sent;

  const occurredAt = draft.occurredAt ?? new Date();

  const leg = (accountId: string, amount: Money): TransactionInsert => {
    const needsConversion = amount.currency !== baseCurrency;
    return {
      account_id: accountId,
      category_id: null,
      merchant_id: null,
      type: "transfer",
      amount: amount.minor,
      currency: amount.currency,
      exchange_rate: needsConversion
        ? effectiveRate(amount.currency, baseCurrency, rate)
        : null,
      base_amount: needsConversion ? convert(amount, baseCurrency, rate).minor : null,
      base_currency: needsConversion ? baseCurrency : null,
      occurred_at: occurredAt.toISOString(),
      notes: draft.notes ?? null,
      location: null,
      transfer_group_id: transferGroupId,
      created_via: draft.createdVia ?? "web",
    };
  };

  return [leg(draft.fromAccountId, negate(sent)), leg(draft.toAccountId, received)];
}

/** A transaction amount expressed in the reporting currency. */
export function amountInBase(
  transaction: Pick<Transaction, "amount" | "currency" | "baseAmount" | "baseCurrency">,
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): Money {
  // Prefer the figure stored at entry time; it is what the user saw.
  if (transaction.baseAmount !== null && transaction.baseCurrency === base) {
    return money(transaction.baseAmount, base);
  }
  return convert(money(transaction.amount, transaction.currency), base, rate);
}

export interface CashFlowSummary {
  income: Money;
  /** Reported positive, as an amount spent. */
  expense: Money;
  /** Income minus expense; negative means overspending. */
  net: Money;
}

/**
 * Income and expense over a set of transactions, in one currency.
 *
 * Transfers are excluded. Both legs net to roughly zero anyway, but counting
 * them would inflate income and expense with money that never entered or left
 * the user's control, making the dashboard cards in PRD Section 11 misleading.
 */
export function summarizeCashFlow(
  transactions: readonly Transaction[],
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): CashFlowSummary {
  let incomeMinor = 0;
  let expenseMinor = 0;

  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;

    const value = amountInBase(transaction, base, rate).minor;
    if (value >= 0) incomeMinor += value;
    else expenseMinor += -value;
  }

  return {
    income: money(incomeMinor, base),
    expense: money(expenseMinor, base),
    net: money(incomeMinor - expenseMinor, base),
  };
}

export interface CategoryTotal {
  categoryId: string | null;
  /** Positive amount spent. */
  total: Money;
  transactionCount: number;
  /** Share of total spending, 0 to 1. */
  share: number;
}

/**
 * Spending grouped by category, for the pie chart in PRD Section 11.
 *
 * Only outflows are counted; mixing income in would make the shares meaningless.
 */
export function spendingByCategory(
  transactions: readonly Transaction[],
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): CategoryTotal[] {
  const buckets = new Map<string | null, { minor: number; count: number }>();
  let totalMinor = 0;

  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;

    const value = amountInBase(transaction, base, rate).minor;
    if (value >= 0) continue;

    const spent = -value;
    const key = transaction.categoryId;
    const bucket = buckets.get(key) ?? { minor: 0, count: 0 };
    bucket.minor += spent;
    bucket.count += 1;
    buckets.set(key, bucket);
    totalMinor += spent;
  }

  return [...buckets.entries()]
    .map(([categoryId, bucket]) => ({
      categoryId,
      total: money(bucket.minor, base),
      transactionCount: bucket.count,
      share: totalMinor === 0 ? 0 : bucket.minor / totalMinor,
    }))
    .sort((a, b) => b.total.minor - a.total.minor);
}

export interface DailyTotal {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  income: Money;
  expense: Money;
  net: Money;
}

/**
 * Day-by-day totals for the cash flow chart, with empty days filled in.
 *
 * Gaps left as missing keys would make a line chart connect across them and
 * imply activity that did not happen.
 */
export function dailyCashFlow(
  transactions: readonly Transaction[],
  from: Date,
  to: Date,
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): DailyTotal[] {
  const buckets = new Map<string, { income: number; expense: number }>();

  for (
    let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    cursor <= to;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    buckets.set(toIsoDate(cursor), { income: 0, expense: 0 });
  }

  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;

    const key = toIsoDate(new Date(transaction.occurredAt));
    const bucket = buckets.get(key);
    if (!bucket) continue;

    const value = amountInBase(transaction, base, rate).minor;
    if (value >= 0) bucket.income += value;
    else bucket.expense += -value;
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      income: money(bucket.income, base),
      expense: money(bucket.expense, base),
      net: money(bucket.income - bucket.expense, base),
    }));
}

/** Local-time ISO date. Using toISOString() here would shift days in UTC+7. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export { toIsoDate };

/** Running net worth over time, for the history chart in PRD Section 11. */
export function netWorthHistory(
  transactions: readonly Transaction[],
  openingBalance: Money,
  from: Date,
  to: Date,
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): Array<{ date: string; value: Money }> {
  const daily = dailyCashFlow(transactions, from, to, base, rate);
  let running = convert(openingBalance, base, rate).minor;

  return daily.map((day) => {
    running += day.net.minor;
    return { date: day.date, value: money(running, base) };
  });
}

export const EMPTY_CASH_FLOW = (base: CurrencyCode): CashFlowSummary => ({
  income: zero(base),
  expense: zero(base),
  net: zero(base),
});
