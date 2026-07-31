import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_TYPE_LABELS, balanceOf, summarizeNetWorth } from "@/lib/domain/accounts";
import type { AccountType } from "@/lib/domain/types";
import { DEMO_ACCOUNTS, DEMO_BASE_CURRENCY, DEMO_RATE } from "@/lib/demo-data";

/**
 * Accounts, PRD Section 6.
 *
 * Grouped by type so the shape of someone's money is legible at a glance: what
 * is spendable, what is put away, what is owed. Each balance stays in the
 * account's own currency, since that is the figure the bank app will show.
 */

const GROUP_ORDER: AccountType[] = [
  "bank",
  "ewallet",
  "cash",
  "savings",
  "investment",
  "credit_card",
];

export default function AccountsPage() {
  const summary = summarizeNetWorth(DEMO_ACCOUNTS, DEMO_BASE_CURRENCY, DEMO_RATE);

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    accounts: DEMO_ACCOUNTS.filter((account) => account.type === type),
  })).filter((group) => group.accounts.length > 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">Accounts</h1>
        <p className="text-ink-muted text-sm">
          Net worth <MoneyAmount amount={summary.netWorth} className="font-semibold" />
        </p>
      </header>

      {grouped.map((group) => (
        <Card key={group.type}>
          <CardHeader>
            <CardTitle>{ACCOUNT_TYPE_LABELS[group.type]}</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-border-subtle/70 divide-y">
              {group.accounts.map((account) => (
                <li key={account.accountId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-medium">{account.name}</p>
                    <p className="text-ink-faint text-xs">
                      {account.transactionCount} transactions
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <MoneyAmount
                      amount={balanceOf(account)}
                      colorBySign={account.type === "credit_card"}
                      className="text-sm font-semibold"
                    />
                    <CurrencyBadge currency={account.currency} />
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
