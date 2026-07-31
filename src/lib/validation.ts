/**
 * Input validation for server actions.
 *
 * Server actions are reachable by direct POST, not only through the forms that
 * call them, so every input is parsed rather than trusted. `zod` was already a
 * dependency and unused; this is what it was for.
 *
 * Amounts are validated as major-unit strings — what a person types — and turned
 * into `Money` by the money layer, never by a schema. Keeping the conversion in
 * one place is the whole reason `fromMajor` and `parseAmount` exist, and a
 * `z.coerce.number()` on a money field would quietly reintroduce float parsing.
 */

import { z } from "zod";

import { ACCOUNT_TYPES, BUDGET_PERIODS, TRANSACTION_TYPES } from "@/lib/domain/types";
import { CURRENCIES, type Money, parseAmount } from "@/lib/money";

export const currencySchema = z.enum(CURRENCIES);
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const budgetPeriodSchema = z.enum(BUDGET_PERIODS);

export const uuidSchema = z.string().uuid("That is not a valid id.");

/**
 * A typed amount, as entered.
 *
 * Validated as text and converted with `parseAmount`, which handles the symbols
 * and separators people actually type ("$5.25", "12,000") and rounds half away
 * from zero. A numeric schema here would accept 5.005 and leave the rounding
 * decision to whatever happened to touch it next.
 */
export const amountTextSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .max(24, "That amount is too long to be real.");

/** Parse an entered amount into integer minor units, or fail with a clear message. */
export function parseMoney(
  input: string,
  currency: z.infer<typeof currencySchema>,
): Money {
  try {
    return parseAmount(input, currency);
  } catch {
    throw new Error(`"${input}" is not an amount we can read.`);
  }
}

/** A YYYY-MM-DD date from a date input. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/** An optional free-text field: blank becomes null rather than an empty string. */
export const optionalTextSchema = z
  .string()
  .trim()
  .max(500, "That is too long.")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

export const transactionInputSchema = z.object({
  accountId: uuidSchema,
  type: transactionTypeSchema.refine(
    (type) => type !== "transfer",
    "Use the transfer action for transfers; they need two accounts.",
  ),
  amount: amountTextSchema,
  currency: currencySchema,
  categoryId: uuidSchema.nullable().optional(),
  merchantId: uuidSchema.nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  notes: optionalTextSchema,
  location: optionalTextSchema,
  /**
   * The individual currencies handed over for one payment (PRD Section 7).
   * Optional, and when present it must reconcile to the transaction amount —
   * checked in the action, since that needs the exchange rate.
   */
  tenders: z
    .array(z.object({ amount: amountTextSchema, currency: currencySchema }))
    .max(4, "A single payment does not need more than four tenders.")
    .optional(),
  /** Category split (PRD Section 8). Must sum to the transaction amount. */
  splits: z
    .array(
      z.object({
        categoryId: uuidSchema.nullable(),
        amount: amountTextSchema,
        notes: optionalTextSchema,
      }),
    )
    .max(20, "That is a lot of splits.")
    .optional(),
});

export const transferInputSchema = z.object({
  fromAccountId: uuidSchema,
  toAccountId: uuidSchema,
  amount: amountTextSchema,
  /** What actually landed, when the user knows the bank's real rate. */
  receivedAmount: z.string().trim().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  notes: optionalTextSchema,
});

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name.").max(60),
  institution: optionalTextSchema,
  type: accountTypeSchema,
  currency: currencySchema,
  /** Blank is treated as zero rather than rejected: most accounts start empty. */
  openingBalance: z.string().trim().max(24).optional(),
  icon: optionalTextSchema,
  color: optionalTextSchema,
  includeInNetWorth: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const budgetInputSchema = z.object({
  categoryId: uuidSchema.nullable().optional(),
  name: optionalTextSchema,
  amount: amountTextSchema,
  currency: currencySchema,
  period: budgetPeriodSchema,
  startsOn: isoDateSchema.optional(),
  rollover: z.boolean().optional(),
  alertThreshold: z.number().min(0.01).max(1).optional(),
});

export const manualRateInputSchema = z.object({
  /** KHR per 1 USD, as typed. */
  rate: z
    .string()
    .trim()
    .min(1, "Enter a rate.")
    .max(16, "That rate is too long to be real."),
  asOf: isoDateSchema,
});

/**
 * Turn a validation failure into something a person can act on.
 *
 * zod's default message lists paths, which is right for a developer and unhelpful
 * on a form. The first problem is usually the only one worth reporting.
 */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That input is not valid.";
}
