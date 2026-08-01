/**
 * The snake_case to camelCase boundary.
 *
 * `domain/types.ts` states the convention (snake_case in SQL, camelCase in
 * TypeScript, converted once at the data-access edge), and this is where it
 * actually happens. Everything above this file handles camelCase domain objects
 * and never sees a database row.
 *
 * Written as explicit per-table functions rather than a generic key-rewriting
 * helper on purpose. A generic converter cannot tell that `numeric` arrives as a
 * string, that a `bigint` money column must stay an integer, or that an unknown
 * enum value should be rejected rather than passed through as a plain string. All
 * three of those are how a money bug gets in, so each conversion is stated.
 *
 * Pure functions with no IO, so they are unit-testable without a database.
 */

import { type CurrencyCode, isCurrencyCode } from "@/lib/money";

import {
  ACCOUNT_TYPES,
  type Account,
  type AccountBalance,
  type AccountType,
  BUDGET_PERIODS,
  type Budget,
  type BudgetPeriod,
  type Category,
  type Merchant,
  NOTIFICATION_KINDS,
  type Notification,
  type NotificationKind,
  type Profile,
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
  type RecurringTransaction,
  type SavingsGoal,
  type Settings,
  type Tag,
  TRANSACTION_TYPES,
  type Transaction,
  type TransactionSplit,
  type TransactionTender,
  type TransactionType,
} from "@/lib/domain/types";

export class RowMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowMappingError";
  }
}

/** A row straight from PostgREST: unknown shape until checked. */
export type Row = Record<string, unknown>;

// -----------------------------------------------------------------------------
// Primitive readers.
//
// Each rejects rather than coerces. A silently coerced value is how a NULL turns
// into 0 and a missing amount turns into a balance that looks plausible.
// -----------------------------------------------------------------------------

function str(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new RowMappingError(`Expected ${key} to be a string, got ${typeof value}.`);
  }
  return value;
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new RowMappingError(`Expected ${key} to be a string or null.`);
  }
  return value;
}

function bool(row: Row, key: string, fallback?: boolean): boolean {
  const value = row[key];
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) {
    if (fallback !== undefined) return fallback;
  }
  throw new RowMappingError(`Expected ${key} to be a boolean.`);
}

/**
 * A money amount, in integer minor units.
 *
 * BIGINT can exceed the JavaScript safe-integer range, and PostgREST may send it
 * as either a number or a string depending on magnitude. Both are accepted, and
 * anything that is not an exact integer is refused: rounding here would be a
 * silent change to a stored amount.
 */
function minorUnits(row: Row, key: string): number {
  const value = row[key];

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed)) {
    throw new RowMappingError(
      `Expected ${key} to be an integer count of minor units, got ${String(value)}.`,
    );
  }
  if (!Number.isSafeInteger(parsed)) {
    throw new RowMappingError(`Amount ${key} exceeds the safe integer range.`);
  }
  return parsed;
}

/**
 * A `numeric` column, which PostgREST sends as a string to preserve precision.
 *
 * Only ever used for rates and fractions, never for a money amount.
 */
function decimal(row: Row, key: string): number {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new RowMappingError(`Expected ${key} to be a finite number, got ${String(value)}.`);
  }
  return parsed;
}

function nullableDecimal(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return decimal(row, key);
}

function int(row: Row, key: string, fallback?: number): number {
  const value = row[key];
  if (value === null || value === undefined) {
    if (fallback !== undefined) return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new RowMappingError(`Expected ${key} to be an integer, got ${String(value)}.`);
  }
  return parsed;
}

function currency(row: Row, key: string): CurrencyCode {
  const value = row[key];
  if (typeof value !== "string" || !isCurrencyCode(value)) {
    throw new RowMappingError(`Unsupported currency in ${key}: ${String(value)}.`);
  }
  return value;
}

function nullableCurrency(row: Row, key: string): CurrencyCode | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return currency(row, key);
}

