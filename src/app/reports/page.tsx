import { ArrowUpRight } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { CategoryIcon, RowIconTile } from "@/components/category-icon";
import { CurrencyToggle } from "@/components/currency-toggle";
import { MoneyAmount } from "@/components/money-amount";
import { MonthStepper } from "@/components/month-stepper";
import { DeferredCategoryDonut } from "@/components/reports/deferred-category-donut";
import { categoryLookup } from "@/lib/data/reference";
import { listLedgerLinesInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { categoryLabel } from "@/lib/domain/categories";
import {
  categoryChartShares,
  incomeByCategory,
  spendingByCategory,
  summarizeCashFlow,
} from "@/lib/domain/transactions";
import { monthFromParam, monthParam, shiftMonth } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { CHART_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string }>;
}) {
  const params = await searchParams;
  const period = monthFromParam(params.month);
  const month = monthParam(period);
  const type = params.type === "income" ? "income" : "expense";
  const [currency, { rate }, lines, categories] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
    listLedgerLinesInRange(period.from, period.to),
    categoryLookup(),
  ]);
  const flow = summarizeCashFlow(lines, currency, rate);
  const totals =
    type === "income"
      ? incomeByCategory(lines, currency, rate)
      : spendingByCategory(lines, currency, rate);
  const slices = categoryChartShares(totals).map((entry, index) => ({
    ...entry,
    name: entry.other
      ? "Everything else"
      : entry.categoryId
        ? categoryLabel(categories[entry.categoryId])
        : "Uncategorised",
    color: CHART_COLORS.categories[index],
  }));
  const monthHref = (offset: number) =>
    `/reports?month=${monthParam(shiftMonth(period, offset))}&type=${type}`;

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/reports/overall" className="text-link gap-1.5 font-medium">
          Overall report
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <CurrencyToggle current={currency} />
      </div>

      <MonthStepper label={period.label} prevHref={monthHref(-1)} nextHref={monthHref(1)} />

      <nav
        aria-label="Report type"
        className="segmented-control segmented-control-full h-11 items-center"
      >
        {(["income", "expense"] as const).map((value) => {
          const active = type === value;
          return (
            <Link
              key={value}
              href={`/reports?month=${month}&type=${value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-pill relative z-10 flex h-full items-center justify-center gap-2 px-3 text-[13px] leading-[18px] tracking-[-0.006em] whitespace-nowrap",
                active ? "text-ink font-semibold" : "text-ink-muted hover:text-ink font-medium",
              )}
            >
              <span>{value === "income" ? "Income" : "Expense"}</span>
              <MoneyAmount
                amount={flow[value]}
                className={cn(
                  "font-num",
                  value === "income" ? "text-inflow" : active ? "text-ink" : "text-ink-muted",
                )}
              />
            </Link>
          );
        })}
      </nav>

      <p className="caption px-1">Converted to {currency}. Transfers excluded.</p>

      {totals.length === 0 ? (
        <div className="proto-card py-10 text-center text-sm text-ink-muted">
          No {type} for {period.label}.
        </div>
      ) : (
        <>
          <section className="sec-wrap" aria-label="Category breakdown chart">
            <div className="sec-head">
              <h2 className="sec-title">
                {type === "expense" ? "Where your money went" : "Where your money came from"}
              </h2>
              <span className="caption">
                {period.label} · {totals.length}{" "}
                {totals.length === 1 ? "category" : "categories"}
              </span>
            </div>

            <div className="proto-card">
              <div className="grid items-center gap-5 sm:grid-cols-2">
                <DeferredCategoryDonut
                  slices={slices}
                  total={flow[type]}
                  label={type === "expense" ? "Total spent" : "Total received"}
                />
                <ul aria-label="Chart labels" className="hidden space-y-4 sm:block">
                  {slices.map((slice) => (
                    <li key={slice.name} className="min-w-0 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="dot"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="text-ink min-w-0 flex-1 break-words font-medium">
                          {slice.name}
                        </span>
                        <span className="font-num tabular text-ink shrink-0 font-semibold">
                          {(slice.share * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-ink-muted mt-1 flex flex-wrap justify-between gap-1 pl-4">
                        <span>
                          {slice.transactionCount}{" "}
                          {slice.transactionCount === 1 ? "transaction" : "transactions"}
                        </span>
                        <MoneyAmount amount={slice.total} className="text-ink font-semibold" />
                      </div>
                      <div
                        aria-hidden="true"
                        className="cat-bar-track mt-2 ml-4"
                      >
                        <div
                          className="cat-bar-fill"
                          style={{
                            width: `${slice.share * 100}%`,
                            backgroundColor: slice.color,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="sec-wrap" aria-label="Categories ranked">
            <div className="sec-head">
              <h2 className="sec-title">Categories</h2>
              <span className="caption">Converted to {currency}</span>
            </div>
            <ul aria-label="Categories ranked by amount" className="group-card">
              {totals.map((entry, index) => {
                const category = categories[entry.categoryId ?? ""];
                const color =
                  CHART_COLORS.categories[index % CHART_COLORS.categories.length];
                const query = new URLSearchParams({
                  month,
                  type,
                  category: entry.categoryId ?? "none",
                });
                return (
                  <li key={entry.categoryId ?? "none"}>
                    <Link
                      href={`/transactions?${query}`}
                      className="insight-summary-row hover:bg-surface-container-low transition-colors"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <RowIconTile color={color}>
                          <CategoryIcon category={category} size={17} />
                        </RowIconTile>
                        <div className="min-w-0 flex-1">
                          <span className="tx-title block truncate">
                            {categoryLabel(category)}
                          </span>
                          <span className="caption mt-0.5 block">
                            {entry.transactionCount}{" "}
                            {entry.transactionCount === 1 ? "transaction" : "transactions"}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="caption font-num tabular">
                          {(entry.share * 100).toFixed(1)}%
                        </span>
                        <MoneyAmount
                          amount={entry.total}
                          className={cn(
                            "numeric-md",
                            type === "income" ? "text-inflow" : "text-ink",
                          )}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
