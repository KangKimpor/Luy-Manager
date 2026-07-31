import Link from "next/link";

import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionRow } from "@/components/transaction-row";
import { Card, CardBody } from "@/components/ui/card";
import { isDemoMode } from "@/lib/auth";
import { accountLookup, listAccountBalances } from "@/lib/data/accounts";
import { listCategories, categoryLookup } from "@/lib/data/reference";
import { DEFAULT_PAGE_SIZE, listTransactions } from "@/lib/data/transactions";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/domain/types";
import { monthFromParam, monthParam } from "@/lib/period";

/**
 * The full ledger, filtered and paged (PRD Section 8).
 *
 * The dashboard's recent list is a `slice(0, 8)` of one month. This is the view for
 * finding a specific transaction, so the filtering and paging happen in the
 * database — on the `(user_id, occurred_at desc) where deleted_at is null` index
 * from migration 0001 — rather than by fetching a whole history and cutting it down
 * in the browser.
 *
 * Every filter lives in the URL. That makes a filtered view shareable and
 * bookmarkable, keeps the arithmetic on the server, and means the back button does
 * what the user expects.
 */

function parseType(raw: string | undefined): TransactionType | undefined {
  return raw && (TRANSACTION_TYPES as readonly string[]).includes(raw)
    ? (raw as TransactionType)
    : undefined;
}

function parsePage(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export default async function TransactionsPage(props: {
  searchParams: Promise<{
    month?: string;
    account?: string;
    category?: string;
    type?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const params = await props.searchParams;
  const period = monthFromParam(params.month);
  const page = parsePage(params.page);

  const filter = {
    from: period.from,
    to: period.to,
    accountId: params.account || undefined,
    categoryId: params.category || undefined,
    type: parseType(params.type),
    search: params.q || undefined,
  };

  const [result, accounts, categories, lookup, categories2] = await Promise.all([
    listTransactions(filter, { number: page, size: DEFAULT_PAGE_SIZE }),
    listAccountBalances(),
    listCategories(),
    accountLookup(),
    categoryLookup(),
  ]);

  const shownFrom = result.total === 0 ? 0 : (page - 1) * result.pageSize + 1;
  const shownTo = (page - 1) * result.pageSize + result.transactions.length;

  /** Preserve every filter when changing page. */
  function pageHref(target: number): string {
    const next = new URLSearchParams();
    next.set("month", monthParam(period));
    if (params.account) next.set("account", params.account);
    if (params.category) next.set("category", params.category);
    if (params.type) next.set("type", params.type);
    if (params.q) next.set("q", params.q);
    if (target > 1) next.set("page", String(target));
    return `/transactions?${next.toString()}`;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">Transactions</h1>
        <p className="text-ink-muted text-sm">
          {result.total === 0
            ? "Nothing matches these filters."
            : `Showing ${shownFrom}–${shownTo} of ${result.total}`}
        </p>
      </header>

      <TransactionFilters
        accounts={accounts}
        categories={categories}
        month={monthParam(period)}
        selected={{
          account: params.account,
          category: params.category,
          type: params.type,
          q: params.q,
        }}
      />

      {result.transactions.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-ink-faint py-6 text-center text-sm">
              No transactions for {period.label} with these filters.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <ul className="divide-border-subtle/70 divide-y">
              {result.transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  transactions={result.transactions}
                  categories={categories2}
                  accounts={lookup}
                  editable={!isDemoMode()}
                />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Prev/next rather than numbered pages: on a phone, two large targets beat
          a row of small ones, and the total above already gives a sense of scale. */}
      {result.total > result.pageSize ? (
        <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Pages">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-brand font-semibold">
              ← Newer
            </Link>
          ) : (
            <span className="text-ink-faint">← Newer</span>
          )}

          <span className="text-ink-muted text-xs">
            Page {page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}
          </span>

          {result.hasMore ? (
            <Link href={pageHref(page + 1)} className="text-brand font-semibold">
              Older →
            </Link>
          ) : (
            <span className="text-ink-faint">Older →</span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
