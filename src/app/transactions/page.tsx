import { Plus, Search } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { ActivityCalendar } from "@/components/activity-calendar";
import { CurrencyToggle } from "@/components/currency-toggle";
import { MoneyAmount } from "@/components/money-amount";
import { MonthStepper } from "@/components/month-stepper";
import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionHistory } from "@/components/transaction-history";
import { transferRoutesFor } from "@/components/transaction-row";
import { Card, CardBody } from "@/components/ui/card";
import { activityHref, type ActivityParams } from "@/lib/activity-url";
import { isDemoMode } from "@/lib/auth";
import { listAccountBalances } from "@/lib/data/accounts";
import { getSettings, listCategories, merchantLookup } from "@/lib/data/reference";
import { listDeletedTransactions, listTransactionsInRange } from "@/lib/data/transactions";
import { readDisplayCurrency } from "@/lib/display-currency";
import { balanceOf } from "@/lib/domain/accounts";
import { activityDays, filterActivity, limitActivityDays, weekStart } from "@/lib/domain/activity";
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
    rows: single("rows"),
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
  // Render a bounded page of whole days. The month totals above still cover every
  // filtered entry, so "Showing the newest N" never changes the figures.
  const requestedRows = params.rows === "all" ? Infinity : Number(params.rows ?? 100);
  const rowBudget = requestedRows === Infinity
    ? Infinity
    : Number.isFinite(requestedRows) && requestedRows > 0
      ? Math.max(50, Math.trunc(requestedRows))
      : 100;
  const visible = limitActivityDays(selectedDays, rowBudget);
  const visibleRows = visible.days.flatMap(day => day.transactions);
  const visibleIds = new Set(visibleRows.map(transaction => transaction.id));
  // Resolve transfer labels against the whole month, then ship only the labels
  // for rows actually rendered. A leg whose counterpart is on the next page still
  // reads "ABA USD to Wing" instead of losing its route.
  const transferLabels = Object.fromEntries(
    Object.entries(transferRoutesFor(transactions, lookup)).filter(([id]) => visibleIds.has(id)),
  );
  const hasFilters = Boolean(params.account || params.category || params.type || params.q);
  const converted = filtered.some(transaction => transaction.type !== "transfer" && transaction.currency !== currency);
  const editable = !isDemoMode();
  const historyProps = { accounts: lookup, categories: categoryMap, merchants, editable };

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthStepper
          label={period.label}
          prevHref={activityHref(params, { month: monthParam(shiftMonth(period, -1)) })}
          nextHref={activityHref(params, { month: monthParam(shiftMonth(period, 1)) })}
        />
        <div className="flex items-center gap-2">
          <CurrencyToggle current={currency} />
          <Link
            href="/add"
            aria-label="Add a transaction"
            className="rounded-pill bg-brand text-on-action flex size-11 shrink-0 items-center justify-center"
          >
            <Plus size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <nav aria-label="Activity view" className="segmented-control segmented-control-full">
        {(["daily", "calendar"] as const).map((value) => (
          <Link
            key={value}
            href={activityHref(params, { view: value })}
            aria-current={view === value ? "page" : undefined}
            className={cn(
              "rounded-pill relative z-10 flex min-h-8 items-center justify-center text-[13px] leading-[18px] tracking-[-0.006em] whitespace-nowrap",
              view === value ? "text-ink font-semibold" : "text-ink-muted font-medium",
            )}
          >
            {value === "daily" ? "Daily" : "Calendar"}
          </Link>
        ))}
      </nav>

      {selectedAccount ? (
        <Card>
          <CardBody className="flex items-center justify-between gap-3 pt-4 pb-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{selectedAccount.name}</p>
              <p className="caption">
                Balance <MoneyAmount amount={balanceOf(selectedAccount)} />
              </p>
            </div>
            <Link
              href={activityHref(params, { account: undefined })}
              className="text-link shrink-0 font-medium"
            >
              All accounts
            </Link>
          </CardBody>
        </Card>
      ) : null}

      <TransactionFilters key={`${month}:${params.q ?? ""}`} accounts={accounts} categories={categories} month={month} selected={params} />

      <dl className="stat-group" aria-label="Filtered totals">
        <div className="stat-cell">
          <dt className="stat-label">Entries</dt>
          <dd className="stat-val tabular">{filtered.length}</dd>
        </div>
        <div className="stat-cell">
          <dt className="stat-label">Spent</dt>
          <dd className="stat-val tabular">
            <MoneyAmount amount={flow.expense} />
          </dd>
        </div>
        <div className="stat-cell">
          <dt className="stat-label">Came in</dt>
          <dd className="stat-val text-inflow tabular">
            <MoneyAmount amount={flow.income} />
          </dd>
        </div>
      </dl>
      {converted ? (
        <p className="caption px-1 text-xs">Totals converted to {currency}. Transfers left out.</p>
      ) : null}

      {view === "calendar" ? (
        <ActivityCalendar period={period} days={days} currency={currency} startsOn={weekStart(settings?.weekStartsOn)} params={params} />
      ) : null}

      {selectedDays.length ? (
        <>
          <TransactionHistory {...historyProps} days={visible.days} transactions={visibleRows} transferLabels={transferLabels} />
          {visible.rows < visible.total ? (
            <p className="caption text-center">
              Showing the newest {visible.rows} of {visible.total}.{" "}
              <Link
                href={activityHref(params, { rows: visible.rows + 100 >= visible.total ? "all" : String(visible.rows + 100) })}
                className="text-brand inline-flex min-h-11 items-center font-semibold"
              >
                Show more
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <Card>
          <CardBody className="py-8 text-center">
            <Search size={22} aria-hidden="true" className="mx-auto mb-3 text-brand" />
            <p className="font-semibold text-ink">{view === "calendar" && !params.day ? "Choose a day" : "Nothing here yet"}</p>
            <p className="mt-2 text-sm text-ink-muted">
              {view === "calendar" && !params.day ? "Tap a date to see its transactions." : `No matching transactions for ${params.day ?? period.label}.`}
            </p>
            {hasFilters ? (
              <Link href={activityHref({ month, view, day: params.day })} className="text-brand mt-3 inline-flex min-h-11 items-center text-sm font-semibold">
                Clear filters
              </Link>
            ) : null}
          </CardBody>
        </Card>
      )}

      {editable ? (
        <section aria-label="Recently deleted" className="space-y-4">
          <Link href={activityHref(params, { deleted: params.deleted ? undefined : "1" })} className="inline-flex min-h-11 items-center text-xs font-semibold text-ink-muted">
            {params.deleted ? "Hide deleted entries" : "Recently deleted"}
          </Link>
          {params.deleted ? (
            <>
              <p className="text-xs text-ink-faint">Up to 50 recently deleted entries for this month. Restore a transfer to bring back both legs.</p>
              <TransactionHistory {...historyProps} days={activityDays(filteredDeleted, currency, rate)} transactions={deleted} deleted />
              {filteredDeleted.length === 0 ? <p className="text-sm text-ink-muted">No matching deleted entries.</p> : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
