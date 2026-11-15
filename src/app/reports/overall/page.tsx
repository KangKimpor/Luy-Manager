import { AppLink as Link } from "@/components/app-link";
import { CurrencyToggle } from "@/components/currency-toggle";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { DeferredNetWorthTrend } from "@/components/reports/deferred-net-worth-trend";
import { listAccountBalances } from "@/lib/data/accounts";
import { categoryLookup } from "@/lib/data/reference";
import { listLedgerLinesInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { summarizeNetWorth } from "@/lib/domain/accounts";
import { spendingByCategory, summarizeCashFlow } from "@/lib/domain/transactions";
import { CURRENCIES, isZero, sum } from "@/lib/money";
import { monthPeriod, shiftMonth, trailingMonths } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Overall reports, 12-month cash flow, category split and reconstructed net worth.
 */
export default async function ReportsOverallPage() {
  const window = trailingMonths(12);

  const [displayCurrency, { rate }, accounts, transactions, categories] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
    listAccountBalances(),
    listLedgerLinesInRange(window.from, window.to),
    categoryLookup(),
  ]);

  const cashFlow = summarizeCashFlow(transactions, displayCurrency, rate);
  const categoryTotals = spendingByCategory(transactions, displayCurrency, rate);
  const netWorthNow = summarizeNetWorth(accounts, displayCurrency, rate).netWorth;

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

  const trend: Array<{ label: string; minor: number }> = [];
  let running = netWorthNow.minor;
  for (let index = monthly.length - 1; index >= 0; index -= 1) {
    trend.unshift({ label: monthly[index].month.label, minor: running });
    running -= monthly[index].flow.net.minor;
  }

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

  const currencyShares = spendByCurrency.map((entry) => ({
    ...entry,
    share: isZero(spendTotal) ? 0 : entry.spent.minor / spendTotal.minor,
  }));

  const busiest = monthly.reduce(
    (worst, entry) => (entry.flow.expense.minor > worst.flow.expense.minor ? entry : worst),
    monthly[0],
  );

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/reports" className="text-link font-medium">
          Monthly view
        </Link>
        <CurrencyToggle current={displayCurrency} className="shrink-0" />
      </div>

      <div className="stat-group" aria-label="Twelve-month totals">
        <div className="stat-cell">
          <span className="stat-label">Came in</span>
          <MoneyAmount amount={cashFlow.income} className="stat-val text-inflow" />
        </div>
        <div className="stat-cell">
          <span className="stat-label">Spent</span>
          <MoneyAmount amount={cashFlow.expense} className="stat-val text-ink" />
        </div>
        <div className="stat-cell">
          <span className="stat-label">Net</span>
          <MoneyAmount
            amount={cashFlow.net}
            colorBySign={cashFlow.net.minor > 0}
            showPlus={cashFlow.net.minor > 0}
            className="stat-val"
          />
        </div>
      </div>

      <section className="sec-wrap" aria-label="Net worth over time">
        <div className="sec-head">
          <h2 className="sec-title">Net worth</h2>
          <span className="caption">12 months, in {displayCurrency}</span>
        </div>
        <div className="proto-card space-y-3">
          <div>
            <p className="caption">Current total</p>
            <MoneyAmount amount={netWorthNow} className="numeric-lg text-ink mt-0.5 block" />
          </div>
          <DeferredNetWorthTrend points={trend} currency={displayCurrency} />
          <p className="caption">
            Estimated from today&apos;s balances and recorded transactions.
          </p>
        </div>
      </section>

      <section className="sec-wrap" aria-label="Month by month breakdown">
        <div className="sec-head">
          <h2 className="sec-title">Month by month</h2>
          <span className="caption">In {displayCurrency}</span>
        </div>
        <div className="group-card">
          <div
            aria-hidden="true"
            className="caption border-hairline hidden grid-cols-4 gap-3 border-b px-4 py-2.5 sm:grid"
          >
            <span>Month</span>
            <span className="text-right">Came in</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Net change</span>
          </div>
          <ul className="stagger-children divide-hairline divide-y">
            {[...monthly].reverse().map((entry) => (
              <li
                key={entry.month.label}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-4 sm:py-3"
              >
                <span className="order-1 text-sm font-medium text-ink">{entry.month.label}</span>
                <div className="order-3 text-xs sm:order-2 sm:text-right">
                  <span className="text-ink-muted mr-1.5 sm:hidden">Came in</span>
                  <MoneyAmount amount={entry.flow.income} className="text-inflow font-medium" />
                </div>
                <div className="order-4 text-right text-xs sm:order-3">
                  <span className="text-ink-muted mr-1.5 sm:hidden">Spent</span>
                  <MoneyAmount amount={entry.flow.expense} className="text-ink font-medium" />
                </div>
                <div className="order-2 text-right text-sm sm:order-4 sm:text-xs">
                  <MoneyAmount
                    amount={entry.flow.net}
                    colorBySign={entry.flow.net.minor > 0}
                    showPlus={entry.flow.net.minor > 0}
                    className="font-semibold text-ink"
                  />
                </div>
              </li>
            ))}
          </ul>
          {busiest && busiest.flow.expense.minor > 0 ? (
            <p className="caption bg-surface-container-low px-4 py-3">
              Heaviest spending was {busiest.month.label} at{" "}
              <MoneyAmount amount={busiest.flow.expense} className="font-semibold text-ink" />.
            </p>
          ) : null}
        </div>
      </section>

      <div className="stagger-children grid items-start gap-5 lg:grid-cols-2">
        <CategoryBreakdown totals={categoryTotals} categories={categories} />

        <section className="sec-wrap lg:mt-0" aria-label="Spending by currency">
          <div className="sec-head">
            <h2 className="sec-title">Spending by currency</h2>
            <span className="caption">Actual paid</span>
          </div>
          <div className="proto-card space-y-3">
            {isZero(spendTotal) ? (
              <p className="text-ink-faint text-body-md">Nothing spent in this window yet.</p>
            ) : (
              <>
                <div
                  className="bg-track flex h-2.5 overflow-hidden rounded-full"
                  role="img"
                  aria-label={`Share of spending by currency, in ${displayCurrency}`}
                >
                  {currencyShares.map((entry) => (
                    <div
                      key={entry.code}
                      className={
                        entry.code === "USD" ? "progress-fill bg-usd" : "progress-fill bg-khr"
                      }
                      style={{ width: `${entry.share * 100}%` }}
                    />
                  ))}
                </div>

                <ul className="divide-hairline divide-y">
                  {currencyShares.map((entry) => (
                    <li
                      key={entry.code}
                      className="flex items-center justify-between gap-3 py-3.5"
                    >
                      <CurrencyBadge currency={entry.code} />
                      <span className="flex items-center gap-3">
                        <MoneyAmount amount={entry.spent} className="numeric-md text-ink" />
                        <span className="caption w-9 text-right">
                          {Math.round(entry.share * 100)}%
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="caption">
                  Both totals converted to {displayCurrency}. Transfers excluded.
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
