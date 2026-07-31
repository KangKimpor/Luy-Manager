import { Plus, Settings } from "lucide-react";
import Link from "next/link";

import { AccountRowActions } from "@/components/account-row-actions";
import { CurrencyToggle } from "@/components/currency-toggle";
import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { isDemoMode } from "@/lib/auth";
import { listAccountBalances } from "@/lib/data/accounts";
import { otherCurrency, readDisplayCurrency } from "@/lib/display-currency";
import { ACCOUNT_TYPE_LABELS, balanceOf, summarizeNetWorth } from "@/lib/domain/accounts";
import type { AccountType } from "@/lib/domain/types";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { cn } from "@/lib/utils";

/**
 * Accounts, PRD Section 6.
 *
 * Grouped by type so the shape of someone's money is legible at a glance: what is
 * spendable, what is put away, what is owed. Each balance stays in the account's
 * own currency, since that is the figure the bank app will show.
 *
 * Only the net worth total follows the currency toggle. Converting the individual
 * rows would be actively unhelpful: the point of a per-account balance is to be
 * checked against the bank, and a converted figure cannot be.
 */

const GROUP_ORDER: AccountType[] = [
  "bank",
  "ewallet",
  "cash",
  "savings",
  "investment",
  "credit_card",
];

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

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    accounts: accounts.filter((account) => account.type === type),
  })).filter((group) => group.accounts.length > 0);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink text-2xl font-bold">Accounts</h1>
          <p className="text-ink-muted text-sm">
            Net worth <MoneyAmount amount={summary.netWorth} className="font-semibold" />
            <span className="text-ink-faint">
              {" "}
              ≈ <MoneyAmount amount={equivalent} />
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <CurrencyToggle current={displayCurrency} />
          <Link
            href="/settings"
            aria-label="Settings"
            className="text-ink-muted hover:text-ink flex size-9 items-center justify-center"
          >
            <Settings size={18} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {accounts.length === 0 ? (
        <Card>
          <CardBody className="space-y-3 text-center">
            <p className="text-ink text-sm font-semibold">No accounts yet</p>
            <p className="text-ink-muted text-sm">
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

      {grouped.map((group) => (
        <Card key={group.type}>
          <CardHeader>
            <CardTitle>{ACCOUNT_TYPE_LABELS[group.type]}</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-border-subtle/70 divide-y">
              {group.accounts.map((account) => (
                <li
                  key={account.accountId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        account.isActive ? "text-ink" : "text-ink-faint line-through",
                      )}
                    >
                      {account.name}
                    </p>
                    <p className="text-ink-faint text-xs">
                      {account.transactionCount} transactions
                      {!account.isActive ? " · closed" : null}
                      {account.isActive && !account.includeInNetWorth
                        ? " · not counted"
                        : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <MoneyAmount
                      amount={balanceOf(account)}
                      colorBySign={account.type === "credit_card"}
                      className="text-sm font-semibold"
                    />
                    <CurrencyBadge currency={account.currency} />
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
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
