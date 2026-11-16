import { ArrowRightLeft, ReceiptText, Send } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { CategoryIcon, categoryColorToken, RowIconTile } from "@/components/category-icon";
import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { transferRoutesFor } from "@/components/transaction-row";
import { activityDays } from "@/lib/domain/activity";
import { categoryLabel } from "@/lib/domain/categories";
import type { AccountBalance, Category, Transaction } from "@/lib/domain/types";
import { DEFAULT_RATE, isZero, money, type CurrencyCode, type ExchangeRate } from "@/lib/money";
import { CHART_COLORS } from "@/lib/theme";

const TRANSFER_TILE_COLOR = CHART_COLORS.categories[6];

export function RecentActivityDays({
  transactions,
  categories,
  accounts,
  displayCurrency,
  rate = DEFAULT_RATE,
  limit = 6,
}: {
  transactions: readonly Transaction[];
  categories: Record<string, Category>;
  accounts: Record<string, AccountBalance>;
  displayCurrency: CurrencyCode;
  rate?: ExchangeRate;
  limit?: number;
}) {
  const routes = transferRoutesFor(transactions, accounts);
  const shown = [...transactions]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
  const days = activityDays(shown, displayCurrency, rate);

  return (
    <section className="sec-wrap order-4 lg:order-none" aria-label="Recent activity">
      <div className="sec-head">
        <h2 className="sec-title">Recent</h2>
        <Link href="/transactions" className="text-link">
          All activity
        </Link>
      </div>

      {days.length === 0 ? (
        <div className="proto-card py-8 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <ReceiptText size={22} aria-hidden="true" />
          </span>
          <p className="font-semibold text-ink">A fresh start</p>
          <p className="mt-1 text-sm text-ink-muted">Your transactions will appear here.</p>
          <Link href="/add" className="mt-4 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-brand">
            Add a transaction
          </Link>
        </div>
      ) : (
        days.map((day) => (
          <div key={day.date} className="day-group">
            <div className="day-header">
              <span>{day.label}</span>
              {!isZero(day.flow.expense) ? (
                <span className="day-header-total">
                  <MoneyAmount amount={day.flow.expense} /> spent
                </span>
              ) : null}
            </div>
            <ul className="tx-list-group">
              {day.transactions.map((transaction) => {
                const isTransfer = transaction.type === "transfer";
                const category = transaction.categoryId
                  ? categories[transaction.categoryId]
                  : undefined;
                const tileColor = isTransfer
                  ? TRANSFER_TILE_COLOR
                  : categoryColorToken(category);
                const title =
                  transaction.notes ??
                  (category ? categoryLabel(category) : isTransfer ? "Transfer" : "Transaction");
                const subtitle =
                  routes[transaction.id] ?? accounts[transaction.accountId]?.name ?? "Account";
                const amount = money(transaction.amount, transaction.currency);

                return (
                  <li key={transaction.id} className="tx-home-row">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <RowIconTile color={tileColor}>
                        {isTransfer ? (
                          <ArrowRightLeft size={17} aria-hidden="true" />
                        ) : (
                          <CategoryIcon category={category} size={17} />
                        )}
                      </RowIconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-medium leading-[21px] tracking-[-0.014em] text-ink">
                          {title}
                        </p>
                        <p className="caption flex min-w-0 items-center gap-1.5 truncate">
                          <span className="truncate">{subtitle}</span>
                          {transaction.createdVia === "telegram" ? (
                            <Send
                              size={11}
                              aria-label="Added via Telegram"
                              className="shrink-0 text-brand"
                            />
                          ) : null}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <MoneyAmount
                        amount={amount}
                        showPlus={!isTransfer}
                        showSign={!isTransfer}
                        className={
                          isTransfer
                            ? "whitespace-nowrap text-[16px] font-semibold leading-[21px] tracking-[-0.014em] text-ink-muted"
                            : transaction.amount > 0
                              ? "whitespace-nowrap text-[16px] font-semibold leading-[21px] tracking-[-0.014em] text-inflow"
                              : "whitespace-nowrap text-[16px] font-semibold leading-[21px] tracking-[-0.014em] text-ink"
                        }
                      />
                      <CurrencyBadge currency={transaction.currency} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
