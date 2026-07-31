import { Send } from "lucide-react";

import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";
import { money } from "@/lib/money";

/**
 * Recent transactions.
 *
 * Each row shows the amount in the currency it was actually paid in, not the
 * base currency. Someone who spent 20,000 riel needs to recognise the figure
 * they handed over; silently showing $4.88 makes the row hard to match against
 * memory or a receipt.
 */

function formatTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

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
      <CardHeader>
        <CardTitle>Recent</CardTitle>
      </CardHeader>
      <CardBody>
        {recent.length === 0 ? (
          <p className="text-ink-faint py-6 text-center text-sm">No transactions yet.</p>
        ) : (
          <ul className="divide-border-subtle/70 divide-y">
            {recent.map((transaction) => {
              const category = transaction.categoryId
                ? categories[transaction.categoryId]
                : undefined;
              const account = accounts[transaction.accountId];
              const amount = money(transaction.amount, transaction.currency);

              return (
                <li key={transaction.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="size-9 shrink-0 rounded-full"
                    style={{ backgroundColor: `${category?.color ?? "#9aa1ad"}1f` }}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-medium">
                      {transaction.notes ?? category?.name ?? "Transaction"}
                    </p>
                    <p className="text-ink-faint flex items-center gap-1.5 text-xs">
                      <span>{formatTime(transaction.occurredAt)}</span>
                      {account ? <span>· {account.name}</span> : null}
                      {transaction.createdVia === "telegram" ? (
                        <Send size={11} aria-label="Added via Telegram" className="text-brand" />
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <MoneyAmount
                      amount={amount}
                      colorBySign
                      showPlus
                      className="text-sm font-semibold"
                    />
                    <CurrencyBadge currency={transaction.currency} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
