/**
 * Demo data for local development before Supabase is connected.
 *
 * Deliberately shaped like the rows the real queries return, so swapping the
 * data source does not change any component. The figures reflect a plausible
 * month for someone in Phnom Penh: salary in USD, daily spending split between
 * dollars and riel, e-wallet top-ups, a credit card carrying a balance.
 */

import type { AccountBalance, Budget, Category, Transaction } from "@/lib/domain/types";
import { convert, exchangeRate, money } from "@/lib/money";

export const DEMO_RATE = exchangeRate(4100, "USD", "KHR", new Date("2026-07-01"), "manual");

export const DEMO_BASE_CURRENCY = "USD" as const;

/**
 * Fill in the columns the `account_balances` view derives or defaults.
 *
 * A factory rather than nine literals so that adding a column to the view means
 * one change here, and so `countsTowardNetWorth` is always consistent with the
 * two flags it comes from instead of being set by hand.
 */
function demoAccount(
  seed: Pick<
    AccountBalance,
    "accountId" | "name" | "type" | "currency" | "currentBalance" | "transactionCount" | "lastActivityAt"
  > &
    Partial<AccountBalance>,
): AccountBalance {
  const isActive = seed.isActive ?? true;
  const includeInNetWorth = seed.includeInNetWorth ?? true;

  return {
    userId: "demo",
    institution: null,
    icon: null,
    color: null,
    sortOrder: 0,
    ...seed,
    isActive,
    includeInNetWorth,
    countsTowardNetWorth: isActive && includeInNetWorth,
  };
}

export const DEMO_ACCOUNTS: AccountBalance[] = [
  demoAccount({
    accountId: "acc-aba-usd",
    name: "ABA USD",
    institution: "ABA Bank",
    type: "bank",
    currency: "USD",
    currentBalance: 184_250, // $1,842.50
    transactionCount: 42,
    lastActivityAt: "2026-07-30T09:15:00.000Z",
    sortOrder: 10,
  }),
  demoAccount({
    accountId: "acc-aba-khr",
    name: "ABA KHR",
    institution: "ABA Bank",
    type: "bank",
    currency: "KHR",
    currentBalance: 1_240_000, // 1,240,000៛ ≈ $302
    transactionCount: 18,
    lastActivityAt: "2026-07-29T13:40:00.000Z",
    sortOrder: 20,
  }),
  demoAccount({
    accountId: "acc-wing",
    name: "Wing",
    institution: "Wing Bank",
    type: "ewallet",
    currency: "KHR",
    currentBalance: 385_000, // 385,000៛ ≈ $94
    transactionCount: 27,
    lastActivityAt: "2026-07-31T07:05:00.000Z",
    sortOrder: 30,
  }),
  demoAccount({
    accountId: "acc-truemoney",
    name: "TrueMoney",
    institution: "TrueMoney",
    type: "ewallet",
    currency: "KHR",
    currentBalance: 62_000,
    transactionCount: 9,
    lastActivityAt: "2026-07-26T18:20:00.000Z",
    sortOrder: 40,
  }),
  demoAccount({
    accountId: "acc-cash-usd",
    name: "Cash USD",
    type: "cash",
    currency: "USD",
    currentBalance: 12_000, // $120
    transactionCount: 15,
    lastActivityAt: "2026-07-31T12:00:00.000Z",
    sortOrder: 50,
  }),
  demoAccount({
    accountId: "acc-cash-khr",
    name: "Cash KHR",
    type: "cash",
    currency: "KHR",
    currentBalance: 148_000,
    transactionCount: 31,
    lastActivityAt: "2026-07-31T11:30:00.000Z",
    sortOrder: 60,
  }),
  demoAccount({
    accountId: "acc-savings",
    name: "ACLEDA Savings",
    institution: "ACLEDA Bank",
    type: "savings",
    currency: "USD",
    currentBalance: 620_000, // $6,200
    transactionCount: 6,
    lastActivityAt: "2026-07-01T02:00:00.000Z",
    sortOrder: 70,
  }),
  demoAccount({
    accountId: "acc-invest",
    name: "Investment",
    type: "investment",
    currency: "USD",
    currentBalance: 310_000, // $3,100
    transactionCount: 4,
    lastActivityAt: "2026-07-15T02:00:00.000Z",
    sortOrder: 80,
  }),
  demoAccount({
    accountId: "acc-card",
    name: "ABA Credit Card",
    institution: "ABA Bank",
    type: "credit_card",
    currency: "USD",
    currentBalance: -48_500, // $485 owed
    transactionCount: 11,
    lastActivityAt: "2026-07-28T15:10:00.000Z",
    sortOrder: 90,
  }),
];