/** Read a Postgres enum, refusing a value the TypeScript union does not cover. */
function enumValue<T extends string>(
  row: Row,
  key: string,
  allowed: readonly T[],
): T {
  const value = row[key];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new RowMappingError(
      `Unexpected ${key}: ${String(value)}. Expected one of ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

// -----------------------------------------------------------------------------
// Table mappers.
// -----------------------------------------------------------------------------

export function toProfile(row: Row): Profile {
  return {
    id: str(row, "id"),
    displayName: nullableStr(row, "display_name"),
    baseCurrency: currency(row, "base_currency"),
    locale: str(row, "locale"),
    timezone: str(row, "timezone"),
    telegramChatId:
      row.telegram_chat_id === null || row.telegram_chat_id === undefined
        ? null
        : int(row, "telegram_chat_id"),
  };
}

export function toAccount(row: Row): Account {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    name: str(row, "name"),
    institution: nullableStr(row, "institution"),
    type: enumValue<AccountType>(row, "type", ACCOUNT_TYPES),
    currency: currency(row, "currency"),
    openingBalance: minorUnits(row, "opening_balance"),
    icon: nullableStr(row, "icon"),
    color: nullableStr(row, "color"),
    isActive: bool(row, "is_active"),
    includeInNetWorth: bool(row, "include_in_net_worth"),
    sortOrder: int(row, "sort_order", 0),
  };
}

/** A row from the `account_balances` view. */
export function toAccountBalance(row: Row): AccountBalance {
  return {
    accountId: str(row, "account_id"),
    userId: str(row, "user_id"),
    name: str(row, "name"),
    institution: nullableStr(row, "institution"),
    type: enumValue<AccountType>(row, "type", ACCOUNT_TYPES),
    currency: currency(row, "currency"),
    icon: nullableStr(row, "icon"),
    color: nullableStr(row, "color"),
    isActive: bool(row, "is_active"),
    includeInNetWorth: bool(row, "include_in_net_worth"),
    sortOrder: int(row, "sort_order", 0),
    countsTowardNetWorth: bool(row, "counts_toward_net_worth"),
    currentBalance: minorUnits(row, "current_balance"),
    // count() comes back as a number, but through PostgREST a bigint count can be
    // a string, so it goes through the same integer check.
    transactionCount: int(row, "transaction_count", 0),
    lastActivityAt: nullableStr(row, "last_activity_at"),
  };
}

export function toCategory(row: Row): Category {
  const appliesTo = row.applies_to;
  if (!Array.isArray(appliesTo)) {
    throw new RowMappingError("Expected applies_to to be an array.");
  }

  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    parentId: nullableStr(row, "parent_id"),
    name: str(row, "name"),
    icon: nullableStr(row, "icon"),
    color: nullableStr(row, "color"),
    // A Postgres text[] of transaction_type. Each element is checked against the
    // union rather than cast, so an enum value added in SQL but not in TypeScript
    // fails here instead of flowing on as an unhandled string.
    appliesTo: appliesTo.map((value) =>
      enumValue<TransactionType>({ value }, "value", TRANSACTION_TYPES),
    ),
    isSystem: bool(row, "is_system", false),
    sortOrder: int(row, "sort_order", 0),
  };
}

export function toMerchant(row: Row): Merchant {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    name: str(row, "name"),
    normalizedName: str(row, "normalized_name"),
    defaultCategoryId: nullableStr(row, "default_category_id"),
    logoUrl: nullableStr(row, "logo_url"),
  };
}

export function toTransaction(row: Row): Transaction {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    accountId: str(row, "account_id"),
    categoryId: nullableStr(row, "category_id"),
    merchantId: nullableStr(row, "merchant_id"),
    type: enumValue<TransactionType>(row, "type", TRANSACTION_TYPES),
    amount: minorUnits(row, "amount"),
    currency: currency(row, "currency"),
    // numeric(18,8): a string from PostgREST, and a rate, not an amount.
    exchangeRate: nullableDecimal(row, "exchange_rate"),
    baseAmount:
      row.base_amount === null || row.base_amount === undefined
        ? null
        : minorUnits(row, "base_amount"),
    baseCurrency: nullableCurrency(row, "base_currency"),
    occurredAt: str(row, "occurred_at"),
    notes: nullableStr(row, "notes"),
    location: nullableStr(row, "location"),
    transferGroupId: nullableStr(row, "transfer_group_id"),
    createdVia: str(row, "created_via"),
    isPending: bool(row, "is_pending", false),
  };
}

export function toTransactionTender(row: Row): TransactionTender {
  return {
    id: str(row, "id"),
    transactionId: str(row, "transaction_id"),
    accountId: nullableStr(row, "account_id"),
    amount: minorUnits(row, "amount"),
    currency: currency(row, "currency"),
    exchangeRate: nullableDecimal(row, "exchange_rate"),
  };
}

export function toTransactionSplit(row: Row): TransactionSplit {
  return {
    id: str(row, "id"),
    transactionId: str(row, "transaction_id"),
    categoryId: nullableStr(row, "category_id"),
    amount: minorUnits(row, "amount"),
    currency: currency(row, "currency"),
    notes: nullableStr(row, "notes"),
  };
}

export function toBudget(row: Row): Budget {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    categoryId: nullableStr(row, "category_id"),
    name: nullableStr(row, "name"),
    amount: minorUnits(row, "amount"),
    currency: currency(row, "currency"),
    period: enumValue<BudgetPeriod>(row, "period", BUDGET_PERIODS),
    startsOn: str(row, "starts_on"),
    endsOn: nullableStr(row, "ends_on"),
    rollover: bool(row, "rollover", false),
    // numeric(4,3), a fraction rather than money.
    alertThreshold: decimal(row, "alert_threshold"),
    isActive: bool(row, "is_active", true),
  };
}

export function toSavingsGoal(row: Row): SavingsGoal {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    name: str(row, "name"),
    targetAmount: minorUnits(row, "target_amount"),
    currency: currency(row, "currency"),
    accountId: nullableStr(row, "account_id"),
    targetDate: nullableStr(row, "target_date"),
    icon: nullableStr(row, "icon"),
    color: nullableStr(row, "color"),
    achievedAt: nullableStr(row, "achieved_at"),
  };
}

export function toRecurringTransaction(row: Row): RecurringTransaction {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    accountId: str(row, "account_id"),
    categoryId: nullableStr(row, "category_id"),
    merchantId: nullableStr(row, "merchant_id"),
    type: enumValue<TransactionType>(row, "type", TRANSACTION_TYPES),
    amount: minorUnits(row, "amount"),
    currency: currency(row, "currency"),
    notes: nullableStr(row, "notes"),
    frequency: enumValue<RecurrenceFrequency>(row, "frequency", RECURRENCE_FREQUENCIES),
    intervalCount: int(row, "interval_count", 1),
    startsOn: str(row, "starts_on"),
    endsOn: nullableStr(row, "ends_on"),
    nextOccurrenceOn: str(row, "next_occurrence_on"),
    lastGeneratedOn: nullableStr(row, "last_generated_on"),
    isActive: bool(row, "is_active", true),
  };
}

export function toTag(row: Row): Tag {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    name: str(row, "name"),
    normalizedName: str(row, "normalized_name"),
    color: nullableStr(row, "color"),
  };
}

export function toSettings(row: Row): Settings {
  return {
    userId: str(row, "user_id"),
    defaultAccountId: nullableStr(row, "default_account_id"),
    weekStartsOn: int(row, "week_starts_on", 1),
    notifyBudgetThreshold: bool(row, "notify_budget_threshold", true),
    notifyLargeTransaction: bool(row, "notify_large_transaction", true),
    notifyRateMoved: bool(row, "notify_rate_moved", false),
    largeTransactionAmount: minorUnits(row, "large_transaction_amount"),
    largeTransactionCurrency: currency(row, "large_transaction_currency"),
    rateMoveThreshold: decimal(row, "rate_move_threshold"),
  };
}

export function toNotification(row: Row): Notification {
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    kind: enumValue<NotificationKind>(row, "kind", NOTIFICATION_KINDS),
    title: str(row, "title"),
    body: nullableStr(row, "body"),
    entityType: nullableStr(row, "entity_type"),
    entityId: nullableStr(row, "entity_id"),
    readAt: nullableStr(row, "read_at"),
    createdAt: str(row, "created_at"),
  };
}

/**
 * Map a list, dropping rows that cannot be mapped.
 *
 * One malformed row must not blank an entire dashboard, but it must not pass
 * silently either: a dropped row is logged so the cause is findable rather than
 * showing up later as a total that does not add up.
 */
export function mapRows<T>(
  rows: readonly Row[] | null | undefined,
  map: (row: Row) => T,
  context: string,
): T[] {
  if (!rows) return [];

  const mapped: T[] = [];
  for (const row of rows) {
    try {
      mapped.push(map(row));
    } catch (error) {
      console.error(
        `${context}: skipped an unmappable row:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return mapped;
}
