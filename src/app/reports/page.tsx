import { categoryLabel } from "@/lib/domain/categories";
import { ArrowUpRight } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { CategoryIcon } from "@/components/category-icon";
import { CurrencyToggle } from "@/components/currency-toggle";
import { MoneyAmount } from "@/components/money-amount";
import { MonthStepper } from "@/components/month-stepper";
import { DeferredCategoryDonut } from "@/components/reports/deferred-category-donut";
import { Card, CardBody } from "@/components/ui/card";
import { categoryLookup } from "@/lib/data/reference";
import { listLedgerLinesInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { categoryChartShares, incomeByCategory, spendingByCategory, summarizeCashFlow } from "@/lib/domain/transactions";
import { monthFromParam, monthParam, shiftMonth } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { CHART_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; type?: string }> }) {
  const params = await searchParams;
  const period = monthFromParam(params.month);
  const month = monthParam(period);
  const type = params.type === "income" ? "income" : "expense";
  const [currency, { rate }, lines, categories] = await Promise.all([
    readDisplayCurrency(), loadUsdKhrRate(), listLedgerLinesInRange(period.from, period.to), categoryLookup(),
  ]);
  const flow = summarizeCashFlow(lines, currency, rate);
  const totals = type === "income" ? incomeByCategory(lines, currency, rate) : spendingByCategory(lines, currency, rate);
  const slices = categoryChartShares(totals).map((entry, index) => ({
    ...entry, name: entry.other ? "Everything else" : entry.categoryId ? categoryLabel(categories[entry.categoryId]) : "Uncategorised",
    color: CHART_COLORS.categories[index],
  }));
  const monthHref = (offset: number) => `/reports?month=${monthParam(shiftMonth(period, offset))}&type=${type}`;

  return <div className="page-enter mx-auto max-w-4xl space-y-5">
    <div className="flex items-center justify-between gap-3">
      <Link href="/reports/overall" className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand">Overall report<ArrowUpRight size={16} aria-hidden="true" /></Link>
      <CurrencyToggle current={currency} />
    </div>
    <MonthStepper label={period.label} prevHref={monthHref(-1)} nextHref={monthHref(1)} />
    <nav aria-label="Report type" className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-container-low p-1">
      {(["income", "expense"] as const).map(value => <Link key={value} href={`/reports?month=${month}&type=${value}`} aria-current={type === value ? "page" : undefined}
        className={cn("flex min-h-13 flex-wrap items-center justify-center gap-x-2 rounded-xl px-3 py-2 text-sm font-semibold", type === value ? "bg-surface shadow-card" : "text-ink-muted", value === "income" ? "text-inflow" : "text-outflow")}>
        {value === "income" ? "Income" : "Expense"}<MoneyAmount amount={flow[value]} />
      </Link>)}
    </nav>
    <p className="text-xs text-ink-faint">Converted to {currency}. Transfers excluded.</p>
    {totals.length === 0 ? <Card><CardBody className="py-10 text-center text-sm text-ink-muted">No {type} for {period.label}.</CardBody></Card> : <>
      <Card><CardBody className="pt-5">
        <h2 className="mb-1 text-base font-semibold text-ink">{type === "expense" ? "Where your money went" : "Where your money came from"}</h2>
        <p className="mb-3 text-xs text-ink-muted">{period.label} · {totals.length} categories</p>
        <DeferredCategoryDonut slices={slices} total={flow[type]} label={type === "expense" ? "Total spent" : "Total received"} />
        <ul aria-label="Chart labels" className="mt-4 space-y-3">
          {slices.map((slice, index) => <li key={index} className="flex min-w-0 items-center gap-2 text-xs">
            <span style={{ color: slice.color }}><CategoryIcon category={slice.other ? null : categories[slice.categoryId ?? ""]} size={15} /></span>
            <span className="min-w-0 flex-1 truncate text-ink-muted">{slice.name}</span>
            <MoneyAmount amount={slice.total} className="shrink-0 font-semibold text-ink" />
            <span className="tabular w-14 shrink-0 text-right text-ink-muted">{(slice.share * 100).toFixed(1)}%</span>
          </li>)}
        </ul>
      </CardBody></Card>
      <Card><CardBody><ul aria-label="Categories ranked by amount" className="divide-y divide-surface-variant">
        {totals.map((entry, index) => {
          const category = categories[entry.categoryId ?? ""];
          const color = CHART_COLORS.categories[index % CHART_COLORS.categories.length];
          const query = new URLSearchParams({ month, type, category: entry.categoryId ?? "none" });
          return <li key={entry.categoryId ?? "none"}>
            <Link href={`/transactions?${query}`} className="flex min-h-16 items-center gap-3 py-3">
              <span className="tabular flex min-h-9 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}>{(entry.share * 100).toFixed(1)}%</span>
              <span className="text-ink-muted"><CategoryIcon category={category} /></span>
              <span className="min-w-0 flex-1 text-sm font-medium text-ink"><span className="block truncate">{categoryLabel(category)}</span><span className="mt-1 block text-xs font-normal text-ink-faint">{entry.transactionCount} {entry.transactionCount === 1 ? "transaction" : "transactions"}</span></span>
              <MoneyAmount amount={entry.total} className="shrink-0 text-sm font-semibold" />
            </Link>
          </li>;
        })}
      </ul></CardBody></Card>
    </>}
  </div>;
}