export const DEMO_CATEGORIES: Category[] = [
  { id: "cat-coffee", userId: "demo", parentId: "cat-food", name: "Coffee", icon: "coffee", color: "#b45309", appliesTo: ["expense"], isSystem: true, sortOrder: 11 },
  { id: "cat-restaurant", userId: "demo", parentId: "cat-food", name: "Restaurant", icon: "utensils-crossed", color: "#ea580c", appliesTo: ["expense"], isSystem: true, sortOrder: 12 },
  { id: "cat-groceries", userId: "demo", parentId: null, name: "Groceries", icon: "shopping-cart", color: "#22c55e", appliesTo: ["expense"], isSystem: true, sortOrder: 30 },
  { id: "cat-fuel", userId: "demo", parentId: "cat-transport", name: "Fuel", icon: "fuel", color: "#1d4ed8", appliesTo: ["expense"], isSystem: true, sortOrder: 21 },
  { id: "cat-grab", userId: "demo", parentId: "cat-transport", name: "Tuk Tuk / Grab", icon: "car-taxi-front", color: "#2563eb", appliesTo: ["expense"], isSystem: true, sortOrder: 22 },
  { id: "cat-utilities", userId: "demo", parentId: null, name: "Utilities", icon: "zap", color: "#eab308", appliesTo: ["expense"], isSystem: true, sortOrder: 50 },
  { id: "cat-housing", userId: "demo", parentId: null, name: "Housing", icon: "home", color: "#8b5cf6", appliesTo: ["expense"], isSystem: true, sortOrder: 40 },
  { id: "cat-shopping", userId: "demo", parentId: null, name: "Shopping", icon: "shopping-bag", color: "#ec4899", appliesTo: ["expense"], isSystem: true, sortOrder: 70 },
  { id: "cat-salary", userId: "demo", parentId: null, name: "Salary", icon: "banknote", color: "#16a34a", appliesTo: ["income"], isSystem: true, sortOrder: 200 },
  { id: "cat-freelance", userId: "demo", parentId: null, name: "Freelance", icon: "laptop", color: "#0ea5e9", appliesTo: ["income"], isSystem: true, sortOrder: 210 },
];

export const CATEGORY_LOOKUP: Record<string, Category> = Object.fromEntries(
  DEMO_CATEGORIES.map((category) => [category.id, category]),
);

function transaction(
  id: string,
  accountId: string,
  type: Transaction["type"],
  amount: number,
  currency: Transaction["currency"],
  categoryId: string | null,
  occurredAt: string,
  notes: string | null,
  createdVia = "web",
): Transaction {
  return {
    id,
    userId: "demo",
    accountId,
    categoryId,
    merchantId: null,
    type,
    amount,
    currency,
    exchangeRate: null,
    baseAmount: null,
    baseCurrency: null,
    occurredAt,
    notes,
    location: null,
    transferGroupId: null,
    createdVia,
    isPending: false,
  };
}

/**
 * The two legs of a transfer, as `buildTransfer` would produce them.
 *
 * Written as a pair because a single leg is not a representable state: migration
 * 0004 rejects a transfer group that does not hold exactly two opposite legs. The
 * conversion fields are populated on whichever leg is not already in the base
 * currency, matching the all-or-nothing rule in `transactions_base_fields_together`.
 */
