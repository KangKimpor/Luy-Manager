import { MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { Category } from "@/lib/domain/types";
import type { CategoryTotal } from "@/lib/domain/transactions";
import { CHART_COLORS } from "@/lib/theme";
import { categoryLabel } from "@/lib/domain/categories";
import { CategoryIcon } from "@/components/category-icon";

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
        <CardTitle>Where it went</CardTitle>
        <p className="mt-1 text-xs text-ink-faint">Spending by category</p>
      </CardHeader>
      <CardBody>
        {shown.length === 0 ? (
          <p className="text-ink-faint py-6 text-center text-sm">Nothing spent yet.</p>
        ) : (
          <ul className="stagger-children space-y-5">
            {shown.map((entry) => {
              const category = entry.categoryId ? categories[entry.categoryId] : undefined;
              const name = categoryLabel(category);
              const color = category?.color ?? CHART_COLORS.inkFaint;
              const percent = Math.round(entry.share * 100);

              return (
                <li key={entry.categoryId ?? "none"}>
                  <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-ink"><CategoryIcon category={category} size={16} /><span className="truncate">{name}</span></span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <MoneyAmount amount={entry.total} className="text-xs font-semibold" />
                      <span className="w-8 text-right text-[11px] text-ink-faint">{percent}%</span>
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
                    className="bg-surface-variant h-1.5 w-full overflow-hidden rounded-full"
                  >
                    <div
                      className="progress-fill h-full rounded-full"
                      style={{ width: `${Math.min(100, entry.share * 100)}%`, backgroundColor: color }}
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
