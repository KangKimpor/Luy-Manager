import { Plus, Target } from "lucide-react";
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
import { absolute } from "@/lib/money";
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
  // Annual budgets can begin in the previous year's calendar month. A thirteen
  // month bound includes the full period, including a mid-month anchor day.
  const window = trailingMonths(13);

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
  const categoryBudgetCount = progress.filter((entry) => entry.budget.categoryId !== null).length;

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <p className="text-sm leading-relaxed text-ink-muted">Give your spending a little direction.</p>
      {/*
        One summary figure, explicitly labelled as a conversion.

        The design mockup put "$445.00" and "480,000៛" together under a single
        "Total Spent" heading with one progress ring, which sums two currencies into
        a number that means nothing. Budgets here can be set in either currency, so
        a combined total only exists once converted, and the label has to say so.
      */}
      {categoryBudgetCount > 0 ? (
        <Card className="hero-orbit border-0 bg-ink p-6 text-surface sm:p-8">
          <div className="relative flex items-center justify-between gap-2">
            <span className="text-sm text-surface/70">Left in category budgets</span>
            <Target size={20} aria-hidden="true" className="text-surface/60" />
          </div>
          <MoneyAmount amount={remaining} className="relative mt-3 block text-[clamp(1.9rem,7.5vw,3rem)] leading-tight font-semibold tracking-tight" />
          <p className="relative mt-3 text-xs text-surface/60">
            {categoryBudgetCount} category budget{categoryBudgetCount === 1 ? "" : "s"}, converted to {displayCurrency}
          </p>
        </Card>
      ) : null}

      {editable ? (
        <Link
          href="/budgets/new"
          className={cn(buttonVariants({ variant: "secondary", size: "full" }), "card-interactive")}
        >
          <Plus size={16} aria-hidden="true" />
          Add a budget
        </Link>
      ) : null}

      {progress.length === 0 ? (
        <Card>
          <CardBody className="space-y-3 py-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Target size={22} aria-hidden="true" /></span>
            <p className="text-sm font-semibold text-ink">Make room for what matters</p>
            <p className="text-ink-muted text-sm">
              Set a spending limit for a category or for everything.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="stagger-children grid gap-4 lg:grid-cols-2">
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
                      className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor: `${swatch}1f`,
                        color: swatch,
                      }}
                    ><Target size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{name}</p>
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

                  <CardBody className="space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0"><MoneyAmount amount={absolute(entry.remaining)} className={cn("block text-xl font-semibold tracking-tight", entry.status === "over" && "text-outflow")} /><span className="mt-1 block text-xs text-ink-faint">{entry.status === "over" ? "over budget" : "left to spend"}</span></div>
                      <span className={cn("shrink-0 rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold", tone.label)}>
                        {Math.round(entry.fraction * 100)}%
                      </span>
                    </div>

                    <div
                      // surface-variant, not surface-muted: the page colour is now
                      // almost white, so the old track was invisible on a card.
                      className="bg-surface-variant h-2 w-full overflow-hidden rounded-full"
                      role="progressbar"
                      aria-valuenow={Math.min(100, Math.round(entry.fraction * 100))}
                      aria-valuetext={`${Math.round(entry.fraction * 100)}% spent`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${name} budget`}
                    >
                      <div
                        className={cn("progress-fill h-full rounded-full", tone.bar)}
                        // Capped so an overspend cannot render wider than its track,
                        // while the percentage beside it still tells the truth.
                        style={{ width: `${Math.min(100, Math.round(entry.fraction * 100))}%` }}
                      />
                    </div>

                    <p className="text-xs leading-relaxed text-ink-muted">
                      <MoneyAmount amount={entry.spent} /> of <MoneyAmount amount={entry.limit} /> spent
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
