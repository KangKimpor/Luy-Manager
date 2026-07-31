"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardBody } from "@/components/ui/card";
import type { AccountBalance, Category } from "@/lib/domain/types";
import { TRANSACTION_TYPES } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

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
  selected: {
    account?: string;
    category?: string;
    type?: string;
    q?: string;
  };
}) {
  const router = useRouter();
  const [search, setSearch] = useState(selected.q ?? "");

  /** Rebuild the URL with one filter changed, dropping the page. */
  function go(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();

    // month is part of the merge, not set separately, or a patch changing it would
    // be silently overwritten by the current value.
    const merged: Record<string, string | undefined> = {
      month,
      account: selected.account,
      category: selected.category,
      type: selected.type,
      q: selected.q,
      ...patch,
    };

    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }

    // Changing a filter must reset paging: page 4 of a narrower result set is
    // usually empty, which reads as "no transactions" rather than "wrong page".
    router.push(`/transactions?${params.toString()}`);
  }

  const hasFilters = Boolean(
    selected.account || selected.category || selected.type || selected.q,
  );

  return (
    <Card>
      <CardBody className="space-y-3 pt-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            go({ q: search.trim() === "" ? undefined : search.trim() });
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
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
            className="bg-brand rounded-card min-h-11 px-4 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          <select
            value={selected.account ?? ""}
            onChange={(event) => go({ account: event.target.value || undefined })}
            aria-label="Filter by account"
            className="border-border-subtle bg-surface rounded-pill text-ink-muted min-h-9 border px-3 text-xs"
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {account.name}
              </option>
            ))}
          </select>

          <select
            value={selected.category ?? ""}
            onChange={(event) => go({ category: event.target.value || undefined })}
            aria-label="Filter by category"
            className="border-border-subtle bg-surface rounded-pill text-ink-muted min-h-9 border px-3 text-xs"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={selected.type ?? ""}
            onChange={(event) => go({ type: event.target.value || undefined })}
            aria-label="Filter by type"
            className="border-border-subtle bg-surface rounded-pill text-ink-muted min-h-9 border px-3 text-xs"
          >
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>

          <input
            type="month"
            value={month}
            onChange={(event) => {
              if (event.target.value) go({ month: event.target.value });
            }}
            aria-label="Month"
            className={cn(
              "border-border-subtle bg-surface rounded-pill text-ink-muted min-h-9 border px-3 text-xs",
            )}
          />

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                router.push(`/transactions?month=${month}`);
              }}
              className="rounded-pill text-ink-muted hover:text-ink flex min-h-9 items-center gap-1 px-2 text-xs font-medium"
            >
              <X size={13} aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
