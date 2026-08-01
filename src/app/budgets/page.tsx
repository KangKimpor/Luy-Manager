import { Plus } from "lucide-react";
import Link from "next/link";

import { BudgetRowActions } from "@/components/budget-row-actions";
import { MoneyAmount } from "@/components/money-amount";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { isDemoMode } from "@/lib/auth";
import { listBudgets } from "@/lib/data/budgets";
import { categoryLookup } from "@/lib/data/reference";
import { listTransactionsInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { summarizeBudgets, totalRemaining } from "@/lib/domain/budgets";
import { trailingMonths } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { CHART_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Budgets, PRD Section 11.
 *
 * Each budget's window comes from its own anchor day rather than the calendar
 * month, so a budget set up on the 15th runs 15th to 14th. That means the
 * transactions loaded here have to span more than the current month (a budget
 * anchored mid-month reaches back into the previous one), hence a trailing window
 * rather than `monthPeriod`.
 */

const TONE = {
  under: { bar: "bg-inflow", label: "text-ink-muted" },
  // The shared warning token rather than a one-off amber, so a budget nearing its
  // limit and a stale exchange rate speak with the same colour.
  warning: { bar: "bg-warning", label: "text-warning" },
  over: { bar: "bg-outflow", label: "text-outflow" },
} as const;

export default async function BudgetsPage() {
  // Two months covers any anchor day for weekly, monthly and quarterly windows
  // that overlap today. A quarterly or yearly budget's full window is longer, but
  // only spending inside the current window counts and `spentForBudget` filters to
  // it, so this is a bound on what needs loading, not on what is measured.
  const window = trailingMonths(4);

  const [displayCurrency, { rate }, budgets, transactions, categories] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
    listBudgets(),
    listTransactionsInRange(window.from, window.to),
    categoryLookup(),
  ]);

  const progress = summarizeBudgets(budgets, transactions, rate);
  const remaining = totalRemaining(progress, displayCurrency, rate);
  const editable = !isDemoMode();

  return (
    <div className="space-y-4">
      {/*
        One summary figure, explicitly labelled as a conversion.

        The design mockup put "$445.00" and "480,000៛" together under a single
        "Total Spent" heading with one progress ring, which sums two currencies into
        a number that means nothing. Budgets here can be set in either currency, so
        a combined total only exists once converted, and the label has to say so.
      */}
      {progress.length > 0 ? (
        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-label-caps text-ink-muted uppercase">Left to spend</span>
            <span className="text-ink-faint text-xs">in {displayCurrency}</span>
          </div>
          <MoneyAmount amount={remaining} colorBySign className="text-headline-lg mt-1 block" />
          <p className="text-body-md text-ink-muted">
            across {progress.length} budget{progress.length === 1 ? "" : "s"}
          </p>
        </Card>
      ) : null}

      {editable ? (
        <Link
          href="/budgets/new"
          className={buttonVariants({ variant: "secondary", size: "full" })}
        >
          <Plus size={16} aria-hidden="true" />
          Add a budget
        </Link>
      ) : null}

      {progress.length === 0 ? (
        <Card>
          <CardBody className="space-y-2 text-center">
            <p className="text-ink text-sm font-semibold">No budgets yet</p>
            <p className="text-ink-muted text-sm">
              Set a limit on a category, or one overall cap on everything. Spending is
              compared against it automatically, converting riel and dollars as needed.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {progress.map((entry) => {
            const tone = TONE[entry.status];
            const name =
              entry.budget.name ??
              (entry.budget.categoryId
                ? categories[entry.budget.categoryId]?.name ?? "Category"
                : "Everything");

            // The category's own colour, so a budget is recognisable by the same
            // swatch the transaction rows and the spending breakdown use. An
            // overall cap has no category, so it takes the brand colour.
            const swatch = entry.budget.categoryId
              ? categories[entry.budget.categoryId]?.color ?? CHART_COLORS.brand
              : CHART_COLORS.brand;

            return (
              <li key={entry.budget.id}>
                <Card
                  className={cn(
                    // An overspent budget is tinted, not just given a red bar, so
                    // it is findable while scrolling past a list of them.
                    entry.status === "over" && "border-outflow/30 bg-outflow-soft/40",
                  )}
                >
                  <CardHeader className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 size-9 shrink-0 rounded-full"
                      style={{
                        backgroundColor: `${swatch}1f`,
                        border: `1px solid ${swatch}40`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-numeric-md text-ink truncate">{name}</p>
                      <p className="text-ink-faint mt-0.5 text-xs capitalize">
                        {entry.budget.period}
                        {entry.budget.categoryId === null ? " · overall cap" : null}
                        {entry.budget.rollover ? " · rolls over" : null}
                      </p>
                    </div>
                    {editable ? (
                      <BudgetRowActions budgetId={entry.budget.id} name={name} />
                    ) : null}
                  </CardHeader>

                  <CardBody className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tabular text-lg font-bold">
                        <MoneyAmount amount={entry.spent} />
                        <span className="text-ink-faint text-sm font-normal">
                          {" "}
                          of <MoneyAmount amount={entry.limit} />
                        </span>
                      </span>
                      <span className={cn("text-xs font-semibold", tone.label)}>
                        {Math.round(entry.fraction * 100)}%
                      </span>
                    </div>

                    <div
                      // surface-variant, not surface-muted: the page colour is now
                      // almost white, so the old track was invisible on a card.
                      className="bg-surface-variant h-2 w-full overflow-hidden rounded-full"
                      role="progressbar"
                      aria-valuenow={Math.round(entry.fraction * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${name} budget`}
                    >
                      <div
                        className={cn("h-full rounded-full", tone.bar)}
                        // Capped so an overspend cannot render wider than its track,
                        // while the percentage beside it still tells the truth.
                        style={{ width: `${Math.min(100, Math.round(entry.fraction * 100))}%` }}
                      />
                    </div>

                    <p className="text-ink-muted text-xs">
                      {entry.status === "over" ? (
                        <span className="text-outflow font-semibold">
                          <MoneyAmount amount={entry.remaining} /> over
                        </span>
                      ) : (
                        <>
                          <MoneyAmount amount={entry.remaining} /> left
                        </>
                      )}
                      {" · "}
                      {entry.daysRemaining === 0
                        ? "last day of this period"
                        : `${entry.daysRemaining} day${
                            entry.daysRemaining === 1 ? "" : "s"
                          } to go`}
                    </p>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
