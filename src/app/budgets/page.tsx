import { Plus, Target } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";

import { BudgetPaceCaption, BudgetProgressBar } from "@/components/budget-progress-bar";
import { BudgetRowActions } from "@/components/budget-row-actions";
import { CategoryIcon, categoryColorToken, RowIconTile } from "@/components/category-icon";
import { CurrencyToggle } from "@/components/currency-toggle";
import { MoneyAmount } from "@/components/money-amount";
import { buttonVariants } from "@/components/ui/button";
import { isDemoMode } from "@/lib/auth";
import { listBudgetProgress } from "@/lib/data/budgets";
import { categoryLookup, getProfile } from "@/lib/data/reference";
import { listLedgerLinesInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { summarizeBudgetsOverview } from "@/lib/domain/budgets";
import { categoryLabel } from "@/lib/domain/categories";
import { spendingByCategory } from "@/lib/domain/transactions";
import { monthPeriod } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { cn } from "@/lib/utils";

/**
 * Budgets, PRD Section 11.
 *
 * Each budget's window comes from its own anchor day rather than the calendar
 * month. Summary ring + per-budget bars display both spending progress and
 * calendar elapsed pace via `summarizeBudgetsOverview` and `BudgetProgressBar`.
 */
export default async function BudgetsPage() {
  const ratePromise = loadUsdKhrRate();
  const currentMonth = monthPeriod();
  const [displayCurrency, { rate }, profile, categories, monthLines] = await Promise.all([
    readDisplayCurrency(),
    ratePromise,
    getProfile(),
    categoryLookup(),
    listLedgerLinesInRange(currentMonth.from, currentMonth.to),
  ]);

  const progress = await listBudgetProgress(rate, new Date(), profile?.timezone);
  const overview = summarizeBudgetsOverview(progress, displayCurrency, rate);
  const editable = !isDemoMode();

  const budgetedCategoryIds = new Set(
    progress
      .map((entry) => entry.budget.categoryId)
      .filter((id): id is string => id !== null),
  );
  const unbudgeted = spendingByCategory(monthLines, displayCurrency, rate).filter(
    (entry) => entry.categoryId === null || !budgetedCategoryIds.has(entry.categoryId),
  );

  const ringRadius = 48;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDash = Math.min(1, overview.fillRatio) * ringCircumference;
  const ringColor =
    overview.paceStatus === "over"
      ? "var(--color-outflow)"
      : overview.paceStatus === "ahead-of-pace"
        ? "var(--color-warning)"
        : "var(--color-brand)";

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <CurrencyToggle current={displayCurrency} className="shrink-0" />
        {editable ? (
          <Link
            href="/budgets/new"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "px-4")}
          >
            <Plus size={16} aria-hidden="true" />
            Add a budget
          </Link>
        ) : null}
      </div>

      {progress.length > 0 ? (
        <section className="proto-card budget-summary-card" aria-label="Overall budget summary">
          <div className="ring-wrap">
            <svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              role="img"
              aria-label={`Overall budget ${overview.percent} percent used`}
            >
              <circle
                cx="60"
                cy="60"
                r={ringRadius}
                fill="none"
                stroke="var(--color-track)"
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                r={ringRadius}
                fill="none"
                stroke={ringColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${ringDash.toFixed(2)} ${ringCircumference.toFixed(2)}`}
                transform="rotate(-90 60 60)"
              />
              {overview.elapsedShare !== null ? (
                <rect
                  x="59"
                  y="3"
                  width="2"
                  height="18"
                  rx="1"
                  fill="var(--color-ink)"
                  transform={`rotate(${(overview.elapsedShare * 360).toFixed(1)} 60 60)`}
                />
              ) : null}
            </svg>
            <div className="ring-center">
              <span className="ring-pct text-ink">{overview.percent}%</span>
              <span className="caption">used</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <MoneyAmount amount={overview.totalSpent} className="numeric-lg text-ink block" />
            <div className="caption">
              of <MoneyAmount amount={overview.totalLimit} /> budgeted
            </div>
            {overview.elapsedShare !== null ? (
              <div className="caption mt-1">
                Day {overview.elapsedDays} of {overview.totalDays}
              </div>
            ) : null}
            <p className="text-ink-muted mt-2 text-[15px] leading-[20px] tracking-[-0.014em]">
              {overview.verdict}
            </p>
          </div>
        </section>
      ) : null}

      {progress.length === 0 ? (
        <div className="proto-card space-y-3 py-8 text-center">
          <span className="bg-brand-soft text-brand mx-auto flex size-12 items-center justify-center rounded-2xl">
            <Target size={22} aria-hidden="true" />
          </span>
          <p className="text-ink text-sm font-semibold">Make room for what matters</p>
          <p className="text-ink-muted text-sm">
            Set a spending limit for a category or for everything.
          </p>
          {editable ? (
            <Link href="/budgets/new" className={buttonVariants({ size: "full" })}>
              <Plus size={16} aria-hidden="true" />
              Add a budget
            </Link>
          ) : null}
        </div>
      ) : (
        <section className="sec-wrap" aria-label="Budget categories">
          <div className="sec-head">
            <h2 className="sec-title">Categories</h2>
          </div>

          <ul className="stagger-children grid gap-4 lg:grid-cols-2">
            {progress.map((entry) => {
              const category = entry.budget.categoryId
                ? categories[entry.budget.categoryId]
                : undefined;
              const name =
                entry.budget.name ??
                (entry.budget.categoryId ? categoryLabel(category) : "Everything");
              const tileColor = category
                ? categoryColorToken(category)
                : "var(--color-brand)";

              return (
                <li key={entry.budget.id}>
                  <section className="proto-card budget-row">
                    <div className="budget-top">
                      <div className="budget-id">
                        <RowIconTile color={tileColor}>
                          {category ? (
                            <CategoryIcon category={category} size={17} />
                          ) : (
                            <Target size={17} aria-hidden="true" />
                          )}
                        </RowIconTile>
                        <div className="min-w-0">
                          <p className="budget-name">{name}</p>
                          <p className="caption capitalize">
                            {entry.budget.period}
                            {entry.budget.categoryId === null ? " · overall cap" : null}
                            {entry.budget.rollover ? " · rolls over" : null}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <span className="budget-nums">
                          <MoneyAmount amount={entry.spent} /> /{" "}
                          <MoneyAmount amount={entry.limit} />
                        </span>
                        {editable ? (
                          <BudgetRowActions budgetId={entry.budget.id} name={name} />
                        ) : null}
                      </div>
                    </div>

                    <BudgetProgressBar entry={entry} label={`${name} budget`} />

                    <div className="caption flex items-center justify-between gap-2">
                      <BudgetPaceCaption entry={entry} />
                      <span>
                        {entry.daysRemaining === 0
                          ? "Last day of this period"
                          : `${entry.daysRemaining} day${
                              entry.daysRemaining === 1 ? "" : "s"
                            } left`}
                      </span>
                    </div>
                  </section>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="sec-wrap" aria-label="Unbudgeted spending">
        <div className="sec-head">
          <h2 className="sec-title">Unbudgeted spending</h2>
          <span className="caption">Converted to {displayCurrency}</span>
        </div>
        {unbudgeted.length === 0 ? (
          <div className="proto-card">
            <p className="caption">No unbudgeted spending this month.</p>
          </div>
        ) : (
          <ul className="group-card">
            {unbudgeted.map((entry) => {
              const category = entry.categoryId ? categories[entry.categoryId] : undefined;
              const label = categoryLabel(category);
              const color = categoryColorToken(category);
              return (
                <li key={entry.categoryId ?? "none"} className="insight-summary-row">
                  <div className="flex min-w-0 items-center gap-3">
                    <RowIconTile color={color}>
                      <CategoryIcon category={category} size={17} />
                    </RowIconTile>
                    <span className="tx-title truncate">{label}</span>
                  </div>
                  <MoneyAmount amount={entry.total} className="numeric-md shrink-0 text-ink" />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
