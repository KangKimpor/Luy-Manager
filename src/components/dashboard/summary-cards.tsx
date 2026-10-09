import { ArrowDownRight, ArrowUpRight, ArrowUpRight as OpenArrow, Wallet } from "lucide-react";
import Link from "next/link";

import { MoneyAmount } from "@/components/money-amount";
import { Card } from "@/components/ui/card";
import type { NetWorthSummary } from "@/lib/domain/accounts";
import type { CashFlowSummary } from "@/lib/domain/transactions";
import { isZero, type Money } from "@/lib/money";

export function SummaryCards({ netWorth, cashFlow, netWorthEquivalent, periodLabel }: {
  netWorth: NetWorthSummary;
  cashFlow: CashFlowSummary;
  netWorthEquivalent?: Money;
  periodLabel: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="bg-brand text-surface relative overflow-hidden border-0 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-surface/80"><Wallet size={17} aria-hidden="true" />Net worth</span>
          <Link href="/accounts" aria-label="View your accounts" className="bg-surface/10 hover:bg-surface/20 flex size-11 items-center justify-center rounded-full transition-colors"><OpenArrow size={20} aria-hidden="true" /></Link>
        </div>
        <MoneyAmount amount={netWorth.netWorth} className="text-display-hero mt-5 block tracking-tight sm:text-5xl" />
        {netWorthEquivalent ? <p className="text-surface/75 mt-2 text-sm">~ <MoneyAmount amount={netWorthEquivalent} /> equivalent</p> : null}
        <div className="border-surface/20 mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm text-surface/80">
          <span>Cash <MoneyAmount amount={netWorth.cash} className="ml-1 font-semibold text-surface" /></span>
          {!isZero(netWorth.liabilities) ? <span>Owed <MoneyAmount amount={netWorth.liabilities} className="ml-1 font-semibold text-surface" /></span> : null}
        </div>
        <p className="text-surface/70 mt-3 text-xs">Combined balances converted to {netWorth.netWorth.currency}</p>
      </Card>
      <Card className="flex flex-col justify-center p-6 sm:p-8">
        <p className="text-ink-muted mb-5 text-sm font-medium">{periodLabel}</p>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="bg-inflow-soft text-inflow flex size-11 shrink-0 items-center justify-center rounded-2xl"><ArrowUpRight size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="text-ink-muted text-sm">Income</p><MoneyAmount amount={cashFlow.income} className="text-numeric-lg mt-1 block" /></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-outflow-soft text-outflow flex size-11 shrink-0 items-center justify-center rounded-2xl"><ArrowDownRight size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="text-ink-muted text-sm">Spending</p><MoneyAmount amount={cashFlow.expense} className="text-numeric-lg mt-1 block" /></div>
          </div>
        </div>
        <p className="text-ink-faint mt-5 text-xs">Totals converted to {cashFlow.income.currency}</p>
      </Card>
    </div>
  );
}
