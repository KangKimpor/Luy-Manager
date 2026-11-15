import { AppLink as Link } from "@/components/app-link";
import { categoryColorToken } from "@/components/category-icon";
import { MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryLabel } from "@/lib/domain/categories";
import type { CategoryTotal } from "@/lib/domain/transactions";
import type { Category } from "@/lib/domain/types";

/**
 * Spending by category bar list.
 *
 * Uses CSS chart colour tokens from `globals.css` rather than inline hex values.
 */
export function CategoryBreakdown({
  totals,
  categories,
  limit = 6,
  home = false,
}: {
  totals: readonly CategoryTotal[];
  categories: Record<string, Category>;
  limit?: number;
  /** Renders with the Home screen section heading and "Open insights" link. */
  home?: boolean;
}) {
  const shown = totals.slice(0, limit);

  const bars =
    shown.length === 0 ? (
      <p className="text-ink-faint py-6 text-center text-sm">Nothing spent yet.</p>
    ) : (
      <ul className="cat-bars">
        {shown.map((entry) => {
          const category = entry.categoryId ? categories[entry.categoryId] : undefined;
          const name = categoryLabel(category);
          const color = categoryColorToken(category);
          const percent = Math.round(entry.share * 100);
          const widthPercent = Math.min(100, Math.max(4, percent));

          return (
            <li key={entry.categoryId ?? "none"}>
              <div className="cat-bar-top">
                <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                  <span
                    aria-hidden="true"
                    className="dot"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate">{name}</span>
                  <span className="caption shrink-0">{percent}%</span>
                </span>
                <MoneyAmount amount={entry.total} className="shrink-0 font-semibold text-ink" />
              </div>

              <div
                role="img"
                aria-label={`${name}: ${percent} percent of spending`}
                className="cat-bar-track"
              >
                <div
                  className="cat-bar-fill"
                  style={{ width: `${widthPercent}%`, backgroundColor: color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );

  if (home) {
    return (
      <section className="sec-wrap order-6 lg:order-none" aria-label="Top spending categories">
        <div className="sec-head">
          <h2 className="sec-title">Where it went</h2>
          <Link href="/reports" className="text-link">
            Open insights
          </Link>
        </div>
        <div className="proto-card">{bars}</div>
      </section>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where it went</CardTitle>
        <p className="mt-1 text-xs text-ink-faint">Spending by category</p>
      </CardHeader>
      <CardBody>{bars}</CardBody>
    </Card>
  );
}
