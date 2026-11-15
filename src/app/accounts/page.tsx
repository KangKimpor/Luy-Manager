import {
  ChevronRight,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  Smartphone,
  TrendingUp,
  Wallet,
  type AppIconType,
} from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";

import { AccountExport } from "@/components/account-export";
import { AccountRowActions } from "@/components/account-row-actions";
import { RowIconTile } from "@/components/category-icon";
import { CurrencyToggle } from "@/components/currency-toggle";
import { MoneyAmount } from "@/components/money-amount";
import { buttonVariants } from "@/components/ui/button";
import { activityHref } from "@/lib/activity-url";
import { isDemoMode } from "@/lib/auth";
import { listAccountBalances } from "@/lib/data/accounts";
import { readDisplayCurrency } from "@/lib/display-currency";
import {
  ACCOUNT_TYPE_LABELS,
  balanceOf,
  summarizeCurrencyPockets,
  summarizeNetWorth,
} from "@/lib/domain/accounts";
import type { AccountBalance, AccountType } from "@/lib/domain/types";
import { convert, formatMoney, fromMajor } from "@/lib/money";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { cn } from "@/lib/utils";

const GROUP_ICONS: Record<AccountType, AppIconType> = {
  bank: Landmark,
  ewallet: Smartphone,
  cash: Wallet,
  savings: PiggyBank,
  investment: TrendingUp,
  credit_card: CreditCard,
};

export default async function AccountsPage() {
  const [displayCurrency, { rate }, accounts] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
    listAccountBalances(),
  ]);

  const editable = !isDemoMode();
  const summary = summarizeNetWorth(accounts, displayCurrency, rate);
  const pockets = summarizeCurrencyPockets(accounts, displayCurrency, rate);
  const perDollar = formatMoney(fromMajor(rate.rate, "KHR"));

  const usdAccounts = accounts.filter((account) => account.currency === "USD");
  const khrAccounts = accounts.filter((account) => account.currency === "KHR");

  const pocketSections: ReadonlyArray<{
    key: "USD" | "KHR";
    label: string;
    ariaLabel: string;
    dotClass: string;
    tintColor: string;
    subtotal: typeof pockets.usd.subtotal;
    items: readonly AccountBalance[];
  }> = [
    {
      key: "USD",
      label: "Dollars",
      ariaLabel: "Dollar accounts",
      dotClass: "dot-usd-ink",
      tintColor: "var(--color-usd)",
      subtotal: pockets.usd.subtotal,
      items: usdAccounts,
    },
    {
      key: "KHR",
      label: "Riel",
      ariaLabel: "Riel accounts",
      dotClass: "dot-khr-ink",
      tintColor: "var(--color-khr)",
      subtotal: pockets.khr.subtotal,
      items: khrAccounts,
    },
  ];

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <CurrencyToggle current={displayCurrency} className="shrink-0" />
        <Link
          href="/accounts/new"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "px-4")}
        >
          <Plus size={16} aria-hidden="true" />
          Add an account
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="proto-card space-y-3 py-8 text-center">
          <span className="bg-brand-soft text-brand mx-auto flex size-12 items-center justify-center rounded-2xl">
            <Wallet size={22} aria-hidden="true" />
          </span>
          <p className="text-ink text-numeric-md">No accounts yet</p>
          <p className="text-ink-muted text-body-md">
            Add the banks, wallets and cash you actually use. There are presets for ABA, ACLEDA,
            Wing and TrueMoney.
          </p>
          <Link href="/accounts/new" className={buttonVariants({ size: "full" })}>
            <Plus size={16} aria-hidden="true" />
            Add your accounts
          </Link>
        </div>
      ) : (
        <>
          {pocketSections.map((section) =>
            section.items.length === 0 ? null : (
              <section key={section.key} className="sec-wrap" aria-label={section.ariaLabel}>
                <div className="acct-sec-head">
                  <h2 className="acct-sec-title m-0">
                    <span className={cn("dot", section.dotClass)} aria-hidden="true" />
                    {section.label}
                  </h2>
                  <MoneyAmount amount={section.subtotal} className="numeric-md text-ink" />
                </div>

                <ul className="tx-activity-group stagger-children">
                  {section.items.map((account) => {
                    const Icon = GROUP_ICONS[account.type];
                    const balance = balanceOf(account);
                    const showConverted = account.currency !== displayCurrency;

                    return (
                      <li key={account.accountId} className="acct-card-row">
                        <Link
                          href={activityHref({ account: account.accountId })}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <RowIconTile
                              color={
                                account.type === "credit_card"
                                  ? "var(--color-outflow)"
                                  : section.tintColor
                              }
                            >
                              <Icon size={19} aria-hidden="true" />
                            </RowIconTile>

                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "tx-title truncate",
                                  !account.isActive && "text-ink-faint line-through",
                                )}
                              >
                                {account.name}
                              </p>
                              <p className="caption mt-0.5 truncate">
                                {account.institution && account.institution !== account.name
                                  ? account.institution
                                  : ACCOUNT_TYPE_LABELS[account.type]}
                                {!account.isActive ? " · closed" : null}
                                {account.isActive && !account.includeInNetWorth
                                  ? " · not counted"
                                  : null}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <div className="flex flex-col items-end">
                              <MoneyAmount
                                amount={balance}
                                colorBySign={account.type === "credit_card"}
                                className="numeric-md whitespace-nowrap"
                              />
                              {showConverted ? (
                                <span className="caption tabular">
                                  ~ <MoneyAmount amount={convert(balance, displayCurrency, rate)} />
                                </span>
                              ) : null}
                            </div>
                            <ChevronRight
                              size={16}
                              aria-hidden="true"
                              className="text-ink-faint shrink-0"
                            />
                          </div>
                        </Link>

                        {editable ? (
                          <AccountRowActions
                            accountId={account.accountId}
                            name={account.name}
                            isActive={account.isActive}
                            transactionCount={account.transactionCount}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
          )}

          <p className="caption tabular pt-2 text-center">
            Total ~ <MoneyAmount amount={summary.netWorth} /> at $1 = {perDollar}
          </p>
        </>
      )}

      <AccountExport />
    </div>
  );
}
