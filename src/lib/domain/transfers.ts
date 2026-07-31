/**
 * Transfer planning.
 *
 * PRD Section 8 lists Transfer as a transaction type, and PRD Section 9 gives
 * the canonical example: "Transfer $100 ABA to Wing". `buildTransfer` in
 * ./transactions.ts already turns a decided transfer into two ledger rows. What
 * was missing is the step before that: deciding what the transfer actually is
 * when the two accounts hold different currencies.
 *
 * This module is the account-aware layer. `buildTransfer` only sees account IDs
 * and currencies, so it cannot tell that a caller forgot to convert. Everything
 * here takes the real accounts, which means the destination currency and the
 * resulting balances are always known and a cross-currency transfer cannot be
 * built by accident.
 *
 * Kept pure and free of IO so the arithmetic is testable without a database.
 */

import {
  absolute,
  convert,
  type CurrencyCode,
  DEFAULT_RATE,
  type ExchangeRate,
  formatMoney,
  isZero,
  minorUnitScale,
  money,
  type Money,
  MoneyError,
  roundToCashStep,
  subtract,
} from "@/lib/money";

import { buildTransfer, type TransactionInsert } from "./transactions";
import type { AccountBalance } from "./types";

/**
 * The account fields a transfer needs.
 *
 * A `Pick` of `AccountBalance` rather than a fresh interface, so a row straight
 * from the `account_balances` view satisfies it with no mapping, while a test
 * can supply the five fields that matter.
 */
export type TransferAccount = Pick<
  AccountBalance,
  "accountId" | "name" | "type" | "currency" | "currentBalance"
>;

export interface TransferInput {
  from: TransferAccount;
  to: TransferAccount;
  /** Magnitude leaving the source account, in the source account's currency. */
  amount: Money;
  /**
   * What actually landed, when the user knows. Overrides the table rate, because
   * the rate a bank or money changer applied is rarely the rate in the table and
   * the figure that hit the account is the one that reconciles.
   */
  receivedAmount?: Money;
  occurredAt?: Date;
  notes?: string | null;
  createdVia?: string;
}

/** Where the credited figure came from. Surfaced so the UI can be honest about it. */
export type ReceivedBasis = "same-currency" | "rate-table" | "user-entered";

export interface TransferPlan {
  from: TransferAccount;
  to: TransferAccount;
  /** Positive magnitude debited from the source, in the source currency. */
  sent: Money;
  /** Positive magnitude credited to the destination, in the destination currency. */
  received: Money;
  isCrossCurrency: boolean;
  /**
   * Destination units per source unit, in major units. Null for a same-currency
   * transfer, where there is no rate to record.
   */
  appliedRate: number | null;
  receivedBasis: ReceivedBasis;
  /** What the table rate alone would have credited. Lets the UI show the delta. */
  quotedReceived: Money;
  /** Source balance once the transfer settles. */
  fromBalanceAfter: Money;
  /** Destination balance once the transfer settles. */
  toBalanceAfter: Money;
  /**
   * The quoted figure rounded to the destination's cash step, when the
   * destination holds physical cash and the quote is not already on that step.
   *
   * Offered as a one-tap suggestion, never applied automatically: rounding a
   * ledger amount is a real change in value, so it has to be the user's choice.
   */
  cashStepSuggestion: Money | null;
  occurredAt: Date;
  notes: string | null;
  createdVia: string;
}

/**
 * Decide what a transfer between two accounts means.
 *
 * Throws on anything that would produce a row the database must reject, so the
 * caller finds out at the point of the mistake rather than at the insert.
 */
export function planTransfer(
  input: TransferInput,
  rate: ExchangeRate = DEFAULT_RATE,
): TransferPlan {
  const { from, to } = input;

  if (from.accountId === to.accountId) {
    throw new Error("A transfer needs two different accounts.");
  }

  const sent = absolute(input.amount);

  if (sent.currency !== from.currency) {
    throw new MoneyError(
      `Transfer amount is in ${sent.currency} but ${from.name} holds ${from.currency}. ` +
        `An account is single-currency.`,
    );
  }

  if (isZero(sent)) {
    throw new MoneyError("A transfer must move a non-zero amount.");
  }

  const isCrossCurrency = from.currency !== to.currency;

  // Always computed, even when the user overrides it, so the UI can show what
  // the table would have said next to what the bank actually did.
  const quotedReceived = convert(sent, to.currency, rate);

  let received: Money;
  let receivedBasis: ReceivedBasis;

  if (input.receivedAmount) {
    received = absolute(input.receivedAmount);
    if (received.currency !== to.currency) {
      throw new MoneyError(
        `Received amount is in ${received.currency} but ${to.name} holds ${to.currency}.`,
      );
    }
    if (isZero(received)) {
      throw new MoneyError("A transfer must credit a non-zero amount.");
    }
    receivedBasis = "user-entered";
  } else {
    received = quotedReceived;
    receivedBasis = isCrossCurrency ? "rate-table" : "same-currency";
  }

  const cashRounded = roundToCashStep(quotedReceived);

  return {
    from,
    to,
    sent,
    received,
    isCrossCurrency,
    // The rate that reconciles the two legs as recorded, not the table rate:
    // when the user overrode the received figure, this is the rate they got.
    appliedRate: isCrossCurrency ? impliedRate(sent, received) : null,
    receivedBasis,
    quotedReceived,
    fromBalanceAfter: subtract(money(from.currentBalance, from.currency), sent),
    toBalanceAfter: money(to.currentBalance + received.minor, to.currency),
    cashStepSuggestion:
      to.type === "cash" && cashRounded.minor !== quotedReceived.minor ? cashRounded : null,
    occurredAt: input.occurredAt ?? new Date(),
    notes: input.notes ?? null,
    createdVia: input.createdVia ?? "web",
  };
}

