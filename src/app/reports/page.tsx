import { ArrowDownRight, ArrowUpRight, ChartNoAxesCombined } from "lucide-react";

import { CurrencyToggle } from "@/components/currency-toggle";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { DeferredNetWorthTrend } from "@/components/reports/deferred-net-worth-trend";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { listAccountBalances } from "@/lib/data/accounts";
import { categoryLookup } from "@/lib/data/reference";
import { listTransactionsInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { summarizeNetWorth } from "@/lib/domain/accounts";
import { spendingByCategory, summarizeCashFlow } from "@/lib/domain/transactions";
import { CURRENCIES, isZero, sum } from "@/lib/money";
import { monthPeriod, shiftMonth, trailingMonths } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Reports, PRD Section 11.
 *
 * Twelve months of month-by-month income and expense, the category split over the
 * same window, and net worth over time.
 *
 * Net worth here is reconstructed backwards from today's balances rather than
 * summed forwards from zero. Opening balances predate the ledger (an account
 * created with $1,842.50 already in it has no transactions explaining where that
 * came from), so a forward sum would start every account at nothing and understate
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
    shiftMonth(monthPeriod(window.to), index - 11),
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

  /*
   * Which currency the money was actually spent in.
   *
   * Worth its own card in a dual-currency economy, and it is a question no other
   * screen answers: every other total deliberately converts into one currency,
   * which hides the split. Someone who thinks they mostly spend dollars but is
   * actually 60% riel is budgeting against the wrong mental model.
   *
   * Reuses summarizeCashFlow per currency rather than summing by hand, so transfers
   * are excluded and the conversion is the same tested path as everywhere else.
   */
  const spendByCurrency = CURRENCIES.map((code) => ({
    code,
    spent: summarizeCashFlow(
      transactions.filter((transaction) => transaction.currency === code),
      displayCurrency,
      rate,
    ).expense,
  }));

  const spendTotal = sum(
    spendByCurrency.map((entry) => entry.spent),
    displayCurrency,
  );

  // Share as a plain ratio, resolved once here rather than dividing minor units
  // inside the markup. Same shape as `CategoryTotal.share`, so the rendering below
  // does percentages on a ratio and never does arithmetic on money.
  const currencyShares = spendByCurrency.map((entry) => ({
    ...entry,
    share: isZero(spendTotal) ? 0 : entry.spent.minor / spendTotal.minor,
  }));

  const busiest = monthly.reduce(
    (worst, entry) => (entry.flow.expense.minor > worst.flow.expense.minor ? entry : worst),
    monthly[0],
  );

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">Your last 12 months, in perspective.</p>
        </div>
        <CurrencyToggle current={displayCurrency} className="shrink-0" />
      </header>

      <div className="stagger-children grid grid-cols-2 gap-3">
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted">
              Income
            </span>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-inflow-soft text-inflow"><ArrowUpRight size={16} aria-hidden="true" /></span>
          </div>
          <MoneyAmount
            amount={cashFlow.income}
            className="mt-3 block text-[clamp(1rem,4.1vw,1.5rem)] font-semibold tracking-tight text-ink"
          />
          <p className="mt-2 text-[11px] text-ink-faint">Converted to {displayCurrency}</p>
        </Card>

        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted">
              Spending
            </span>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-outflow-soft text-outflow"><ArrowDownRight size={16} aria-hidden="true" /></span>
          </div>
          <MoneyAmount
            amount={cashFlow.expense}
            className="mt-3 block text-[clamp(1rem,4.1vw,1.5rem)] font-semibold tracking-tight text-ink"
          />
          <p className="mt-2 text-[11px] text-ink-faint">Transfers excluded</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-start justify-between gap-3">
          <div><CardTitle>Building your balance</CardTitle><p className="mt-1 text-xs text-ink-faint">Net worth over time</p><MoneyAmount amount={netWorthNow} className="mt-4 block text-headline-lg font-semibold text-ink" /></div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand"><ChartNoAxesCombined size={20} aria-hidden="true" /></span>
        </CardHeader>
        <CardBody>
          <DeferredNetWorthTrend points={trend} currency={displayCurrency} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Estimated from today&apos;s balances and recorded transactions. Converted to {displayCurrency}.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
          <p className="mt-1 text-xs text-ink-faint">Income, spending and the difference</p>
        </CardHeader>
        <CardBody>
          <div aria-hidden="true" className="mb-2 hidden grid-cols-4 gap-3 border-b border-surface-variant pb-3 text-xs text-ink-faint sm:grid"><span>Month</span><span className="text-right">Income</span><span className="text-right">Spending</span><span className="text-right">Net change</span></div>
          <ul className="stagger-children divide-y divide-surface-variant">
            {[...monthly].reverse().map((entry) => (
              <li
                key={entry.month.label}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 py-4 sm:grid-cols-4 sm:py-3"
              >
                <span className="order-1 text-sm font-medium text-ink">{entry.month.label}</span>
                <div className="order-3 text-xs sm:order-2 sm:text-right">
                  <span className="mr-1.5 text-[11px] text-ink-faint sm:hidden">Income</span>
                  <MoneyAmount
                    amount={entry.flow.income}
                    className="text-inflow font-medium"
                  />
                </div>
                <div className="order-4 text-right text-xs sm:order-3">
                  <span className="mr-1.5 text-[11px] text-ink-faint sm:hidden">Spent</span>
                  <MoneyAmount
                    amount={entry.flow.expense}
                    className="text-outflow font-medium"
                  />
                </div>
                <div className="order-2 text-right text-sm sm:order-4 sm:text-xs">
                  <MoneyAmount
                    amount={entry.flow.net}
                    colorBySign
                    showPlus
                    className="font-semibold"
                  />
                </div>
              </li>
            ))}
          </ul>
          {busiest && busiest.flow.expense.minor > 0 ? (
            <p className="mt-4 rounded-xl bg-surface-container-low p-3 text-xs leading-relaxed text-ink-muted">
              Heaviest spending was {busiest.month.label} at{" "}
              <MoneyAmount amount={busiest.flow.expense} />.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="stagger-children grid items-start gap-5 lg:grid-cols-2">
      <CategoryBreakdown totals={categoryTotals} categories={categories} />

      <Card>
        <CardHeader>
          <CardTitle>Spending by currency</CardTitle>
          <p className="mt-1 text-xs text-ink-faint">The currencies you actually used</p>
        </CardHeader>
        <CardBody className="space-y-3">
          {isZero(spendTotal) ? (
            <p className="text-ink-faint text-body-md">
              Nothing spent in this window yet.
            </p>
          ) : (
            <>
              <div
                className="flex h-3 overflow-hidden rounded-full bg-surface-variant"
                role="img"
                aria-label={`Share of spending by currency, in ${displayCurrency}`}
              >
                {currencyShares.map((entry) => (
                  <div
                    key={entry.code}
                    className={entry.code === "USD" ? "progress-fill bg-usd" : "progress-fill bg-khr"}
                    style={{ width: `${entry.share * 100}%` }}
                  />
                ))}
              </div>

              <ul className="divide-surface-variant divide-y">
                {currencyShares.map((entry) => (
                  <li
                    key={entry.code}
                    className="flex items-center justify-between gap-3 py-4"
                  >
                    <CurrencyBadge currency={entry.code} />
                    <span className="flex items-center gap-3">
                      <MoneyAmount amount={entry.spent} className="text-numeric-md" />
                      <span className="text-ink-faint w-9 text-right text-xs">
                        {Math.round(entry.share * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-[11px] leading-relaxed text-ink-faint">
                Both totals converted to {displayCurrency} so they can be compared.
                Transfers between your own accounts are excluded.
              </p>
            </>
          )}
        </CardBody>
      </Card>
      </div>
    </div>
  );
}
