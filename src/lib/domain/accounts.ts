/**
 * Account presets and net-worth aggregation.
 *
 * PRD Section 6 names the institutions a Cambodian user actually holds money
 * with. Offering them as presets removes the most tedious part of onboarding,
 * where a user would otherwise type institution names and pick colours by hand.
 */

import type { CurrencyCode } from "@/lib/money";
import {
  convert,
  DEFAULT_RATE,
  type ExchangeRate,
  money,
  type Money,
  sum,
  zero,
} from "@/lib/money";

import type { AccountBalance, AccountType } from "./types";

export interface AccountPreset {
  label: string;
  institution: string | null;
  type: AccountType;
  /** Currencies this institution commonly holds. First is the default. */
  currencies: readonly CurrencyCode[];
  icon: string;
  color: string;
}

export const ACCOUNT_PRESETS: readonly AccountPreset[] = [
  {
    label: "ABA Bank",
    institution: "ABA Bank",
    type: "bank",
    currencies: ["USD", "KHR"],
    icon: "landmark",
    color: "#00539f",
  },
  {
    label: "ACLEDA Bank",
    institution: "ACLEDA Bank",
    type: "bank",
    currencies: ["USD", "KHR"],
    icon: "landmark",
    color: "#0057a8",
  },
  {
    label: "Wing",
    institution: "Wing Bank",
    type: "ewallet",
    currencies: ["KHR", "USD"],
    icon: "wallet",
    color: "#00a651",
  },
  {
    label: "TrueMoney",
    institution: "TrueMoney",
    type: "ewallet",
    currencies: ["KHR"],
    icon: "smartphone",
    color: "#f36f21",
  },
  {
    label: "Cash (USD)",
    institution: null,
    type: "cash",
    currencies: ["USD"],
    icon: "banknote",
    color: "#16a34a",
  },
  {
    label: "Cash (KHR)",
    institution: null,
    type: "cash",
    currencies: ["KHR"],
    icon: "banknote",
    color: "#dc2626",
  },
  {
    label: "Credit Card",
    institution: null,
    type: "credit_card",
    currencies: ["USD", "KHR"],
    icon: "credit-card",
    color: "#7c3aed",
  },
  {
    label: "Savings",
    institution: null,
    type: "savings",
    currencies: ["USD", "KHR"],
    icon: "piggy-bank",
    color: "#0891b2",
  },
  {
    label: "Investment",
    institution: null,
    type: "investment",
    currencies: ["USD"],
    icon: "trending-up",
    color: "#059669",
  },
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank",
  ewallet: "E-wallet",
  cash: "Cash",
  credit_card: "Credit card",
  savings: "Savings",
  investment: "Investment",
};

/** Account types that represent immediately spendable money. */
const LIQUID_TYPES: readonly AccountType[] = ["bank", "ewallet", "cash"];

export function balanceOf(balance: AccountBalance): Money {
  return money(balance.currentBalance, balance.currency);
}

function totalWhere(
  balances: readonly AccountBalance[],
  base: CurrencyCode,
  rate: ExchangeRate,
  predicate: (balance: AccountBalance) => boolean,
): Money {
  return balances.filter(predicate).reduce(
    (acc, balance) => money(acc.minor + convert(balanceOf(balance), base, rate).minor, base),
    zero(base),
  );
}

export interface NetWorthSummary {
  /** Everything flagged for inclusion, assets net of liabilities. */
  netWorth: Money;
  /** Bank, e-wallet and cash: what could be spent today. */
  cash: Money;
  savings: Money;
  investments: Money;
  /** Credit card balances, reported as a positive amount owed. */
  liabilities: Money;
}

/**
 * Aggregate account balances into the dashboard cards in PRD Section 11.
 *
 * Credit cards carry negative balances in the ledger, so they reduce net worth
 * naturally. `liabilities` re-signs them positive because a card is shown to the
 * user as an amount owed, not as negative money.
 */
export function summarizeNetWorth(
  balances: readonly AccountBalance[],
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): NetWorthSummary {
  // `countsTowardNetWorth` rather than `includeInNetWorth`: a closed account must
  // also be left out, and the view combines both flags so this cannot be got
  // half-right here.
  const included = balances.filter((b) => b.countsTowardNetWorth);

  const liabilities = totalWhere(included, base, rate, (b) => b.type === "credit_card");

  return {
    netWorth: totalWhere(included, base, rate, () => true),
    cash: totalWhere(included, base, rate, (b) => LIQUID_TYPES.includes(b.type)),
    savings: totalWhere(included, base, rate, (b) => b.type === "savings"),
    investments: totalWhere(included, base, rate, (b) => b.type === "investment"),
    liabilities: money(-liabilities.minor, base),
  };
}

export interface CurrencyPocket {
  currency: CurrencyCode;
  /** Native subtotal of included accounts in this currency. */
  subtotal: Money;
  /** Subtotal converted into the display currency. */
  converted: Money;
  /** Number of included accounts holding this currency. */
  count: number;
  /** Positive-value share of total pockets, 0 to 1 (sum is 1 when either pocket is positive, else 0). */
  share: number;
  /** Rounded whole-percent share (0 to 100) for display without rounding in UI. */
  sharePercent: number;
}

export interface CurrencyPocketsSummary {
  base: CurrencyCode;
  usd: CurrencyPocket;
  khr: CurrencyPocket;
}

/**
 * Group included accounts into USD and KHR pockets with native subtotals and converted shares.
 *
 * Native subtotals stay in their own currency without conversion so pocket figures match
 * the user's real wallets, while shares convert both pockets to a single currency first.
 */
export function summarizeCurrencyPockets(
  balances: readonly AccountBalance[],
  base: CurrencyCode,
  rate: ExchangeRate = DEFAULT_RATE,
): CurrencyPocketsSummary {
  const included = balances.filter((b) => b.countsTowardNetWorth);
  const usdAccounts = included.filter((b) => b.currency === "USD");
  const khrAccounts = included.filter((b) => b.currency === "KHR");

  const usdSubtotal = sum(usdAccounts.map(balanceOf), "USD");
  const khrSubtotal = sum(khrAccounts.map(balanceOf), "KHR");

  const usdConverted = convert(usdSubtotal, base, rate);
  const khrConverted = convert(khrSubtotal, base, rate);

  const usdPositive = Math.max(0, usdConverted.minor);
  const khrPositive = Math.max(0, khrConverted.minor);
  const positiveSum = usdPositive + khrPositive;

  const usdShare = positiveSum === 0 ? 0 : usdPositive / positiveSum;
  const khrShare = positiveSum === 0 ? 0 : 1 - usdShare;
  const usdPercent = positiveSum === 0 ? 0 : Math.round(usdShare * 100);
  const khrPercent = positiveSum === 0 ? 0 : 100 - usdPercent;

  return {
    base,
    usd: {
      currency: "USD",
      subtotal: usdSubtotal,
      converted: usdConverted,
      count: usdAccounts.length,
      share: usdShare,
      sharePercent: usdPercent,
    },
    khr: {
      currency: "KHR",
      subtotal: khrSubtotal,
      converted: khrConverted,
      count: khrAccounts.length,
      share: khrShare,
      sharePercent: khrPercent,
    },
  };
}
