import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { CurrencyToggle } from "@/components/currency-toggle";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { MoneyAmount } from "@/components/money-amount";
import { NetWorthTrend } from "@/components/reports/net-worth-trend";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { listAccountBalances } from "@/lib/data/accounts";
import { categoryLookup } from "@/lib/data/reference";
import { listTransactionsInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { summarizeNetWorth } from "@/lib/domain/accounts";
import { spendingByCategory, summarizeCashFlow } from "@/lib/domain/transactions";
import { monthPeriod, trailingMonths } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Reports, PRD Section 11.
 *
 * Twelve months of month-by-month income and expense, the category split over the
 * same window, and net worth over time.
 *
 * Net worth here is reconstructed backwards from today's balances rather than
 * summed forwards from zero. Opening balances predate the ledger — an account
 * created with $1,842.50 already in it has no transactions explaining where that
 * came from — so a forward sum would start every account at nothing and understate
 * every historical figure. Working back from a known present is the only version
 * that ends at the right number.
 */
export default async function ReportsPage() {
  const window = trailingMonths(12);

  const [displayCurrency, { rate }, accounts, transactions, categories] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
    listAccountBalances(),
    listTransactionsInRange(window.from, window.to),
    categoryLookup(),
  ]);

  const cashFlow = summarizeCashFlow(transactions, displayCurrency, rate);
  const categoryTotals = spendingByCategory(transactions, displayCurrency, rate);
  const netWorthNow = summarizeNetWorth(accounts, displayCurrency, rate).netWorth;

  // One entry per month in the window, oldest first.
  const months = Array.from({ length: 12 }, (_, index) =>
    monthPeriod(new Date(window.to.getFullYear(), window.to.getMonth() - (11 - index), 1)),
  );

  const monthly = months.map((month) => {
    const inMonth = transactions.filter((transaction) => {
      const at = new Date(transaction.occurredAt);
      return at >= month.from && at <= month.to;
    });

    return { month, flow: summarizeCashFlow(inMonth, displayCurrency, rate) };
  });

  // Walk backwards from today's balance, undoing each month's net movement, so the
  // series ends at the figure the accounts page shows.
  const trend: Array<{ label: string; minor: number }> = [];
  let running = netWorthNow.minor;
  for (let index = monthly.length - 1; index >= 0; index -= 1) {
    trend.unshift({ label: monthly[index].month.label, minor: running });
    running -= monthly[index].flow.net.minor;
  }

  const busiest = monthly.reduce(
    (worst, entry) => (entry.flow.expense.minor > worst.flow.expense.minor ? entry : worst),
    monthly[0],
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink text-2xl font-bold">Reports</h1>
          <p className="text-ink-muted text-sm">Last 12 months</p>
        </div>
        <CurrencyToggle current={displayCurrency} className="shrink-0" />
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
              Income
            </span>
            <ArrowUpRight size={16} className="text-inflow" aria-hidden="true" />
          </div>
          <MoneyAmount
            amount={cashFlow.income}
            className="text-inflow mt-2 block text-xl font-bold"
          />
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
              Expense
            </span>
            <ArrowDownRight size={16} className="text-outflow" aria-hidden="true" />
          </div>
          <MoneyAmount
            amount={cashFlow.expense}
            className="text-outflow mt-2 block text-xl font-bold"
          />
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net worth over time</CardTitle>
        </CardHeader>
        <CardBody>
          <NetWorthTrend points={trend} currency={displayCurrency} />
          <p className="text-ink-faint mt-2 text-xs">
            Reconstructed backwards from today&apos;s balances, so it ends at the
            figure on your accounts page.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="divide-border-subtle/70 divide-y">
            {[...monthly].reverse().map((entry) => (
              <li
                key={entry.month.label}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-ink truncate text-sm">{entry.month.label}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  <MoneyAmount
                    amount={entry.flow.income}
                    className="text-inflow font-medium"
                  />
                  <MoneyAmount
                    amount={entry.flow.expense}
                    className="text-outflow font-medium"
                  />
                  <MoneyAmount
                    amount={entry.flow.net}
                    colorBySign
                    showPlus
                    className="w-20 text-right font-semibold"
                  />
                </span>
              </li>
            ))}
          </ul>
          {busiest && busiest.flow.expense.minor > 0 ? (
            <p className="text-ink-faint mt-3 text-xs">
              Heaviest spending was {busiest.month.label} at{" "}
              <MoneyAmount amount={busiest.flow.expense} />.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <CategoryBreakdown totals={categoryTotals} categories={categories} />
    </div>
  );
}