/**
 * The rate implied by the two legs, in major units per major unit.
 *
 * Derived from the amounts rather than taken from the rate table so that an
 * overridden received figure reports the rate the user actually got. Crosses the
 * minor-unit scale gap: USD has two decimals and KHR none, so dividing raw minor
 * units would be wrong by a factor of 100.
 */
function impliedRate(sent: Money, received: Money): number {
  const sentMajor = sent.minor / minorUnitScale(sent.currency);
  const receivedMajor = received.minor / minorUnitScale(received.currency);

  return receivedMajor / sentMajor;
}

export type TransferIssueCode = "insufficient-funds" | "rate-deviation";

export interface TransferIssue {
  code: TransferIssueCode;
  message: string;
}

/**
 * Non-blocking warnings about a plan.
 *
 * Separate from the errors thrown by `planTransfer` because these are judgements
 * about plausibility, not violated invariants. Overdrawing a cash wallet is
 * almost always a typo, but the ledger has to be able to record what really
 * happened, so the user gets a warning and the final say.
 */
export function transferIssues(
  plan: TransferPlan,
  /** Fractional gap from the table rate worth mentioning. */
  rateTolerance = 0.05,
): TransferIssue[] {
  const issues: TransferIssue[] = [];

  // A credit card is expected to sit negative; that is what a card is.
  if (plan.from.type !== "credit_card" && plan.fromBalanceAfter.minor < 0) {
    issues.push({
      code: "insufficient-funds",
      message: `${plan.from.name} would go below zero.`,
    });
  }

  if (
    plan.receivedBasis === "user-entered" &&
    plan.isCrossCurrency &&
    plan.quotedReceived.minor !== 0
  ) {
    const deviation =
      Math.abs(plan.received.minor - plan.quotedReceived.minor) /
      Math.abs(plan.quotedReceived.minor);

    if (deviation > rateTolerance) {
      issues.push({
        code: "rate-deviation",
        message: `That is ${(deviation * 100).toFixed(1)}% away from the current rate.`,
      });
    }
  }

  return issues;
}

/**
 * Turn a plan into the two rows to insert.
 *
 * Both legs must reach the database in a single statement: a transfer that
 * persisted one side would silently destroy or invent money. The two rows are
 * returned together so the caller inserts them in one request, which PostgREST
 * wraps in one transaction.
 */
export function transferInserts(
  plan: TransferPlan,
  transferGroupId: string,
  baseCurrency: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): [TransactionInsert, TransactionInsert] {
  return buildTransfer(
    {
      fromAccountId: plan.from.accountId,
      toAccountId: plan.to.accountId,
      amount: plan.sent,
      toCurrency: plan.to.currency,
      // Always explicit. The plan has already decided the credited figure,
      // whether from the table or from the user, and re-deriving it here could
      // disagree with what the user was shown.
      receivedAmount: plan.received,
      occurredAt: plan.occurredAt,
      notes: plan.notes,
      createdVia: plan.createdVia,
    },
    transferGroupId,
    baseCurrency,
    rate,
  );
}

/**
 * Human-readable summary, for confirmations and the Telegram replies in PRD
 * Section 9.
 *
 * A cross-currency transfer names both figures, because "$100 to Wing" hides the
 * number the user will actually see in their Wing balance.
 */
export function describeTransfer(plan: TransferPlan): string {
  return plan.isCrossCurrency
    ? `${formatMoney(plan.sent)} from ${plan.from.name} → ` +
        `${formatMoney(plan.received)} into ${plan.to.name}`
    : `${formatMoney(plan.sent)} from ${plan.from.name} → ${plan.to.name}`;
}
