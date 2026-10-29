import { Plus, Search, SlidersHorizontal } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { ActivityCalendar } from "@/components/activity-calendar";
import { CurrencyToggle } from "@/components/currency-toggle";
import { MoneyAmount } from "@/components/money-amount";
import { MonthStepper } from "@/components/month-stepper";
import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionHistory } from "@/components/transaction-history";
import { Card, CardBody } from "@/components/ui/card";
import { activityHref, type ActivityParams } from "@/lib/activity-url";
import { isDemoMode } from "@/lib/auth";
import { listAccountBalances } from "@/lib/data/accounts";
import { getSettings, listCategories, merchantLookup } from "@/lib/data/reference";
import { listDeletedTransactions, listTransactionsInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { balanceOf } from "@/lib/domain/accounts";
import { activityDays, filterActivity, weekStart } from "@/lib/domain/activity";
import { summarizeCashFlow } from "@/lib/domain/transactions";
import { TRANSACTION_TYPES, type Merchant } from "@/lib/domain/types";
import { monthFromParam, monthParam, shiftMonth } from "@/lib/period";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { cn } from "@/lib/utils";

export default async function TransactionsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const single = (key: string) => typeof raw[key] === "string" ? raw[key] as string : undefined;
  const period = monthFromParam(single("month"));
  const month = monthParam(period);
  const view = single("view") === "calendar" ? "calendar" : "daily";
  const day = single("day");
  const params: ActivityParams = {
    month, view, day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day.startsWith(`${month}-`) ? day : undefined,
    account: single("account"), category: single("category"), q: single("q"),
    type: TRANSACTION_TYPES.find(type => type === single("type")), deleted: single("deleted") === "1" ? "1" : undefined,
  };
  const transactionsPromise = listTransactionsInRange(period.from, period.to);
  const deletedPromise = params.deleted ? listDeletedTransactions(50, { from: period.from, to: period.to }) : Promise.resolve([]);
  const merchantsPromise = Promise.all([transactionsPromise, deletedPromise]).then(([txs, del]) => {
    const ids = [...txs, ...del].flatMap(transaction => transaction.merchantId ? [transaction.merchantId] : []);
    return ids.length > 0 ? merchantLookup(ids) : Promise.resolve({} as Record<string, Merchant>);
  });
  const [transactions, accounts, categories, settings, currency, { rate }, deleted, merchants] = await Promise.all([
    transactionsPromise, listAccountBalances(), listCategories(), getSettings(),
    readDisplayCurrency(), loadUsdKhrRate(), deletedPromise, merchantsPromise,
  ]);
  const lookup = Object.fromEntries(accounts.map(account => [account.accountId, account]));
  // Arriving from the Accounts list: say which account this is, with a way back out.
  const selectedAccount = params.account ? lookup[params.account] : undefined;
  const categoryMap = Object.fromEntries(categories.map(category => [category.id, category]));
  const filtered = filterActivity(transactions, params);
  const filteredDeleted = filterActivity(deleted, params);
  const days = activityDays(filtered, currency, rate);
  const flow = summarizeCashFlow(filtered, currency, rate);
  const selectedDays = view === "calendar" ? days.filter(group => group.date === params.day) : days;
  const hasFilters = Boolean(params.account || params.category || params.type || params.q);
  const converted = filtered.some(transaction => transaction.type !== "transfer" && transaction.currency !== currency);
  const editable = !isDemoMode();
  const historyProps = { transactions, accounts: lookup, categories: categoryMap, merchants, editable };

  return <div className="page-enter mx-auto max-w-4xl space-y-5">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-ink-faint">{filtered.length} {filtered.length === 1 ? "entry" : "entries"} this month</p>
      <div className="flex items-center gap-2"><CurrencyToggle current={currency} /><Link href="/add" aria-label="Add a transaction" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-on-action"><Plus size={20} aria-hidden="true" /></Link></div>
    </div>
    {selectedAccount ? <Card><CardBody className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{selectedAccount.name}</p>
        <p className="text-xs text-ink-faint">Balance <MoneyAmount amount={balanceOf(selectedAccount)} /></p>
      </div>
      <Link href={activityHref(params, { account: undefined })} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-brand">All accounts</Link>
    </CardBody></Card> : null}
    <MonthStepper label={period.label} prevHref={activityHref(params, { month: monthParam(shiftMonth(period, -1)) })} nextHref={activityHref(params, { month: monthParam(shiftMonth(period, 1)) })} />
    <div className="flex items-center gap-2">
      <nav aria-label="Activity view" className="grid flex-1 grid-cols-2 gap-1 rounded-2xl bg-surface-container-low p-1">
        {(["daily", "calendar"] as const).map(value => <Link key={value} href={activityHref(params, { view: value })} aria-current={view === value ? "page" : undefined} className={cn("flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold", view === value ? "bg-surface text-ink shadow-card" : "text-ink-muted")}>{value === "daily" ? "Daily" : "Calendar"}</Link>)}
      </nav>
      <details className="relative shrink-0">
        <summary aria-label={hasFilters ? "Filters applied" : "Filters and search"} className={cn("flex size-11 list-none items-center justify-center rounded-xl", hasFilters ? "bg-brand-soft text-brand" : "bg-surface text-ink-muted")}><SlidersHorizontal size={19} aria-hidden="true" /></summary>
        <div className="absolute right-0 z-20 mt-2 w-[min(335px,calc(100vw-40px))]">
          <TransactionFilters key={`${month}:${params.q ?? ""}`} accounts={accounts} categories={categories} month={month} selected={params} />
        </div>
      </details>
    </div>
    <Card><CardBody className="pt-4 pb-4"><dl className="grid grid-cols-3 gap-2 text-center">
      {(["income", "expense", "net"] as const).map(key => <div key={key} className="min-w-0"><dt className="text-[10px] font-medium text-ink-muted">{key === "net" ? "Total" : key === "income" ? "Income" : "Expense"}</dt><dd className={cn("mt-1 truncate text-sm font-semibold", key === "income" ? "text-inflow" : key === "expense" ? "text-outflow" : "text-ink")}><MoneyAmount amount={flow[key]} /></dd></div>)}
    </dl>{converted ? <p className="mt-3 text-center text-[10px] text-ink-faint">Converted to {currency}. Transfers excluded.</p> : null}</CardBody></Card>
    {view === "calendar" ? <ActivityCalendar period={period} days={days} currency={currency} startsOn={weekStart(settings?.weekStartsOn)} params={params} /> : null}
    {selectedDays.length ? <TransactionHistory {...historyProps} days={selectedDays} /> : <Card><CardBody className="py-8 text-center">
      <Search size={22} aria-hidden="true" className="mx-auto mb-3 text-brand" />
      <p className="font-semibold text-ink">{view === "calendar" && !params.day ? "Choose a day" : "Nothing here yet"}</p>
      <p className="mt-2 text-sm text-ink-muted">{view === "calendar" && !params.day ? "Tap a date to see its transactions." : `No matching transactions for ${params.day ?? period.label}.`}</p>
      {hasFilters ? <Link href={activityHref({ month, view, day: params.day })} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand">Clear filters</Link> : null}
    </CardBody></Card>}
    {editable ? <section aria-label="Recently deleted" className="space-y-4">
      <Link href={activityHref(params, { deleted: params.deleted ? undefined : "1" })} className="inline-flex min-h-11 items-center text-xs font-semibold text-ink-muted">{params.deleted ? "Hide deleted entries" : "Recently deleted"}</Link>
      {params.deleted ? <><p className="text-xs text-ink-faint">Up to 50 recently deleted entries for this month. Restore a transfer to bring back both legs.</p><TransactionHistory {...historyProps} days={activityDays(filteredDeleted, currency, rate)} transactions={deleted} deleted />{filteredDeleted.length === 0 ? <p className="text-sm text-ink-muted">No matching deleted entries.</p> : null}</> : null}
    </section> : null}
  </div>;
}
