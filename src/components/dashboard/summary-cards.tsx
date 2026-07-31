import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { MoneyAmount } from "@/components/money-amount";
import { Card } from "@/components/ui/card";
import type { NetWorthSummary } from "@/lib/domain/accounts";
import type { CashFlowSummary } from "@/lib/domain/transactions";
import { isZero, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The dashboard metric cards from PRD Section 11.
 *
 * Net worth gets a full-width hero card because it is the one figure the whole
 * app exists to answer; the rest sit in a two-column grid below it. The card
 * composition follows the fitness_app reference template, where a single primary
 * metric leads and secondary metrics tile underneath.
 */

function MetricCard({
  label,
  amount,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  amount: Money;
  icon: LucideIcon;
  tone?: "neutral" | "inflow" | "outflow";
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-label-caps text-ink-muted uppercase">{label}</span>
        <Icon
          size={16}
          aria-hidden="true"
          className={cn(
            tone === "inflow" && "text-inflow",
            tone === "outflow" && "text-outflow",
            tone === "neutral" && "text-ink-faint",
          )}
        />
      </div>

      <MoneyAmount
        amount={amount}
        className={cn(
          "text-numeric-lg mt-2 block",
          tone === "inflow" && "text-inflow",
          tone === "outflow" && "text-outflow",
        )}
      />

      {hint ? <p className="text-ink-faint mt-1 text-xs">{hint}</p> : null}
    </Card>
  );
}

export function SummaryCards({
  netWorth,
  cashFlow,
  budgetRemaining,
  netWorthEquivalent,
}: {
  netWorth: NetWorthSummary;
  cashFlow: CashFlowSummary;
  budgetRemaining?: Money;
  /**
   * The same net worth in the other currency.
   *
   * Shown alongside rather than instead of the chosen figure because the question
   * "how much do I have" has two honest answers here: rent and savings are
   * thought about in dollars, daily spending in riel. Having both removes the need
   * to toggle just to do the sum in your head.
   */
  netWorthEquivalent?: Money;
}) {
  const overspending = cashFlow.net.minor < 0;

  return (
    <div className="space-y-3">
      {/*
        Hero: net worth. The one card allowed a gradient, so it reads as the
        answer the rest of the screen is explaining.

        No sparkline here, unlike the design mockup. A trend line needs net worth
        history, which this page does not load and cannot derive from a single
        month of transactions. Drawing a decorative curve would be inventing a
        trend the data does not support; the real series lives on Reports.
      */}
      <Card className="from-brand to-brand-container relative overflow-hidden border-0 bg-gradient-to-br p-5 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10 blur-2xl"
        />

        <span className="text-label-caps text-white/70 uppercase">Net Worth</span>
        <MoneyAmount amount={netWorth.netWorth} className="text-display-hero mt-1 block" />

        {/*
          ASCII "~", not "≈". U+2248 is outside every subset this app ships (Inter
          latin and Noto Sans Khmer), so it rendered as a tofu box right next to
          the figure it was qualifying.
        */}
        {netWorthEquivalent ? (
          <p className="text-body-md mt-0.5 text-white/70">
            ~ <MoneyAmount amount={netWorthEquivalent} className="font-semibold" />
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-4 text-xs text-white/80">
          <span className="flex items-center gap-1">
            <Wallet size={14} aria-hidden="true" />
            Cash <MoneyAmount amount={netWorth.cash} className="font-semibold text-white" />
          </span>
          {!isZero(netWorth.liabilities) && (
            <span className="flex items-center gap-1">
              <CreditCard size={14} aria-hidden="true" />
              Owed{" "}
              <MoneyAmount amount={netWorth.liabilities} className="font-semibold text-white" />
            </span>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Income"
          amount={cashFlow.income}
          icon={ArrowUpRight}
          tone="inflow"
          hint="This month"
        />
        <MetricCard
          label="Expense"
          amount={cashFlow.expense}
          icon={ArrowDownRight}
          tone="outflow"
          hint="This month"
        />
        <MetricCard
          label="Savings"
          amount={netWorth.savings}
          icon={PiggyBank}
          hint={overspending ? "Spending exceeds income" : undefined}
        />
        <MetricCard label="Investments" amount={netWorth.investments} icon={TrendingUp} />
      </div>

      {budgetRemaining ? (
        <MetricCard
          label="Budget Remaining"
          amount={budgetRemaining}
          icon={Wallet}
          tone={budgetRemaining.minor < 0 ? "outflow" : "inflow"}
        />
      ) : null}
    </div>
  );
}
