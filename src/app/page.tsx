import { Suspense } from "react";
import { ArrowRightLeft, ArrowUpRight, ChartNoAxesCombined, Plus, Wallet } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";

import { CurrencyToggle } from "@/components/currency-toggle";
import { BudgetSummaryCard } from "@/components/dashboard/budget-summary-card";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MonthStepper } from "@/components/month-stepper";
import { RateStrip } from "@/components/rate-strip";
import { TransactionList } from "@/components/transaction-list";
import { isDemoMode } from "@/lib/auth";
import { accountLookup, listAccountBalances } from "@/lib/data/accounts";
import { listBudgetProgress } from "@/lib/data/budgets";
import { categoryLookup } from "@/lib/data/reference";
import { listTransactionsInRange } from "@/lib/data/transactions";
import { otherCurrency, readDisplayCurrency } from "@/lib/display-currency";
import { summarizeNetWorth } from "@/lib/domain/accounts";
import {
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

  const [displayCurrency, snapshot, accounts, transactions, categories, lookup] =
    await Promise.all([
      readDisplayCurrency(),
      loadUsdKhrRate(),
      listAccountBalances(),
      listTransactionsInRange(period.from, period.to),
      categoryLookup(),
      accountLookup(),
    ]);

  const { rate } = snapshot;

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

  const categoryTotals = spendingByCategory(transactions, displayCurrency, rate);

  const previous = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="page-enter space-y-5 sm:space-y-6">
      {isDemoMode() ? (
        <p className="flex items-center gap-2 rounded-2xl border border-brand/10 bg-brand-soft px-4 py-3 text-xs font-medium text-brand">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand" />
          Sample data. Connect your account to make it yours.
        </p>
      ) : null}

      <SummaryCards
        netWorth={netWorth}
        cashFlow={cashFlow}
        netWorthEquivalent={netWorthEquivalent}
        periodLabel={period.label}
      />
      <div className="stagger-children grid grid-cols-3 gap-3" aria-label="Quick actions">
        {[
          { href: "/add?type=expense", label: "Add expense", icon: Plus },
          { href: "/add?type=transfer", label: "Transfer", icon: ArrowRightLeft },
          { href: "/accounts", label: "Accounts", icon: Wallet },
        ].map(({ href, label, icon: Icon }) => (
          <Link prefetch={true} key={href} href={href} className="card-interactive flex min-h-20 flex-col items-center justify-center gap-2 rounded-card border border-surface-variant bg-surface px-2 py-4 text-center text-xs font-semibold text-ink shadow-card sm:flex-row sm:text-sm">
            <Icon size={19} className="text-brand" aria-hidden="true" />{label}
          </Link>
        ))}
      </div>
      <div className="grid items-center gap-3 lg:grid-cols-2">
        <MonthStepper label={period.label} prevHref={`/?month=${monthParam(previous)}`} nextHref={`/?month=${monthParam(next)}`} />
        <RateStrip snapshot={snapshot}><CurrencyToggle current={displayCurrency} /></RateStrip>
      </div>
      <div className="stagger-children grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <TransactionList transactions={transactions} categories={categories} accounts={lookup} limit={5} />
        <div className="space-y-5">
          <Suspense fallback={<div className="skeleton h-48 rounded-card" role="status" aria-label="Loading budgets" />}>
            <DashboardBudgets categories={categories} snapshot={snapshot} />
          </Suspense>
          <CategoryBreakdown totals={categoryTotals} categories={categories} limit={4} />
          <Link prefetch={true} href="/reports" className="card-interactive group block rounded-card border border-brand/10 bg-brand-soft p-5">
            <span className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-surface text-brand"><ChartNoAxesCombined size={20} aria-hidden="true" /></span>
            <span className="block font-semibold text-ink">A little clarity goes a long way.</span>
            <span className="mt-1.5 block text-sm leading-relaxed text-ink-muted">See how your spending and balance change over time.</span>
            <span className="mt-4 flex items-center gap-2 text-sm font-semibold text-brand">Explore reports <ArrowUpRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Longer budget windows stream separately so the current month's figures and
// quick actions are usable while an annual budget is still loading.
async function DashboardBudgets({ categories, snapshot }: {
  categories: Awaited<ReturnType<typeof categoryLookup>>;
  snapshot: Awaited<ReturnType<typeof loadUsdKhrRate>>;
}) {
  const progress = await listBudgetProgress(snapshot.rate);
  return progress.length > 0 ? <BudgetSummaryCard progress={progress} categories={categories} limit={3} /> : null;
}
