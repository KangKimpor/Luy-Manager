import { categoryLabel } from "@/lib/domain/categories";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Ellipsis, Send } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { CategoryIcon } from "@/components/category-icon";

import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { TransactionRowActions } from "@/components/transaction-row-actions";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";
import { money } from "@/lib/money";
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

const CAMBODIA_SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Phnom_Penh",
});

function formatDate(iso: string): string {
  return CAMBODIA_SHORT_DATE_FORMAT.format(new Date(iso));
}

const transferGroupsByList = new WeakMap<readonly Transaction[], Map<string, Transaction[]>>();

function transferGroupsFor(transactions: readonly Transaction[]): Map<string, Transaction[]> {
  const cached = transferGroupsByList.get(transactions);
  if (cached) return cached;
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.transferGroupId) {
      const list = groups.get(tx.transferGroupId);
      if (list) list.push(tx);
      else groups.set(tx.transferGroupId, [tx]);
    }
  }
  transferGroupsByList.set(transactions, groups);
  return groups;
}

/** "ABA USD to Wing" for either leg of a transfer. */
function transferRoute(
  transaction: Transaction,
  transactions: readonly Transaction[],
  accounts: Record<string, AccountBalance>,
): string | null {
  if (transaction.type !== "transfer" || transaction.transferGroupId === null) return null;

  const group = transferGroupsFor(transactions).get(transaction.transferGroupId);
  const counterpart = group?.find((other) => other.id !== transaction.id);

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
  showDate = true,
  activity = false,
  merchant,
}: {
  transaction: Transaction;
  /** The rows on screen, used to find a transfer's counterpart leg. */
  transactions: readonly Transaction[];
  categories: Record<string, Category>;
  accounts: Record<string, AccountBalance>;
  editable?: boolean;
  /** Renders the restore affordance instead of delete. */
  deleted?: boolean;
  showDate?: boolean;
  activity?: boolean;
  merchant?: string;
}) {
  const category = transaction.categoryId ? categories[transaction.categoryId] : undefined;
  const account = accounts[transaction.accountId];
  const amount = money(transaction.amount, transaction.currency);
  const route = transferRoute(transaction, transactions, accounts);
  const isTransfer = transaction.type === "transfer";

  if (activity) {
    const contents = <>
      <span className="flex min-w-0 flex-col items-center gap-1 text-ink-muted">
        {isTransfer ? <ArrowRightLeft size={19} aria-hidden="true" /> : <CategoryIcon category={category} size={19} />}
        <span className="w-full truncate text-center text-[10px]">{isTransfer ? "Transfer" : categoryLabel(category)}</span>
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-xs font-semibold text-ink", deleted && "line-through")}>{merchant ?? transaction.notes ?? (category ? categoryLabel(category) : "Transaction")}</span>
        <span className="mt-1 block truncate text-[10px] text-ink-faint">{route ?? account?.name ?? "Account"}</span>
      </span>
      <MoneyAmount amount={amount} colorBySign={!isTransfer} showPlus={!isTransfer} className="whitespace-nowrap text-xs font-semibold tracking-tight" />
    </>;
    const rowClass = "grid min-h-14 min-w-0 flex-1 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-2 py-3";
    return <li className="flex min-w-0 items-center gap-1">
      {editable && !deleted && !isTransfer ? <Link href={`/transactions/${transaction.id}/edit`} className={rowClass} aria-label={`Edit ${transaction.notes ?? (category ? categoryLabel(category) : "transaction")}`}>{contents}</Link> : <div className={rowClass}>{contents}</div>}
      {editable ? <details className="relative shrink-0">
        <summary aria-label="Transaction actions" className="flex size-11 list-none items-center justify-center rounded-xl text-ink-faint"><Ellipsis size={18} aria-hidden="true" /></summary>
        <div className="absolute right-0 z-10 rounded-xl border border-surface-variant bg-surface p-1 shadow-card">
          <TransactionRowActions transactionId={transaction.id} isTransfer={isTransfer} deleted={deleted} />
        </div>
      </details> : null}
    </li>;
  }

  return (
    <li className={cn("grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-4", editable && "sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto]")}>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10",
          isTransfer ? "bg-surface-container text-ink-muted" : transaction.amount < 0 ? "bg-outflow-soft text-outflow" : "bg-inflow-soft text-inflow",
        )}
      >
        {isTransfer ? <ArrowRightLeft size={17} /> : transaction.amount < 0 ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}
      </span>

      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-sm font-semibold",
            deleted ? "text-ink-faint line-through" : "text-ink",
          )}
        >
          {transaction.notes ?? (category ? categoryLabel(category) : isTransfer ? "Transfer" : "Transaction")}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-faint">
          {showDate ? <span className="shrink-0">{formatDate(transaction.occurredAt)}</span> : null}
          {route ? (
            <span className="truncate">{showDate ? "· " : ""}{route}</span>
          ) : account ? (
            <span className="truncate">{showDate ? "· " : ""}{account.name}</span>
          ) : null}
          {transaction.createdVia === "telegram" ? (
            <Send size={11} aria-label="Added via Telegram" className="text-brand" />
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <MoneyAmount
          amount={amount}
          // A transfer leg is not income or spending, so colouring it green or red
          // would read as money gained or lost when the total did not change.
          colorBySign={!isTransfer}
          showPlus={!isTransfer}
          className="whitespace-nowrap text-sm font-semibold tracking-tight"
        />
        <CurrencyBadge currency={transaction.currency} />
      </div>

      {editable ? (
        <div className="col-span-2 col-start-2 flex justify-end sm:col-span-1 sm:col-start-auto">
        <TransactionRowActions
          transactionId={transaction.id}
          isTransfer={isTransfer}
          deleted={deleted}
        />
        </div>
      ) : null}
    </li>
  );
}
