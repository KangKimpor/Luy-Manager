import { MoneyAmount } from "@/components/money-amount";
import { TransactionRow } from "@/components/transaction-row";
import { Card, CardBody } from "@/components/ui/card";
import type { ActivityDay } from "@/lib/domain/activity";
import type { AccountBalance, Category, Merchant, Transaction } from "@/lib/domain/types";
import { isZero } from "@/lib/money";

export function TransactionHistory({ days, transactions, categories, accounts, merchants = {}, editable, deleted = false }: {
  days: readonly ActivityDay[];
  transactions: readonly Transaction[];
  categories: Record<string, Category>;
  accounts: Record<string, AccountBalance>;
  merchants?: Record<string, Merchant>;
  editable: boolean;
  deleted?: boolean;
}) {
  return <div className="stagger-children space-y-5">
    {days.map(day => <section key={day.date} aria-label={day.label}>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 text-ink"><span className="tabular text-2xl font-semibold">{day.day}</span><span className="rounded-pill bg-surface-container px-2 py-1 text-[10px] font-semibold text-ink-muted">{day.weekday}</span><span className="sr-only">{day.label}</span></h2>
        {!deleted ? <div className="flex flex-wrap justify-end gap-x-3 text-xs font-semibold">
          {!isZero(day.flow.income) ? <span aria-label="Day income"><MoneyAmount amount={day.flow.income} className="text-inflow" /></span> : null}
          {!isZero(day.flow.expense) ? <span aria-label="Day expense"><MoneyAmount amount={day.flow.expense} className="text-outflow" /></span> : null}
        </div> : null}
      </div>
      <Card><CardBody className="px-3 pt-1 pb-1"><ul className="divide-y divide-surface-variant">
        {day.transactions.map(transaction => <TransactionRow key={transaction.id} transaction={transaction} transactions={transactions} categories={categories} accounts={accounts} merchant={merchants[transaction.merchantId ?? ""]?.name} editable={editable} deleted={deleted} activity />)}
      </ul></CardBody></Card>
    </section>)}
  </div>;
}
