import Link from "next/link";

import { CurrencyToggle } from "@/components/currency-toggle";
import { BudgetSummaryCard } from "@/components/dashboard/budget-summary-card";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MonthStepper } from "@/components/month-stepper";
import { RateStrip } from "@/components/rate-strip";
import { TransactionList } from "@/components/transaction-list";
import { isDemoMode } from "@/lib/auth";
import { accountLookup, listAccountBalances } from "@/lib/data/accounts";
import { listBudgets } from "@/lib/data/budgets";
import { categoryLookup } from "@/lib/data/reference";
import { listTransactionsInRange } from "@/lib/data/transactions";
import { otherCurrency, readDisplayCurrency } from "@/lib/display-currency";
import { summarizeNetWorth } from "@/lib/domain/accounts";
import { summarizeBudgets, totalRemaining } from "@/lib/domain/budgets";
import {
  dailyCashFlow,
  spendingByCategory,
  summarizeCashFlow,
} from "@/lib/domain/transactions";
import { monthFromParam, monthParam, shiftMonth } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Dashboard, PRD Section 11.
 *
 * A server component: every figure is derived from the ledger with pure functions,
 * so there is nothing to compute on the client and no loading state to manage.
 * Reads through the data layer, which serves demo data when Supabase is not
 * configured and the signed-in user's own ledger when it is.
 *
 * The month is a URL parameter rather than component state, which makes a
 * particular month linkable and keeps the arithmetic on the server.
 */
export default async function DashboardPage(props: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await props.searchParams;
  const period = monthFromParam(month);

  const [displayCurrency, snapshot, accounts, transactions, categories, budgets] =
    await Promise.all([
      readDisplayCurrency(),
      loadUsdKhrRate(),
      listAccountBalances(),
      listTransactionsInRange(period.from, period.to),
      categoryLookup(),
      listBudgets(),
    ]);

  const { rate } = snapshot;
  const lookup = await accountLookup();

  const netWorth = summarizeNetWorth(accounts, displayCurrency, rate);
  const cashFlow = summarizeCashFlow(transactions, displayCurrency, rate);
  const categoryTotals = spendingByCategory(transactions, displayCurrency, rate);
  const series = dailyCashFlow(transactions, period.from, period.to, displayCurrency, rate);

  // Re-aggregated in the other currency rather than converted from the total
  // above. Converting the finished total is one rounding; re-aggregating is one per
  // account, and the two disagree by a few riel. Doing it this way means the
  // equivalent shown here is exactly the figure the toggle will display, so
  // switching currency never appears to change the answer.
  const netWorthEquivalent = summarizeNetWorth(
    accounts,
    otherCurrency(displayCurrency),
    rate,
  ).netWorth;

  const budgetProgress = summarizeBudgets(budgets, transactions, rate);
  const budgetRemaining =
    budgetProgress.length > 0 ? totalRemaining(budgetProgress, displayCurrency, rate) : undefined;

  const previous = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="space-y-4">
      <RateStrip snapshot={snapshot}>
        <CurrencyToggle current={displayCurrency} />
      </RateStrip>

      <MonthStepper
        label={period.label}
        prevHref={`/?month=${monthParam(previous)}`}
        nextHref={`/?month=${monthParam(next)}`}
      />

      {isDemoMode() ? (
        <p className="bg-brand-soft text-brand rounded-card px-3 py-2 text-xs font-medium">
          Showing sample data. Connect Supabase to track your own money.
        </p>
      ) : null}

      <SummaryCards
        netWorth={netWorth}
        cashFlow={cashFlow}
        netWorthEquivalent={netWorthEquivalent}
        budgetRemaining={budgetRemaining}
      />

      {budgetProgress.length > 0 ? (
        <BudgetSummaryCard progress={budgetProgress} categories={categories} />
      ) : null}

      <CashFlowChart series={series} currency={displayCurrency} />

      <CategoryBreakdown totals={categoryTotals} categories={categories} />

      <TransactionList transactions={transactions} categories={categories} accounts={lookup} />

      <div className="flex justify-center pt-1">
        <Link
          href="/transactions"
          className="text-brand text-body-md rounded-pill border-surface-variant bg-surface hover:bg-surface-container border px-5 py-2 font-semibold transition-colors"
        >
          All transactions
        </Link>
      </div>
    </div>
  );
}
