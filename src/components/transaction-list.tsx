import Link from "next/link";

import { TransactionRow } from "@/components/transaction-row";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";

/**
 * Recent transactions on the dashboard.
 *
 * Rows are rendered by `TransactionRow`, the same component the full ledger uses, so
 * the transfer labelling and colour rules live in one place. Here they are
 * read-only: the dashboard is for reading, and editing has a page of its own.
 */
export function TransactionList({
  transactions,
  categories,
  accounts,
  limit = 8,
}: {
  transactions: readonly Transaction[];
  categories: Record<string, Category>;
  accounts: Record<string, AccountBalance>;
  limit?: number;
}) {
  const recent = [...transactions]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);

  return (
    <Card>
      <CardHeader className="flex items-baseline justify-between gap-2">
        <CardTitle>Recent</CardTitle>
        {transactions.length > recent.length ? (
          <Link href="/transactions" className="text-brand text-xs font-semibold">
            See all {transactions.length}
          </Link>
        ) : null}
      </CardHeader>
      <CardBody>
        {recent.length === 0 ? (
          <p className="text-ink-faint py-6 text-center text-sm">No transactions yet.</p>
        ) : (
          <ul className="divide-border-subtle/70 divide-y">
            {recent.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                // Passed the visible rows so a transfer can find its counterpart
                // leg and label the route.
                transactions={recent}
                categories={categories}
                accounts={accounts}
                editable={false}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
