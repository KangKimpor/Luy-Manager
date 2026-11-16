import { absolute, CURRENCY_META, minorUnitScale, money, type Money } from "@/lib/money";
import { resolveCategory } from "./categories";
import { TRANSACTION_TYPES, type Category, type EntryHabitLine, type TransactionType } from "./types";

export interface EntryHabit {
  amount: Money;
  type: TransactionType;
  categoryId: string;
  note: string;
}

/** Stable identifier for linking an Add-again chip cleanly through `?habit=`. */
export function entryHabitKey(habit: Pick<EntryHabit, "type" | "amount">): string {
  return `${habit.type}:${habit.amount.currency}:${habit.amount.minor}`;
}

/** Match a `?habit=` parameter against learned habits; returns null if missing or unknown. */
export function resolveEntryHabit(habits: readonly EntryHabit[], key: string | undefined): EntryHabit | null {
  if (!key) return null;
  return habits.find((habit) => entryHabitKey(habit) === key) ?? null;
}

/** Format an integer Money amount as a raw keypad string without floating-point rounding. */
export function amountToRawString(amount: Money): string {
  const abs = absolute(amount);
  const decimals = CURRENCY_META[abs.currency].decimals;
  const scale = BigInt(minorUnitScale(abs.currency));
  const value = BigInt(abs.minor);
  const whole = value / scale;
  const remainder = value % scale;
  if (abs.currency === "KHR" && remainder === BigInt(0)) {
    return String(whole);
  }
  return `${whole}.${String(remainder).padStart(decimals, "0")}`;
}

/**
 * Count how often each category was picked in recent entries.
 *
 * The Add screen keeps only a handful of category chips visible, so the order
 * has to reflect this user's own history rather than the catalogue. Transfers
 * and uncategorised lines carry no pick to count.
 */
export function countCategoryUsage(transactions: readonly EntryHabitLine[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const transaction of transactions) {
    if (transaction.type === "transfer" || !transaction.categoryId) continue;
    counts[transaction.categoryId] = (counts[transaction.categoryId] ?? 0) + 1;
  }
  return counts;
}

/** Only repeat a clear majority from this user's recent, non-deleted entries. */
export function learnEntryHabits(transactions: readonly EntryHabitLine[], categories: readonly Category[]): EntryHabit[] {
  const byType = new Map<TransactionType, { list: Category[]; byId: Map<string, Category> }>();
  for (const type of TRANSACTION_TYPES) {
    const list = categories.filter((category) => category.appliesTo.includes(type));
    byType.set(type, { list, byId: new Map(list.map((category) => [category.id, category])) });
  }

  const amounts = new Map<string, { total: number; choices: Map<string, { habit: EntryHabit; count: number }> }>();
  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;
    const amount = absolute(money(transaction.amount, transaction.currency));
    if (amount.minor === 0) continue;
    const key = entryHabitKey({ type: transaction.type, amount });
    const group = amounts.get(key) ?? { total: 0, choices: new Map() };
    amounts.set(key, group);
    group.total++;
    const note = transaction.notes?.trim().replace(/\s+/g, " ");
    if (!note) continue;
    const relevant = byType.get(transaction.type);
    if (!relevant || relevant.list.length === 0) continue;
    const category = (transaction.categoryId ? relevant.byId.get(transaction.categoryId) : undefined)
      ?? resolveCategory(relevant.list, note);
    if (!category) continue;
    const choiceKey = JSON.stringify([category.id, note.toLocaleLowerCase()]);
    const choice = group.choices.get(choiceKey);
    if (choice) choice.count++;
    else group.choices.set(choiceKey, { count: 1, habit: { amount, type: transaction.type, categoryId: category.id, note } });
  }
  return [...amounts.values()].flatMap(group => {
    const winner = [...group.choices.values()].find(choice => choice.count >= 3 && choice.count * 4 >= group.total * 3);
    return winner ? [winner.habit] : [];
  });
}