function transferPair(
  groupId: string,
  out: { id: string; accountId: string; amount: number; currency: Transaction["currency"] },
  incoming: { id: string; accountId: string; amount: number; currency: Transaction["currency"] },
  occurredAt: string,
  notes: string | null,
  base: Transaction["currency"] = DEMO_BASE_CURRENCY,
): Transaction[] {
  const leg = (
    part: { id: string; accountId: string; amount: number; currency: Transaction["currency"] },
    signedAmount: number,
  ): Transaction => {
    const needsConversion = part.currency !== base;
    return {
      id: part.id,
      userId: "demo",
      accountId: part.accountId,
      categoryId: null,
      merchantId: null,
      type: "transfer",
      amount: signedAmount,
      currency: part.currency,
      exchangeRate: needsConversion ? 1 / DEMO_RATE.rate : null,
      baseAmount: needsConversion
        ? convert(money(signedAmount, part.currency), base, DEMO_RATE).minor
        : null,
      baseCurrency: needsConversion ? base : null,
      occurredAt,
      notes,
      location: null,
      transferGroupId: groupId,
      createdVia: "web",
      isPending: false,
    };
  };

  return [
    leg(out, -Math.abs(out.amount)),
    leg(incoming, Math.abs(incoming.amount)),
  ];
}

/** July 2026 activity. Amounts are signed minor units. */
export const DEMO_TRANSACTIONS: Transaction[] = [
  transaction("t-01", "acc-aba-usd", "income", 160_000, "USD", "cat-salary", "2026-07-01T02:00:00.000Z", "July salary"),
  transaction("t-02", "acc-aba-usd", "expense", -45_000, "USD", "cat-housing", "2026-07-02T03:00:00.000Z", "Rent"),
  transaction("t-03", "acc-cash-khr", "expense", -8_000, "KHR", "cat-coffee", "2026-07-02T01:30:00.000Z", "Iced coffee", "telegram"),
  transaction("t-04", "acc-wing", "expense", -32_000, "KHR", "cat-grab", "2026-07-03T09:20:00.000Z", "Grab to office"),
  transaction("t-05", "acc-aba-usd", "expense", -2_450, "USD", "cat-groceries", "2026-07-04T10:15:00.000Z", "Lucky Supermarket"),
  transaction("t-06", "acc-cash-usd", "expense", -500, "USD", "cat-coffee", "2026-07-05T01:45:00.000Z", "Brown Coffee", "telegram"),
  transaction("t-07", "acc-aba-khr", "expense", -120_000, "KHR", "cat-utilities", "2026-07-06T04:00:00.000Z", "Electricity"),
  transaction("t-08", "acc-card", "expense", -8_900, "USD", "cat-shopping", "2026-07-08T12:30:00.000Z", "Shoes"),
  transaction("t-09", "acc-cash-khr", "expense", -20_000, "KHR", "cat-restaurant", "2026-07-09T12:00:00.000Z", "Lunch", "telegram"),
  transaction("t-10", "acc-wing", "expense", -82_000, "KHR", "cat-fuel", "2026-07-10T08:10:00.000Z", "Caltex"),
  transaction("t-11", "acc-aba-usd", "income", 35_000, "USD", "cat-freelance", "2026-07-12T06:00:00.000Z", "Design work"),
  transaction("t-12", "acc-cash-usd", "expense", -350, "USD", "cat-coffee", "2026-07-13T02:00:00.000Z", "Coffee", "telegram"),
  transaction("t-13", "acc-aba-usd", "expense", -3_120, "USD", "cat-groceries", "2026-07-15T11:00:00.000Z", "Aeon"),
  transaction("t-14", "acc-truemoney", "expense", -45_000, "KHR", "cat-restaurant", "2026-07-17T13:20:00.000Z", "Dinner"),
  transaction("t-15", "acc-cash-khr", "expense", -12_000, "KHR", "cat-coffee", "2026-07-19T01:15:00.000Z", "Coffee", "telegram"),
  transaction("t-16", "acc-card", "expense", -4_200, "USD", "cat-restaurant", "2026-07-20T13:00:00.000Z", "Riverside dinner"),
  transaction("t-17", "acc-wing", "expense", -28_000, "KHR", "cat-grab", "2026-07-22T09:00:00.000Z", "Grab"),
  transaction("t-18", "acc-aba-usd", "expense", -1_800, "USD", "cat-shopping", "2026-07-24T15:30:00.000Z", "Household"),
  transaction("t-19", "acc-cash-khr", "expense", -16_000, "KHR", "cat-restaurant", "2026-07-26T12:10:00.000Z", "Lunch", "telegram"),
  transaction("t-20", "acc-aba-khr", "expense", -95_000, "KHR", "cat-utilities", "2026-07-27T04:30:00.000Z", "Water + internet"),
  transaction("t-21", "acc-cash-usd", "expense", -450, "USD", "cat-coffee", "2026-07-29T02:00:00.000Z", "Coffee", "telegram"),
  transaction("t-22", "acc-wing", "expense", -55_000, "KHR", "cat-groceries", "2026-07-30T10:45:00.000Z", "Chip Mong"),
  transaction("t-23", "acc-cash-khr", "expense", -6_000, "KHR", "cat-coffee", "2026-07-31T01:20:00.000Z", "Coffee", "telegram"),
  transaction("t-24", "acc-cash-usd", "expense", -300, "USD", "cat-grab", "2026-07-31T08:30:00.000Z", "Tuk tuk"),

  // A cross-currency transfer: $100 out of the USD bank account, 410,000៛ into
  // the riel e-wallet. Neither leg is an expense, so both are excluded from the
  // cash flow and category totals — the money never left the user's control.
  ...transferPair(
    "tg-0001",
    { id: "t-25", accountId: "acc-aba-usd", amount: 10_000, currency: "USD" },
    { id: "t-26", accountId: "acc-wing", amount: 410_000, currency: "KHR" },
    "2026-07-18T03:30:00.000Z",
    "Top up Wing",
  ),

  // A same-currency transfer, to cover the case with no conversion fields at all.
  ...transferPair(
    "tg-0002",
    { id: "t-27", accountId: "acc-aba-usd", amount: 20_000, currency: "USD" },
    { id: "t-28", accountId: "acc-savings", amount: 20_000, currency: "USD" },
    "2026-07-05T02:00:00.000Z",
    "Monthly saving",
  ),
];

