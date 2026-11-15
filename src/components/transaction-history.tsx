import { MoneyAmount } from "@/components/money-amount";
import { TransactionActions } from "@/components/transaction-actions";
import { TransactionRow, transferRoutesFor } from "@/components/transaction-row";
import type { ActivityDay } from "@/lib/domain/activity";
import type { AccountBalance, Category, Merchant, Transaction } from "@/lib/domain/types";
import { isZero } from "@/lib/money";

export function TransactionHistory({ days, transactions, categories, accounts, merchants = {}, editable, deleted = false, transferLabels }: {
  days: readonly ActivityDay[];
  transactions: readonly Transaction[];
  categories: Record<string, Category>;
  accounts: Record<string, AccountBalance>;
  merchants?: Record<string, Merchant>;
  editable: boolean;
  deleted?: boolean;
  /** Precomputed transfer routes, so a partial page need not receive the month. */
  transferLabels?: Record<string, string>;
}) {
  const labels = transferLabels ?? transferRoutesFor(transactions, accounts);
  const content = (
    <div className="stagger-children">
      {days.map((day) => (
        <section key={day.date} aria-label={day.label} className="day-group">
          <div className="day-header">
            <h2 className="text-[13px] leading-[18px] font-semibold text-ink-muted">{day.label}</h2>
            {!deleted ? (
              <div className="day-header-total flex flex-wrap justify-end gap-x-2">
                {!isZero(day.flow.expense) ? (
                  <span aria-label="Day expense">
                    <MoneyAmount amount={day.flow.expense} /> spent
                  </span>
                ) : null}
                {!isZero(day.flow.income) ? (
                  <span aria-label="Day income" className="text-inflow">
                    <MoneyAmount amount={day.flow.income} showPlus />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <ul className="tx-activity-group">
            {day.transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                transactions={transactions}
                transferLabel={labels[transaction.id]}
                categories={categories}
                accounts={accounts}
                merchant={merchants[transaction.merchantId ?? ""]?.name}
                editable={editable}
                deleted={deleted}
                activity
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
  return editable ? <TransactionActions>{content}</TransactionActions> : content;
}
