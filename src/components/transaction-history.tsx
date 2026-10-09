import { TransactionRow } from "@/components/transaction-row";
import { Card, CardBody } from "@/components/ui/card";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";

export function TransactionHistory({ transactions, categories, accounts, editable }: {
  transactions: readonly Transaction[];
  categories: Record<string, Category>;
  accounts: Record<string, AccountBalance>;
  editable: boolean;
}) {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const day = new Date(transaction.occurredAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Phnom_Penh",
    });
    groups.set(day, [...(groups.get(day) ?? []), transaction]);
  }
  return (
    <div className="space-y-6">
      {[...groups].map(([day, rows]) => (
        <section key={day} aria-label={day}>
          <h2 className="text-ink-muted mb-3 px-1 text-sm font-medium">{day}</h2>
          <Card><CardBody><ul className="divide-surface-variant divide-y">
            {rows.map(transaction => <TransactionRow key={transaction.id} transaction={transaction} transactions={transactions} categories={categories} accounts={accounts} editable={editable} showDate={false} />)}
          </ul></CardBody></Card>
        </section>
      ))}
    </div>
  );
}
