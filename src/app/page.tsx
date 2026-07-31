import Link from "next/link";

import { CurrencyToggle } from "@/components/currency-toggle";
import { BudgetSummaryCard } from "@/components/dashboard/budget-summary-card";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { SummaryCards } from "@/components/dashboard/summary-cards";
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
import { formatMoney, fromMajor } from "@/lib/money";
import { monthFromParam, monthParam, shiftMonth } from "@/lib/period";
import { describeFreshness, loadUsdKhrRate } from "@/lib/rates/repository";

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
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink text-2xl font-bold">{period.label}</h1>
          <p className="text-ink-muted text-sm">
            {formatMoney(fromMajor(rate.rate, "KHR"))} per $1
            <span className="text-ink-faint"> · {describeFreshness(snapshot)}</span>
          </p>
        </div>

        <CurrencyToggle current={displayCurrency} className="shrink-0" />
      </header>

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

      <div className="flex items-center justify-between gap-2 text-sm">
        <Link
          href={`/?month=${monthParam(previous)}`}
          className="text-brand font-semibold"
        >
          ← {previous.label}
        </Link>
        <Link href="/transactions" className="text-ink-muted font-medium underline">
          All transactions
        </Link>
        <Link href={`/?month=${monthParam(next)}`} className="text-brand font-semibold">
          {next.label} →
        </Link>
      </div>
    </div>
  );
}
