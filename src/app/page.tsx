import { AddAgainStrip } from "@/components/dashboard/add-again-strip";
import { BudgetSummaryCard } from "@/components/dashboard/budget-summary-card";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { MonthSpendingCard } from "@/components/dashboard/month-spending-card";
import { RecentActivityDays } from "@/components/dashboard/recent-activity-days";
import { TwoPocketsHero } from "@/components/dashboard/two-pockets-hero";
import { isDemoMode } from "@/lib/auth";
import { accountLookup, listAccountBalances } from "@/lib/data/accounts";
import { loadDashboardLedger } from "@/lib/data/dashboard";
import { categoryLookup } from "@/lib/data/reference";
import { listEntryHabitLines } from "@/lib/data/transactions";
import { otherCurrency, readDisplayCurrency } from "@/lib/display-currency";
import { summarizeCurrencyPockets, summarizeNetWorth } from "@/lib/domain/accounts";
import { learnEntryHabits } from "@/lib/domain/entry-habits";
import {
  dailySpendingBreakdown,
  spendingByCategory,
  summarizeCashFlow,
} from "@/lib/domain/transactions";
import { monthFromParam, monthParam, shiftMonth } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Home dashboard.
 *
 * Every figure is derived server-side from pure domain functions.
 * Phone renders Hero -> Add again -> This month -> Recent -> Budgets -> Where it went;
 * Desktop uses the two-column grid (Hero, Add again, Recent left; This month, Budgets, Where it went right).
 */
export default async function DashboardPage(props: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await props.searchParams;
  const period = monthFromParam(month);

  const ratePromise = loadUsdKhrRate();
  const [displayCurrency, snapshot, accounts, categories, lookup, habitHistory, ledger] =
    await Promise.all([
      readDisplayCurrency(),
      ratePromise,
      listAccountBalances(),
      categoryLookup(),
      accountLookup(),
      listEntryHabitLines(200),
      loadDashboardLedger(period, ratePromise.then((s) => s.rate)),
    ]);

  const { rate } = snapshot;
  const { lines: transactions, recent, progress } = ledger;

  const netWorth = summarizeNetWorth(accounts, displayCurrency, rate);
  const netWorthEquivalent = summarizeNetWorth(
    accounts,
    otherCurrency(displayCurrency),
    rate,
  ).netWorth;
  const pockets = summarizeCurrencyPockets(accounts, displayCurrency, rate);

  const cashFlow = summarizeCashFlow(transactions, displayCurrency, rate);
  const dailyBreakdown = dailySpendingBreakdown(transactions, period, displayCurrency, rate);
  const categoryTotals = spendingByCategory(transactions, displayCurrency, rate);
  const habits = learnEntryHabits(habitHistory, Object.values(categories));

  const previous = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="page-enter space-y-5">
      {isDemoMode() ? (
        <p className="flex items-center gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-xs font-medium text-brand">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand" />
          Sample data. Connect your account to make it yours.
        </p>
      ) : null}

      <div className="home-grid">
        <div className="home-col">
          <TwoPocketsHero
            netWorth={netWorth}
            netWorthEquivalent={netWorthEquivalent}
            pockets={pockets}
            snapshot={snapshot}
            displayCurrency={displayCurrency}
          />
          <AddAgainStrip habits={habits} categories={categories} limit={5} />
          <RecentActivityDays
            transactions={recent}
            categories={categories}
            accounts={lookup}
            displayCurrency={displayCurrency}
            rate={rate}
            limit={6}
          />
        </div>

        <div className="home-col">
          <MonthSpendingCard
            period={period}
            prevHref={`/?month=${monthParam(previous)}`}
            nextHref={`/?month=${monthParam(next)}`}
            cashFlow={cashFlow}
            breakdown={dailyBreakdown}
          />
          {progress.length > 0 ? (
            <BudgetSummaryCard progress={progress} categories={categories} limit={3} />
          ) : null}
          <CategoryBreakdown totals={categoryTotals} categories={categories} limit={4} home />
        </div>
      </div>
    </div>
  );
}

