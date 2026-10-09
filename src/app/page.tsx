import Link from "next/link";

import { CurrencyToggle } from "@/components/currency-toggle";
import { BudgetSummaryCard } from "@/components/dashboard/budget-summary-card";
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
import { summarizeBudgets } from "@/lib/domain/budgets";
import {
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

  const previous = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="space-y-6">
      {isDemoMode() ? (
        <p className="bg-brand-soft text-brand rounded-card px-3 py-2 text-xs font-medium">
          You&apos;re exploring sample data.
        </p>
      ) : null}

      <SummaryCards
        netWorth={netWorth}
        cashFlow={cashFlow}
        netWorthEquivalent={netWorthEquivalent}
        periodLabel={period.label}
      />
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <MonthStepper label={period.label} prevHref={`/?month=${monthParam(previous)}`} nextHref={`/?month=${monthParam(next)}`} />
        <RateStrip snapshot={snapshot}><CurrencyToggle current={displayCurrency} /></RateStrip>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TransactionList transactions={transactions} categories={categories} accounts={lookup} limit={5} />
        <div className="space-y-6">
          {budgetProgress.length > 0 ? <BudgetSummaryCard progress={budgetProgress} categories={categories} limit={3} /> : null}
          <Link href="/reports" className="bg-surface border-surface-variant hover:border-brand/30 block rounded-card border p-5 transition-colors">
            <span className="text-ink block font-semibold">See the bigger picture</span>
            <span className="text-ink-muted mt-1 block text-sm">Spending, categories and your balance over time.</span>
            <span className="text-brand mt-4 block text-sm font-semibold">View reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
