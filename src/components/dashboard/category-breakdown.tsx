import { MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { Category } from "@/lib/domain/types";
import type { CategoryTotal } from "@/lib/domain/transactions";
import { CHART_COLORS } from "@/lib/theme";

/**
 * Spending by category, PRD Section 11.
 *
 * A ranked bar list rather than a pie chart. With ten-plus categories a pie
 * becomes a colour-matching exercise, and comparing slice areas is harder than
 * comparing bar lengths. The share percentage carries the same information a pie
 * would, and the list stays readable on a phone.
 */

export function CategoryBreakdown({
  totals,
  categories,
  limit = 6,
}: {
  totals: readonly CategoryTotal[];
  categories: Record<string, Category>;
  limit?: number;
}) {
  const shown = totals.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Spending</CardTitle>
      </CardHeader>
      <CardBody>
        {shown.length === 0 ? (
          <p className="text-ink-faint py-6 text-center text-sm">Nothing spent yet.</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((entry) => {
              const category = entry.categoryId ? categories[entry.categoryId] : undefined;
              const name = category?.name ?? "Uncategorised";
              const color = category?.color ?? CHART_COLORS.inkFaint;
              const percent = Math.round(entry.share * 100);

              return (
                <li key={entry.categoryId ?? "none"}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-ink font-medium">{name}</span>
                    <span className="flex items-baseline gap-2">
                      <MoneyAmount amount={entry.total} className="font-semibold" />
                      <span className="text-ink-faint text-xs">{percent}%</span>
                    </span>
                  </div>

                  {/*
                    role="img" with an aria-label: a decorative bar conveys the
                    proportion visually, and the label states it for screen
                    readers without them having to infer it from the width.
                  */}
                  <div
                    role="img"
                    aria-label={`${name}: ${percent} percent of spending`}
                    className="bg-surface-muted h-1.5 w-full overflow-hidden rounded-full"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(entry.share * 100, 2)}%`, backgroundColor: color }}
                    />
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
