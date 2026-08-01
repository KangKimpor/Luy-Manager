/**
 * Domain types mirroring supabase/migrations/0001_phase1_core.sql.
 *
 * Amounts arriving from Postgres are BIGINT minor units. They are converted to
 * `Money` at the data-access boundary so nothing above it handles bare numbers.
 */

import type { CurrencyCode } from "@/lib/money";

export const ACCOUNT_TYPES = [
  "bank",
  "ewallet",
  "cash",
  "credit_card",
  "savings",
  "investment",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = [
  "expense",
  "income",
  "transfer",
  "refund",
  "adjustment",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type RateSource = "manual" | "api" | "default";

export interface Profile {
  id: string;
  displayName: string | null;
  baseCurrency: CurrencyCode;
  locale: string;
  timezone: string;
  telegramChatId: number | null;
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  institution: string | null;
  type: AccountType;
  currency: CurrencyCode;
  /** Minor units. */
  openingBalance: number;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  includeInNetWorth: boolean;
  sortOrder: number;
}

/** A row from the `account_balances` view, where the balance is derived. */
export interface AccountBalance {
  accountId: string;
  userId: string;
  name: string;
  institution: string | null;
  type: AccountType;
  currency: CurrencyCode;
  icon: string | null;
  color: string | null;
  /** False once the user closes the account. It keeps its balance and history. */
  isActive: boolean;
  includeInNetWorth: boolean;
  sortOrder: number;
  /**
   * `isActive AND includeInNetWorth`, derived in the view.
   *
   * The two flags answer different questions (closed, versus deliberately
   * excluded), but both must keep an account out of the total. Combining them at
   * the source means a caller cannot include a closed account by checking only
   * whichever flag it remembered.
   */
  countsTowardNetWorth: boolean;
  /** Minor units: opening balance plus every non-deleted transaction. */
  currentBalance: number;
  transactionCount: number;
  lastActivityAt: string | null;
}

export interface Category {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  appliesTo: TransactionType[];
  isSystem: boolean;
  sortOrder: number;
}

export interface Merchant {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  defaultCategoryId: string | null;
  logoUrl: string | null;
}

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  merchantId: string | null;
  type: TransactionType;
  /** Signed minor units: negative for outflows. */
  amount: number;
  currency: CurrencyCode;
  exchangeRate: number | null;
  baseAmount: number | null;
  baseCurrency: CurrencyCode | null;
  occurredAt: string;
  notes: string | null;
  location: string | null;
  transferGroupId: string | null;
  createdVia: string;
  isPending: boolean;
}

/** One currency's worth of a mixed-currency payment. */
export interface TransactionTender {
  id: string;
  transactionId: string;
  accountId: string | null;
  amount: number;
  currency: CurrencyCode;
  exchangeRate: number | null;
}

export interface TransactionSplit {
  id: string;
  transactionId: string;
  categoryId: string | null;
  amount: number;
  currency: CurrencyCode;
  notes: string | null;
}

/**
 * Normalise a merchant name for matching.
 *
 * Mirrors the expression used in the 0002 seed migration so a name normalised in
 * TypeScript collides with the same row the database would have produced.
 */
export function normalizeMerchantName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Tags reuse the merchant normalisation, so casing never splits one tag in two. */
export const normalizeTagName = normalizeMerchantName;

// -----------------------------------------------------------------------------
// Phase 2 tables (migration 0007).
// -----------------------------------------------------------------------------

export const BUDGET_PERIODS = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const NOTIFICATION_KINDS = [
  "budget_threshold",
  "budget_exceeded",
  "large_transaction",
  "rate_moved",
  "recurring_due",
  "goal_reached",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Budget {
  id: string;
  userId: string;
  /** Null means an overall spending cap rather than a per-category one. */
  categoryId: string | null;
  name: string | null;
  /** Minor units. */
  amount: number;
  currency: CurrencyCode;
  period: BudgetPeriod;
  startsOn: string;
  endsOn: string | null;
  rollover: boolean;
  /** Fraction of the limit at which to warn, 0 to 1. */
  alertThreshold: number;
  isActive: boolean;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  name: string;
  /** Minor units. */
  targetAmount: number;
  currency: CurrencyCode;
  /** Progress is read from this account's balance, never stored. */
  accountId: string | null;
  targetDate: string | null;
  icon: string | null;
  color: string | null;
  achievedAt: string | null;
}

export interface RecurringTransaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  merchantId: string | null;
  /** Never `transfer`: a single-account template cannot express one. */
  type: TransactionType;
  /** Magnitude in minor units; the sign is applied when generated. */
  amount: number;
  currency: CurrencyCode;
  notes: string | null;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  startsOn: string;
  endsOn: string | null;
  nextOccurrenceOn: string;
  lastGeneratedOn: string | null;
  isActive: boolean;
}

export interface Tag {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  color: string | null;
}

export interface Attachment {
  id: string;
  userId: string;
  transactionId: string | null;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string | null;
  createdAt: string;
}

export interface Settings {
  userId: string;
  defaultAccountId: string | null;
  /** 0 = Sunday. */
  weekStartsOn: number;
  notifyBudgetThreshold: boolean;
  notifyLargeTransaction: boolean;
  notifyRateMoved: boolean;
  /** Minor units. */
  largeTransactionAmount: number;
  largeTransactionCurrency: CurrencyCode;
  rateMoveThreshold: number;
}

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}
