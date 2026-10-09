import Link from "next/link";
import { ArrowUpRight, ReceiptText } from "lucide-react";

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
    <Card className="overflow-hidden">
      <CardHeader className="flex items-center justify-between gap-2">
        <div><CardTitle>Recent activity</CardTitle><p className="mt-1 text-xs text-ink-faint">Your latest money moves</p></div>
          <Link href="/transactions" className="card-interactive flex min-h-11 items-center gap-1 text-xs font-semibold text-brand">
            View all <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
      </CardHeader>
      <CardBody>
        {recent.length === 0 ? (
          <div className="py-8 text-center"><span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><ReceiptText size={22} aria-hidden="true" /></span><p className="font-semibold text-ink">A fresh start</p><p className="mt-1 text-sm text-ink-muted">Your transactions will appear here.</p><Link href="/add" className="card-interactive mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand">Add a transaction</Link></div>
        ) : (
          <ul className="stagger-children divide-y divide-surface-variant">
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
