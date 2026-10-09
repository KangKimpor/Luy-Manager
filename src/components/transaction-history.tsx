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
    <div className="stagger-children space-y-5">
      {[...groups].map(([day, rows]) => (
        <section key={day} aria-label={day}>
          <div className="mb-3 flex items-center justify-between px-1"><h2 className="text-xs font-semibold text-ink-muted">{day}</h2><span className="text-[11px] text-ink-faint">{rows.length} {rows.length === 1 ? "entry" : "entries"}</span></div>
          <Card><CardBody className="pt-1 pb-1"><ul className="divide-y divide-surface-variant">
            {rows.map(transaction => <TransactionRow key={transaction.id} transaction={transaction} transactions={transactions} categories={categories} accounts={accounts} editable={editable} showDate={false} />)}
          </ul></CardBody></Card>
        </section>
      ))}
    </div>
  );
}
