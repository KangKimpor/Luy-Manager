import { ArrowRightLeft, Send } from "lucide-react";

import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { TransactionRowActions } from "@/components/transaction-row-actions";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";
import { money } from "@/lib/money";
import { CHART_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * One ledger row, with edit and delete.
 *
 * Deleting is a soft delete, and deleting either leg of a transfer takes both:
 * migration 0004 refuses a half-deleted pair, correctly, since one leg alone would
 * debit an account and credit nothing. The row says so before it happens, because
 * "delete this" quietly removing a second row elsewhere would be a surprise.
 *
 * The amount stays in the currency actually transacted. Someone who handed over
 * 20,000 riel needs to recognise that figure; showing only $4.88 makes the row
 * impossible to match against a receipt.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "ABA USD to Wing" for either leg of a transfer. */
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
  // "to", not "→": U+2192 is outside every font subset the app ships and tofus.
  return transaction.amount < 0 ? `${own} to ${other}` : `${other} to ${own}`;
}

export function TransactionRow({
  transaction,
  transactions,
  categories,
  accounts,
  editable = true,
  deleted = false,
}: {
  transaction: Transaction;
  /** The rows on screen, used to find a transfer's counterpart leg. */
  transactions: readonly Transaction[];
  categories: Record<string, Category>;
  accounts: Record<string, AccountBalance>;
  editable?: boolean;
  /** Renders the restore affordance instead of delete. */
  deleted?: boolean;
}) {
  const category = transaction.categoryId ? categories[transaction.categoryId] : undefined;
  const account = accounts[transaction.accountId];
  const amount = money(transaction.amount, transaction.currency);
  const route = transferRoute(transaction, transactions, accounts);
  const isTransfer = route !== null;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          isTransfer && "text-ink-muted",
        )}
        style={{
          backgroundColor: isTransfer
            ? "var(--color-surface-muted)"
            : `${category?.color ?? CHART_COLORS.inkFaint}1f`,
        }}
      >
        {isTransfer ? <ArrowRightLeft size={14} /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            deleted ? "text-ink-faint line-through" : "text-ink",
          )}
        >
          {transaction.notes ?? category?.name ?? (isTransfer ? "Transfer" : "Transaction")}
        </p>
        <p className="text-ink-faint flex items-center gap-1.5 text-xs">
          <span>{formatDate(transaction.occurredAt)}</span>
          {route ? (
            <span className="truncate">· {route}</span>
          ) : account ? (
            <span className="truncate">· {account.name}</span>
          ) : null}
          {transaction.createdVia === "telegram" ? (
            <Send size={11} aria-label="Added via Telegram" className="text-brand" />
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <MoneyAmount
          amount={amount}
          // A transfer leg is not income or spending, so colouring it green or red
          // would read as money gained or lost when the total did not change.
          colorBySign={!isTransfer}
          showPlus={!isTransfer}
          className="text-sm font-semibold"
        />
        <CurrencyBadge currency={transaction.currency} />
      </div>

      {editable ? (
        <TransactionRowActions
          transactionId={transaction.id}
          isTransfer={isTransfer}
          deleted={deleted}
        />
      ) : null}
    </li>
  );
}
