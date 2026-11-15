"use client";

import { Search, X } from "@/components/app-icon";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import type { AccountBalance, Category } from "@/lib/domain/types";
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

const TYPE_CHIPS = [
  { value: "", label: "All" },
  { value: "expense", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
] as const;

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
    <div className="space-y-2.5" aria-busy={pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go({ q: search.trim() === "" ? undefined : search.trim() });
        }}
        className="flex items-center gap-2"
      >
        <div className="search-wrap">
          <span className="search-icon">
            <Search size={16} aria-hidden="true" />
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="search-input"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                if (optimistic.q) go({ q: undefined });
              }}
              aria-label="Clear search"
              className="search-clear-btn"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          className="bg-brand text-on-action rounded-pill min-h-11 shrink-0 px-4 text-sm font-semibold"
        >
          Search
        </button>
      </form>

      <div className="chip-scroll" role="group" aria-label="Filter transactions">
        {TYPE_CHIPS.map((chip) => {
          const active = (optimistic.type ?? "") === chip.value;
          return (
            <button
              key={chip.value || "all"}
              type="button"
              aria-pressed={active}
              onClick={() => go({ type: chip.value || undefined })}
              className="filter-chip"
            >
              {chip.label}
            </button>
          );
        })}

        <select
          value={optimistic.category ?? ""}
          onChange={(event) => go({ category: event.target.value || undefined })}
          aria-label="Filter by category"
          className={optimistic.category ? "filter-chip bg-brand text-on-action pr-3" : "filter-chip pr-3"}
        >
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {groupedCategories(categories).map((group) => (
            <optgroup key={group.name} label={group.name}>
              {group.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabel(category)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          value={optimistic.account ?? ""}
          onChange={(event) => go({ account: event.target.value || undefined })}
          aria-label="Filter by account"
          className="filter-chip pr-3"
        >
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.accountId} value={account.accountId}>
              {account.name}
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
            className="filter-chip text-brand"
          >
            <X size={13} aria-hidden="true" />
            Clear
          </button>
        ) : null}
      </div>

      {pending ? (
        <p role="status" data-pending={pending || undefined} className="pending-status text-brand px-1 text-xs">
          Updating activity...
        </p>
      ) : null}
    </div>
  );
}
