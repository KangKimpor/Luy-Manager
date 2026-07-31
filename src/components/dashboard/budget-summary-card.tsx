import Link from "next/link";

import { MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetProgress } from "@/lib/domain/budgets";
import type { Category } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Budget progress bars.
 *
 * Ordered worst-first by `summarizeBudgets`, because the budget worth looking at is
 * the one nearest to being blown, not the one that happens to sort first
 * alphabetically.
 *
 * The bar is capped at 100% width while the figure beside it is not: someone who
 * has spent 240% of a budget needs to see 240%, but a bar three times the width of
 * its track would break the layout and read as a rendering fault.
 */

const TONE = {
  under: { bar: "bg-inflow", text: "text-ink" },
  warning: { bar: "bg-amber-500", text: "text-ink" },
  over: { bar: "bg-outflow", text: "text-outflow" },
} as const;

export function BudgetSummaryCard({
  progress,
  categories,
  limit = 4,
}: {
  progress: readonly BudgetProgress[];
  categories: Record<string, Category>;
  limit?: number;
}) {
  const shown = progress.slice(0, limit);

  return (
    <Card>
      <CardHeader className="flex items-baseline justify-between gap-2">
        <CardTitle>Budgets</CardTitle>
        <Link href="/budgets" className="text-brand text-xs font-semibold">
          Manage
        </Link>
      </CardHeader>
      <CardBody>
        <ul className="space-y-3">
          {shown.map((entry) => {
            const tone = TONE[entry.status];
            const name =
              entry.budget.name ??
              (entry.budget.categoryId
                ? categories[entry.budget.categoryId]?.name ?? "Category"
                : "Everything");

            return (
              <li key={entry.budget.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-ink truncate font-medium">{name}</span>
                  <span className={cn("shrink-0 tabular text-xs", tone.text)}>
                    <MoneyAmount amount={entry.spent} /> of{" "}
                    <MoneyAmount amount={entry.limit} />
                  </span>
                </div>

                <div
                  className="bg-surface-muted h-1.5 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={Math.round(entry.fraction * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${name} budget`}
                >
                  <div
                    className={cn("h-full rounded-full", tone.bar)}
                    // Clamped so an overspend cannot render wider than its track.
                    style={{ width: `${Math.min(100, Math.round(entry.fraction * 100))}%` }}
                  />
                </div>

                <p className="text-ink-faint text-xs">
                  {entry.status === "over" ? (
                    <span className="text-outflow font-medium">
                      <MoneyAmount amount={entry.remaining} /> over
                    </span>
                  ) : (
                    <>
                      <MoneyAmount amount={entry.remaining} /> left
                    </>
                  )}
                  {" · "}
                  {entry.daysRemaining === 0
                    ? "last day"
                    : `${entry.daysRemaining} day${entry.daysRemaining === 1 ? "" : "s"} left`}
                </p>
              </li>
            );
          })}
        </ul>

        {progress.length > shown.length ? (
          <Link
            href="/budgets"
            className="text-ink-muted mt-3 block text-center text-xs font-medium"
          >
            {progress.length - shown.length} more
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}
