import {
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  Smartphone,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { AccountRowActions } from "@/components/account-row-actions";
import { CurrencyToggle } from "@/components/currency-toggle";
import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { isDemoMode } from "@/lib/auth";
import { listAccountBalances } from "@/lib/data/accounts";
import { otherCurrency, readDisplayCurrency } from "@/lib/display-currency";
import { ACCOUNT_TYPE_LABELS, balanceOf, summarizeNetWorth } from "@/lib/domain/accounts";
import type { AccountType } from "@/lib/domain/types";
import { totalInBaseCurrency } from "@/lib/money";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { cn } from "@/lib/utils";

/**
 * Accounts, PRD Section 6.
 *
 * Grouped by type so the shape of someone's money is legible at a glance: what is
 * spendable, what is put away, what is owed. Each balance stays in the account's
 * own currency, since that is the figure the bank app will show.
 *
 * Only the totals follow the currency toggle. Converting the individual rows would
 * be actively unhelpful: the point of a per-account balance is to be checked
 * against the bank, and a converted figure cannot be.
 */

const GROUP_ORDER: AccountType[] = [
  "bank",
  "ewallet",
  "cash",
  "savings",
  "investment",
  "credit_card",
];

const GROUP_ICONS: Record<AccountType, LucideIcon> = {
  bank: Landmark,
  ewallet: Smartphone,
  cash: Wallet,
  savings: PiggyBank,
  investment: TrendingUp,
  credit_card: CreditCard,
};

/**
 * Two tints, not six.
 *
 * The design mockup gave each account type its own colour, which looks lively but
 * encodes nothing: the colours were decorative and a reader learns nothing from
 * green versus red here. One distinction is worth colour, and it is the one that
 * changes the arithmetic: an asset adds to net worth, a credit card subtracts
 * from it.
 */
function tintFor(type: AccountType): string {
  return type === "credit_card" ? "bg-outflow-soft text-outflow" : "bg-brand-soft text-brand";
}

export default async function AccountsPage() {
  const [displayCurrency, { rate }, accounts] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
    listAccountBalances(),
  ]);

  const summary = summarizeNetWorth(accounts, displayCurrency, rate);
  // Aggregated in the other currency, not converted from the total above, so the
  // equivalent matches exactly what the toggle will show rather than differing by a
  // few riel of rounding.
  const equivalent = summarizeNetWorth(accounts, otherCurrency(displayCurrency), rate).netWorth;

  const grouped = GROUP_ORDER.map((type) => {
    const members = accounts.filter((account) => account.type === type);
    const balances = members.map(balanceOf);

    // A group of accounts all held in one currency has an exact subtotal. A group
    // mixing USD and KHR does not, so its subtotal is a conversion and is marked
    // as approximate rather than presented as a hard figure.
    const currencies = new Set(members.map((account) => account.currency));
    const isMixed = currencies.size > 1;
    const subtotalCurrency = isMixed ? displayCurrency : (members[0]?.currency ?? displayCurrency);

    return {
      type,
      accounts: members,
      isMixed,
      subtotal: totalInBaseCurrency(balances, subtotalCurrency, rate),
    };
  }).filter((group) => group.accounts.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label-caps text-ink-muted uppercase">Net worth</p>
          <MoneyAmount amount={summary.netWorth} className="text-headline-lg text-ink block" />
          {/* ASCII "~": U+2248 is not in any subset this app ships and tofus. */}
          <p className="text-body-md text-ink-faint">
            ~ <MoneyAmount amount={equivalent} />
          </p>
        </div>

        <CurrencyToggle current={displayCurrency} className="mt-1 shrink-0" />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardBody className="space-y-3 pt-4 text-center">
            <span className="bg-brand-soft text-brand mx-auto flex size-12 items-center justify-center rounded-full">
              <Wallet size={22} aria-hidden="true" />
            </span>
            <p className="text-ink text-numeric-md">No accounts yet</p>
            <p className="text-ink-muted text-body-md">
              Add the banks, wallets and cash you actually use. There are presets for
              ABA, ACLEDA, Wing and TrueMoney.
            </p>
            <Link href="/accounts/new" className={buttonVariants({ size: "full" })}>
              <Plus size={16} aria-hidden="true" />
              Add your accounts
            </Link>
          </CardBody>
        </Card>
      ) : (
        <Link
          href="/accounts/new"
          className={buttonVariants({ variant: "secondary", size: "full" })}
        >
          <Plus size={16} aria-hidden="true" />
          Add an account
        </Link>
      )}

      {grouped.map((group) => {
        const Icon = GROUP_ICONS[group.type];

        return (
          <section key={group.type} className="space-y-2">
            {/*
              Group heading sits outside the card, so the card holds only rows and
              the eye can run down a single column of balances uninterrupted.
            */}
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-label-caps text-ink-muted uppercase">
                {ACCOUNT_TYPE_LABELS[group.type]}
              </h2>
              <span className="text-numeric-md text-ink">
                {group.isMixed ? <span className="text-ink-faint">~ </span> : null}
                <MoneyAmount
                  amount={group.subtotal}
                  colorBySign={group.type === "credit_card"}
                />
              </span>
            </div>

            <Card className="overflow-hidden">
              <ul className="divide-surface-variant divide-y">
                {group.accounts.map((account) => (
                  <li key={account.accountId} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full",
                        tintFor(account.type),
                      )}
                    >
                      <Icon size={20} aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-numeric-md truncate",
                          account.isActive ? "text-ink" : "text-ink-faint line-through",
                        )}
                      >
                        {account.name}
                      </p>
                      <p className="text-ink-faint text-xs">
                        {account.institution ?? ACCOUNT_TYPE_LABELS[account.type]}
                        {" · "}
                        {account.transactionCount} transactions
                        {!account.isActive ? " · closed" : null}
                        {account.isActive && !account.includeInNetWorth
                          ? " · not counted"
                          : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <MoneyAmount
                          amount={balanceOf(account)}
                          colorBySign={account.type === "credit_card"}
                          className="text-numeric-md"
                        />
                        <CurrencyBadge currency={account.currency} />
                      </div>

                      {isDemoMode() ? null : (
                        <AccountRowActions
                          accountId={account.accountId}
                          name={account.name}
                          isActive={account.isActive}
                          transactionCount={account.transactionCount}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
