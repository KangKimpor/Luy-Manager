import { CurrencyToggle } from "@/components/currency-toggle";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { TransactionList } from "@/components/transaction-list";
import { otherCurrency, readDisplayCurrency } from "@/lib/display-currency";
import { summarizeNetWorth } from "@/lib/domain/accounts";
import {
  dailyCashFlow,
  spendingByCategory,
  summarizeCashFlow,
} from "@/lib/domain/transactions";
import {
  CATEGORY_LOOKUP,
  DEMO_ACCOUNTS,
  DEMO_PERIOD,
  DEMO_TRANSACTIONS,
} from "@/lib/demo-data";
import { formatMoney, fromMajor } from "@/lib/money";
import { describeFreshness, loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Dashboard, PRD Section 11.
 *
 * Still a server component: every figure is derived from the ledger with pure
 * functions, so there is nothing to compute on the client and no loading state to
 * manage. The reporting currency now comes from a cookie, which is what keeps the
 * arithmetic here — the aggregation functions already take a base currency, so
 * switching units is a different argument rather than different code.
 *
 * The rate is read alongside it, and its age is shown. A rate quietly weeks stale
 * looks identical to a fresh one on screen, and every converted figure below
 * depends on it.
 */
export default async function DashboardPage() {
  const [displayCurrency, snapshot] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
  ]);
  const { rate } = snapshot;

  const accountLookup = Object.fromEntries(
    DEMO_ACCOUNTS.map((account) => [account.accountId, account]),
  );

  const netWorth = summarizeNetWorth(DEMO_ACCOUNTS, displayCurrency, rate);
  const cashFlow = summarizeCashFlow(DEMO_TRANSACTIONS, displayCurrency, rate);
  const categoryTotals = spendingByCategory(DEMO_TRANSACTIONS, displayCurrency, rate);
  const series = dailyCashFlow(
    DEMO_TRANSACTIONS,
    DEMO_PERIOD.from,
    DEMO_PERIOD.to,
    displayCurrency,
    rate,
  );

  // Re-aggregated in the other currency rather than converted from the total
  // above. Converting the finished total is one rounding; re-aggregating is one
  // per account, and the two disagree by a few riel. Doing it this way means the
  // equivalent shown here is exactly the figure the toggle will display, so
  // switching currency never appears to change the answer.
  const netWorthEquivalent = summarizeNetWorth(
    DEMO_ACCOUNTS,
    otherCurrency(displayCurrency),
    rate,
  ).netWorth;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink text-2xl font-bold">July 2026</h1>
          <p className="text-ink-muted text-sm">
            {formatMoney(fromMajor(rate.rate, "KHR"))} per $1
            <span className="text-ink-faint"> · {describeFreshness(snapshot)}</span>
          </p>
        </div>

        <CurrencyToggle current={displayCurrency} className="shrink-0" />
      </header>

      <SummaryCards
        netWorth={netWorth}
        cashFlow={cashFlow}
        netWorthEquivalent={netWorthEquivalent}
      />

      <CashFlowChart series={series} currency={displayCurrency} />

      <CategoryBreakdown totals={categoryTotals} categories={CATEGORY_LOOKUP} />

      <TransactionList
        transactions={DEMO_TRANSACTIONS}
        categories={CATEGORY_LOOKUP}
        accounts={accountLookup}
      />
    </div>
  );
}
