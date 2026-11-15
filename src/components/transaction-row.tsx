import { categoryLabel } from "@/lib/domain/categories";
import { ArrowRightLeft, Ellipsis, Pencil, Send, Trash2, Undo2 } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { CategoryIcon, categoryColorToken, RowIconTile } from "@/components/category-icon";

import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";
import { money } from "@/lib/money";
import { CHART_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";

const TRANSFER_ICON_COLOR = CHART_COLORS.categories[6];

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
  return routeFor(transaction, group, accounts);
}

function routeFor(
  transaction: Transaction,
  group: readonly Transaction[] | undefined,
  accounts: Record<string, AccountBalance>,
): string {
  const counterpart = group?.find((other) => other.id !== transaction.id);

  const own = accounts[transaction.accountId]?.name ?? "Account";
  if (!counterpart) return own;

  const other = accounts[counterpart.accountId]?.name ?? "Account";
  // "to", not "→": U+2192 is outside every font subset the app ships and tofus.
  return transaction.amount < 0 ? `${own} to ${other}` : `${other} to ${own}`;
}

/**
 * Labels for every transfer in a list, computed once.
 *
 * A page that shows only the newest days would otherwise hand the renderer the
 * full month just so each leg can find its counterpart. Resolving the labels
 * here lets the page ship only the rows it renders.
 */
export function transferRoutesFor(
  transactions: readonly Transaction[],
  accounts: Record<string, AccountBalance>,
): Record<string, string> {
  const groups = transferGroupsFor(transactions);
  const routes: Record<string, string> = {};
  for (const transaction of transactions) {
    if (transaction.type !== "transfer" || transaction.transferGroupId === null) continue;
    routes[transaction.id] = routeFor(
      transaction,
      groups.get(transaction.transferGroupId),
      accounts,
    );
  }
  return routes;
}

/**
 * Mutation buttons without a client component of their own.
 *
 * The click is handled once by TransactionActions, which wraps the list.
 */
function RowActions({
  transactionId,
  isTransfer,
  deleted,
}: {
  transactionId: string;
  isTransfer: boolean;
  deleted: boolean;
}) {
  return (
    <div className="row-actions flex shrink-0 items-center gap-0.5">
      {deleted ? (
        <button
          type="button"
          data-transaction-action="restore"
          data-transaction-id={transactionId}
          aria-label="Restore this transaction"
          className="flex size-11 items-center justify-center text-ink-faint hover:text-inflow"
        >
          <Undo2 size={14} aria-hidden="true" />
        </button>
      ) : (
        <>
          {isTransfer ? null : (
            <Link
              href={`/transactions/${transactionId}/edit`}
              aria-label="Edit this transaction"
              className="flex size-11 items-center justify-center text-ink-faint hover:text-ink"
            >
              <Pencil size={14} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            data-transaction-action="delete"
            data-transaction-id={transactionId}
            data-transaction-transfer={isTransfer ? "true" : "false"}
            aria-label="Delete this transaction"
            className="flex size-11 items-center justify-center text-ink-faint hover:text-outflow"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
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
  transferLabel,
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
  /** Precomputed route, for pages that render only part of the month. */
  transferLabel?: string | null;
}) {
  const category = transaction.categoryId ? categories[transaction.categoryId] : undefined;
  const account = accounts[transaction.accountId];
  const amount = money(transaction.amount, transaction.currency);
  const route = transferLabel !== undefined
    ? transferLabel
    : transferRoute(transaction, transactions, accounts);
  const isTransfer = transaction.type === "transfer";
  const isIncome = !isTransfer && transaction.amount > 0;
  const tileColor = isTransfer ? TRANSFER_ICON_COLOR : categoryColorToken(category);
  const titleText =
    merchant ??
    transaction.notes ??
    (category ? categoryLabel(category) : isTransfer ? "Transfer" : "Transaction");
  const amountNode = (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <MoneyAmount
        amount={amount}
        colorBySign={isIncome}
        showPlus={isIncome}
        showSign={!isTransfer}
        className={cn(
          "whitespace-nowrap text-[16px] leading-[21px] font-semibold tracking-[-0.014em]",
          isTransfer && "text-ink-muted",
          !isIncome && !isTransfer && "text-ink",
        )}
      />
      <CurrencyBadge currency={transaction.currency} />
    </div>
  );

  if (activity) {
    const contents = (
      <>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <RowIconTile color={tileColor}>
            {isTransfer ? <ArrowRightLeft size={17} aria-hidden="true" /> : <CategoryIcon category={category} size={17} />}
          </RowIconTile>
          <div className="min-w-0 flex-1">
            <span className={cn("tx-title block truncate", deleted && "text-ink-faint line-through")}>
              {titleText}
            </span>
            <span className="caption mt-0.5 flex min-w-0 items-center gap-1.5 truncate">
              <span className="truncate">
                {isTransfer
                  ? route && route !== "Account"
                    ? `Transfer · ${route}`
                    : "Transfer"
                  : (route ?? account?.name ?? "Account")}
              </span>
              {transaction.createdVia === "telegram" ? (
                <Send size={11} aria-label="Added via Telegram" className="text-brand shrink-0" />
              ) : null}
            </span>
          </div>
        </div>
        {amountNode}
      </>
    );
    const rowClass = "flex min-w-0 flex-1 items-center justify-between gap-3";
    return (
      <li className="tx-activity-row flex min-w-0 items-center gap-1">
        {editable && !deleted && !isTransfer ? (
          <Link
            href={`/transactions/${transaction.id}/edit`}
            className={rowClass}
            aria-label={`Edit ${transaction.notes ?? (category ? categoryLabel(category) : "transaction")}`}
          >
            {contents}
          </Link>
        ) : (
          <div className={rowClass}>{contents}</div>
        )}
        {editable ? (
          <details className="relative shrink-0">
            <summary
              aria-label="Transaction actions"
              className="flex size-11 list-none items-center justify-center rounded-full text-ink-faint hover:text-ink"
            >
              <Ellipsis size={18} aria-hidden="true" />
            </summary>
            <div className="glass absolute right-0 z-20 rounded-2xl p-1">
              <RowActions transactionId={transaction.id} isTransfer={isTransfer} deleted={deleted} />
            </div>
          </details>
        ) : null}
      </li>
    );
  }

  return (
    <li className={cn("grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-4", editable && "sm:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto]")}>
      <RowIconTile color={tileColor}>
        {isTransfer ? <ArrowRightLeft size={17} /> : <CategoryIcon category={category} size={17} />}
      </RowIconTile>

      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-[16px] leading-[21px] font-medium",
            deleted ? "text-ink-faint line-through" : "text-ink",
          )}
        >
          {transaction.notes ?? (category ? categoryLabel(category) : isTransfer ? "Transfer" : "Transaction")}
        </p>
        <p className="caption mt-0.5 flex min-w-0 items-center gap-1.5">
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

      {amountNode}

      {editable ? (
        <div className="col-span-2 col-start-2 flex justify-end sm:col-span-1 sm:col-start-auto">
          <RowActions transactionId={transaction.id} isTransfer={isTransfer} deleted={deleted} />
        </div>
      ) : null}
    </li>
  );
}