/** The window the demo data covers. */
export const DEMO_PERIOD = {
  from: new Date(2026, 6, 1),
  to: new Date(2026, 6, 31),
};

/**
 * Demo budgets, chosen to show every state the progress bar can be in: comfortably
 * under, past the warning threshold, and overspent. A screen where everything is
 * green tells you nothing about whether the overspend case renders correctly.
 */
export const DEMO_BUDGETS: Budget[] = [
  {
    id: "bud-food",
    userId: "demo",
    categoryId: "cat-restaurant",
    name: null,
    amount: 15_000, // $150 — actual is ~$110, comfortably under
    currency: "USD",
    period: "monthly",
    startsOn: "2026-07-01",
    endsOn: null,
    rollover: false,
    alertThreshold: 0.8,
    isActive: true,
  },
  {
    id: "bud-coffee",
    userId: "demo",
    categoryId: "cat-coffee",
    name: null,
    amount: 2_000, // $20 — actual is ~$18, past the 80% warning
    currency: "USD",
    period: "monthly",
    startsOn: "2026-07-01",
    endsOn: null,
    rollover: false,
    alertThreshold: 0.8,
    isActive: true,
  },
  {
    id: "bud-groceries",
    userId: "demo",
    categoryId: "cat-groceries",
    name: null,
    amount: 5_000, // $50 — actual is ~$70, overspent
    currency: "USD",
    period: "monthly",
    startsOn: "2026-07-01",
    endsOn: null,
    rollover: false,
    alertThreshold: 0.9,
    isActive: true,
  },
  {
    id: "bud-overall",
    userId: "demo",
    // Null category: an overall cap on everything, which is where most people
    // start before they trust their categories.
    categoryId: null,
    name: "Everything",
    amount: 120_000, // $1,200
    currency: "USD",
    period: "monthly",
    startsOn: "2026-07-01",
    endsOn: null,
    rollover: false,
    alertThreshold: 0.8,
    isActive: true,
  },
];
