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
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  includeInNetWorth: boolean;
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
