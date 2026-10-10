import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";

import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionHistory } from "@/components/transaction-history";
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
 * database (on the `(user_id, occurred_at desc) where deleted_at is null` index
 * from migration 0001) rather than by fetching a whole history and cutting it down
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
    <div className="page-enter mx-auto max-w-4xl space-y-5 sm:space-y-6">
      {/* The screen name lives in the app bar, so this is only the result count. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="text-sm font-medium text-ink">Every money move, in one place.</p><p className="mt-1 text-xs text-ink-faint">{result.total === 0 ? "No matching entries" : result.transactions.length === 0 ? "No entries on this page" : `Showing ${shownFrom} to ${shownTo} of ${result.total}`}</p></div>
        <Link href="/add" aria-label="Add a transaction" className="card-interactive flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-surface"><Plus size={20} aria-hidden="true" /></Link>
      </div>

      <TransactionFilters
        key={`${monthParam(period)}:${params.q ?? ""}`}
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
          <CardBody className="py-8 text-center">
            <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Search size={22} aria-hidden="true" /></span>
            <p className="font-semibold text-ink">Nothing here yet</p>
            <p className="mt-2 text-sm text-ink-muted">
              No transactions for {period.label} with these filters.
            </p>
            <Link href={`/transactions?month=${monthParam(period)}`} className="card-interactive mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand">Clear filters</Link>
          </CardBody>
        </Card>
      ) : (
        <TransactionHistory transactions={result.transactions} categories={categories2} accounts={lookup} editable={!isDemoMode()} />
      )}

      {/* Prev/next rather than numbered pages: on a phone, two large targets beat
          a row of small ones, and the total above already gives a sense of scale. */}
      {result.total > result.pageSize ? (
        <nav className="flex items-center justify-between gap-2 rounded-card border border-surface-variant bg-surface p-2 text-sm shadow-card" aria-label="Pages">
          {/*
            Chevron icons rather than "←" and "→". The arrow characters are outside
            every font subset the app ships and rendered as tofu boxes.
          */}
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              rel="prev"
              className="card-interactive flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-brand"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Newer
            </Link>
          ) : (
            <span className="flex min-h-11 items-center gap-1 px-3 text-xs text-ink-faint">
              <ChevronLeft size={16} aria-hidden="true" />
              Newer
            </span>
          )}

          <span className="text-ink-muted text-xs">
            Page {page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}
          </span>

          {result.hasMore ? (
            <Link
              href={pageHref(page + 1)}
              rel="next"
              className="card-interactive flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-brand"
            >
              Older
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <span className="flex min-h-11 items-center gap-1 px-3 text-xs text-ink-faint">
              Older
              <ChevronRight size={16} aria-hidden="true" />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
