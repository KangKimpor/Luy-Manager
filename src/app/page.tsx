import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { TransactionList } from "@/components/transaction-list";
import { summarizeNetWorth } from "@/lib/domain/accounts";
import {
  dailyCashFlow,
  spendingByCategory,
  summarizeCashFlow,
} from "@/lib/domain/transactions";
import {
  CATEGORY_LOOKUP,
  DEMO_ACCOUNTS,
  DEMO_BASE_CURRENCY,
  DEMO_PERIOD,
  DEMO_RATE,
  DEMO_TRANSACTIONS,
} from "@/lib/demo-data";
import { formatMoney, fromMajor } from "@/lib/money";

/**
 * Dashboard, PRD Section 11.
 *
 * A server component: every figure is derived from the ledger with pure
 * functions, so there is nothing to compute on the client and no loading state to
 * manage. Reads from demo data for now; the aggregation calls stay identical once
 * the Supabase queries replace it.
 */
export default function DashboardPage() {
  const accountLookup = Object.fromEntries(
    DEMO_ACCOUNTS.map((account) => [account.accountId, account]),
  );

  const netWorth = summarizeNetWorth(DEMO_ACCOUNTS, DEMO_BASE_CURRENCY, DEMO_RATE);
  const cashFlow = summarizeCashFlow(DEMO_TRANSACTIONS, DEMO_BASE_CURRENCY, DEMO_RATE);
  const categoryTotals = spendingByCategory(DEMO_TRANSACTIONS, DEMO_BASE_CURRENCY, DEMO_RATE);
  const series = dailyCashFlow(
    DEMO_TRANSACTIONS,
    DEMO_PERIOD.from,
    DEMO_PERIOD.to,
    DEMO_BASE_CURRENCY,
    DEMO_RATE,
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">July 2026</h1>
        <p className="text-ink-muted text-sm">
          Reporting in {DEMO_BASE_CURRENCY} at {formatMoney(fromMajor(DEMO_RATE.rate, "KHR"))} per $1
        </p>
      </header>

      <SummaryCards netWorth={netWorth} cashFlow={cashFlow} />

      <CashFlowChart series={series} currency={DEMO_BASE_CURRENCY} />

      <CategoryBreakdown totals={categoryTotals} categories={CATEGORY_LOOKUP} />

      <TransactionList
        transactions={DEMO_TRANSACTIONS}
        categories={CATEGORY_LOOKUP}
        accounts={accountLookup}
      />
    </div>
  );
}
