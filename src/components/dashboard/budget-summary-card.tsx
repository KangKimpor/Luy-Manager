import { AppLink as Link } from "@/components/app-link";
import { BudgetPaceCaption, BudgetProgressBar } from "@/components/budget-progress-bar";
import { CategoryIcon, categoryColorToken, RowIconTile } from "@/components/category-icon";
import { MoneyAmount } from "@/components/money-amount";
import type { BudgetProgress } from "@/lib/domain/budgets";
import { categoryLabel } from "@/lib/domain/categories";
import type { Category } from "@/lib/domain/types";

/**
 * Budget progress bars, ordered worst-first by `summarizeBudgets`.
 *
 * Bar width is clamped to 100% while remaining/over amount reports the true figure.
 */
export function BudgetSummaryCard({
  progress,
  categories,
  limit = 3,
}: {
  progress: readonly BudgetProgress[];
  categories: Record<string, Category>;
  limit?: number;
}) {
  const shown = progress.slice(0, limit);

  return (
    <section className="sec-wrap order-5 lg:order-none" aria-label="Budgets summary">
      <div className="sec-head">
        <h2 className="sec-title">Budgets</h2>
        <Link href="/budgets" className="text-link">
          See all
        </Link>
      </div>

      <div className="proto-card">
        <ul className="budget-list">
          {shown.map((entry) => {
            const category = entry.budget.categoryId
              ? categories[entry.budget.categoryId]
              : undefined;
            const name =
              entry.budget.name ??
              (entry.budget.categoryId ? categoryLabel(category) : "Everything");
            const color = categoryColorToken(category);

            return (
              <li key={entry.budget.id} className="budget-row">
                <div className="budget-top">
                  <div className="budget-id">
                    <RowIconTile color={color}>
                      <CategoryIcon category={category} size={17} />
                    </RowIconTile>
                    <span className="budget-name">{name}</span>
                  </div>
                  <span className="budget-nums">
                    <MoneyAmount amount={entry.spent} /> of <MoneyAmount amount={entry.limit} />
                  </span>
                </div>

                <BudgetProgressBar entry={entry} label={`${name} budget`} />

                <p className="caption">
                  <BudgetPaceCaption entry={entry} />
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
