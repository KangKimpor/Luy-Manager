import { expect, test } from "vitest";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_TRANSACTIONS } from "@/lib/demo-data";
import type { Transaction } from "./types";
import { learnEntryHabits } from "./entry-habits";
import { quickEntryAccounts } from "./entry-choices";

function coffee(overrides: Partial<Transaction> = {}): Transaction {
  return { ...DEMO_TRANSACTIONS[0], type: "expense", currency: "KHR", amount: -600000,
    notes: "Coffee", categoryId: "cat-drinks", ...overrides };
}

test("learns a repeated exact bank amount and preserves the saved category and note", () => {
  expect(learnEntryHabits([coffee(), coffee(), coffee()], DEMO_CATEGORIES)).toEqual([
    { amount: { minor: 600000, currency: "KHR" }, type: "expense", categoryId: "cat-drinks", note: "Coffee" },
  ]);
  expect(learnEntryHabits([coffee({ amount: -999355 }), coffee({ amount: -999355 }), coffee({ amount: -999355 })], DEMO_CATEGORIES)[0].amount.minor).toBe(999355);
});

test("requires three examples and a clear majority, including entries without notes", () => {
  expect(learnEntryHabits([coffee(), coffee()], DEMO_CATEGORIES)).toEqual([]);
  expect(learnEntryHabits([coffee(), coffee(), coffee(), coffee({ notes: "Lunch", categoryId: "cat-food" })], DEMO_CATEGORIES)).toHaveLength(1);
  expect(learnEntryHabits([coffee(), coffee(), coffee(), coffee({ notes: null }), coffee({ notes: null })], DEMO_CATEGORIES)).toEqual([]);
});

test("keeps currencies and transaction types separate and ignores transfers", () => {
  const history = [coffee(), coffee(), coffee({ currency: "USD" }), coffee({ type: "income" }), coffee({ type: "transfer" })];
  expect(learnEntryHabits(history, DEMO_CATEGORIES)).toEqual([]);
});

test("recognizes case variants and resolves uncategorised coffee to Drinks", () => {
  expect(learnEntryHabits([coffee({ categoryId: null }), coffee({ notes: "coffee" }), coffee({ notes: " Coffee  " })], DEMO_CATEGORIES)).toHaveLength(1);
  expect(learnEntryHabits([coffee(), coffee(), coffee()], [])).toEqual([]);
});

test("quick entry offers ABA checking in both currencies ahead of savings or other wallets", () => {
  const usd = DEMO_ACCOUNTS.find(account => account.accountId === "acc-aba-usd")!;
  const khr = DEMO_ACCOUNTS.find(account => account.accountId === "acc-aba-khr")!;
  const savings = { ...usd, accountId: "savings", name: "ABA Savings", transactionCount: 1000 };
  expect(quickEntryAccounts([savings, { ...usd, name: "ABA Dollar Checking Accounts" }, { ...khr, name: "ABA Riel Checking Account" }], "savings").map(account => account.accountId)).toEqual([usd.accountId, khr.accountId]);
  expect(quickEntryAccounts([{ ...usd, isActive: false }, khr], usd.accountId).map(account => account.accountId)).toEqual([khr.accountId]);
  expect(quickEntryAccounts([], "")).toEqual([]);
});
