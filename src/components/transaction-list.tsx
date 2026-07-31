import { ArrowRightLeft, Send } from "lucide-react";

import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";
import { money } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Recent transactions.
 *
 * Each row shows the amount in the currency it was actually paid in, not the
 * base currency. Someone who spent 20,000 riel needs to recognise the figure
 * they handed over; silently showing $4.88 makes the row hard to match against
 * memory or a receipt.
 *
 * Transfers appear as both of their legs, labelled with the direction. Collapsing
 * them to one row would have to pick one currency to show, which for a
 * cross-currency transfer means hiding half of what happened — and both legs are
 * what the two account balances actually moved by.
 */

function formatTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/**
 * "ABA USD → Wing" for either leg of a transfer.
 *
 * Derived by finding the counterpart leg in the same group, so the label reads
 * the same on both rows and the pair is recognisable as one action.
 */
function transferRoute(
  transaction: Transaction,
  transactions: readonly Transaction[],
  accounts: Record<string, AccountBalance>,
): string | null {
  if (transaction.type !== "transfer" || transaction.transferGroupId === null) return null;

  const counterpart = transactions.find(
    (other) =>
      other.transferGroupId === transaction.transferGroupId && other.id !== transaction.id,
  );

  const own = accounts[transaction.accountId]?.name ?? "Account";
  if (!counterpart) return own;

  const other = accounts[counterpart.accountId]?.name ?? "Account";

  // Direction from the sign, so the label is identical on both legs.
  return transaction.amount < 0 ? `${own} → ${other}` : `${other} → ${own}`;
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
              const route = transferRoute(transaction, recent, accounts);
              const isTransfer = route !== null;

              return (
                <li key={transaction.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      isTransfer && "text-ink-muted",
                    )}
                    style={{
                      backgroundColor: isTransfer
                        ? "var(--color-surface-muted)"
                        : `${category?.color ?? "#9aa1ad"}1f`,
                    }}
                  >
                    {isTransfer ? <ArrowRightLeft size={14} /> : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-medium">
                      {transaction.notes ?? category?.name ?? (isTransfer ? "Transfer" : "Transaction")}
                    </p>
                    <p className="text-ink-faint flex items-center gap-1.5 text-xs">
                      <span>{formatTime(transaction.occurredAt)}</span>
                      {/* For a transfer the route replaces the single account
                          name, since one account alone does not describe it. */}
                      {route ? (
                        <span className="truncate">· {route}</span>
                      ) : account ? (
                        <span>· {account.name}</span>
                      ) : null}
                      {transaction.createdVia === "telegram" ? (
                        <Send size={11} aria-label="Added via Telegram" className="text-brand" />
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <MoneyAmount
                      amount={amount}
                      // A transfer leg is not income or spending, so colouring it
                      // green or red would read as money gained or lost when the
                      // total did not change.
                      colorBySign={!isTransfer}
                      showPlus={!isTransfer}
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
