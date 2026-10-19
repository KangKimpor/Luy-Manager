import { absolute, money, type Money } from "@/lib/money";
import { resolveCategory } from "./categories";
import type { Category, Transaction, TransactionType } from "./types";

export interface EntryHabit {
  amount: Money;
  type: TransactionType;
  categoryId: string;
  note: string;
}

/** Only repeat a clear majority from this user's recent, non-deleted entries. */
export function learnEntryHabits(transactions: readonly Transaction[], categories: readonly Category[]): EntryHabit[] {
  const amounts = new Map<string, { total: number; choices: Map<string, { habit: EntryHabit; count: number }> }>();
  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;
    const amount = absolute(money(transaction.amount, transaction.currency));
    if (amount.minor === 0) continue;
    const key = `${transaction.type}:${amount.currency}:${amount.minor}`;
    const group = amounts.get(key) ?? { total: 0, choices: new Map() };
    amounts.set(key, group);
    group.total++;
    const note = transaction.notes?.trim().replace(/\s+/g, " ");
    if (!note) continue;
    const relevant = categories.filter(category => category.appliesTo.includes(transaction.type));
    const category = relevant.find(category => category.id === transaction.categoryId) ?? resolveCategory(relevant, note);
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
