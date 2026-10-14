"use client";

import { Search, X } from "@/components/app-icon";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { Card, CardBody } from "@/components/ui/card";
import type { AccountBalance, Category } from "@/lib/domain/types";
import { TRANSACTION_TYPES } from "@/lib/domain/types";
import { activityHref, type ActivityParams } from "@/lib/activity-url";
import { categoryLabel, groupedCategories } from "@/lib/domain/categories";

/**
 * Filters for the ledger view.
 *
 * Every change navigates rather than mutating local state, so the filtered view is
 * a real URL: shareable, bookmarkable, and correct under the back button. The
 * server does the filtering, which is also why there is no client-side list to keep
 * in sync.
 */

const TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  refund: "Refund",
  adjustment: "Adjustment",
};

export function TransactionFilters({
  accounts,
  categories,
  month,
  selected,
}: {
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
  month: string;
  selected: ActivityParams;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(selected.q ?? "");
  const [pending, startTransition] = useTransition();
  const [optimistic, select] = useOptimistic<Record<string, string | undefined>, Record<string, string | undefined>>(
    { ...selected, month }, (current, patch) => ({ ...current, ...patch }),
  );

  /** Rebuild the URL with one filter changed, dropping the page. */
  function go(patch: Record<string, string | undefined>) {
    startTransition(() => {
      select(patch);
      router.push(activityHref(optimistic, patch));
    });
  }

  const hasFilters = Boolean(
    optimistic.account || optimistic.category || optimistic.type || optimistic.q,
  );

  return (
    <Card>
      <CardBody className="space-y-4 pt-5" aria-busy={pending}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            go({ q: search.trim() === "" ? undefined : search.trim() });
          }}
          className="flex gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              aria-hidden="true"
              className="text-ink-faint absolute top-1/2 left-3 -translate-y-1/2"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint min-h-11 w-full border pr-3 pl-9 text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-brand rounded-card min-h-11 px-4 text-sm font-semibold text-on-action"
          >
            Search
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={optimistic.account ?? ""}
            onChange={(event) => go({ account: event.target.value || undefined })}
            aria-label="Filter by account"
            className="border-border-subtle bg-surface rounded-pill text-ink-muted min-h-11 border px-3 text-xs"
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {account.name}
              </option>
            ))}
          </select>

          <select
            value={optimistic.category ?? ""}
            onChange={(event) => go({ category: event.target.value || undefined })}
            aria-label="Filter by category"
            className="border-border-subtle bg-surface rounded-pill text-ink-muted min-h-11 border px-3 text-xs"
          >
            <option value="">All categories</option>
            <option value="none">Uncategorised</option>
            {groupedCategories(categories).map((group) => <optgroup key={group.name} label={group.name}>{group.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category)}
              </option>
            ))}</optgroup>)}
          </select>

          <select
            value={optimistic.type ?? ""}
            onChange={(event) => go({ type: event.target.value || undefined })}
            aria-label="Filter by type"
            className="border-border-subtle bg-surface rounded-pill text-ink-muted min-h-11 border px-3 text-xs"
          >
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                go({ account: undefined, category: undefined, type: undefined, q: undefined });
              }}
              className="rounded-pill text-ink-muted hover:text-ink flex min-h-11 items-center gap-1 px-2 text-xs font-medium"
            >
              <X size={13} aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>
        <p role="status" data-pending={pending || undefined} className="pending-status text-brand text-sm">{pending ? "Updating activity..." : ""}</p>
      </CardBody>
    </Card>
  );
}
