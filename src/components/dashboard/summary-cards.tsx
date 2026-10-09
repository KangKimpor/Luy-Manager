import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
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
    <div className="stagger-children grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card className="hero-orbit border-0 bg-ink p-6 text-surface sm:p-8">
        <div className="relative flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-surface/75"><Wallet size={17} aria-hidden="true" /> Total net worth</span>
          <Link href="/accounts" aria-label="View your accounts" className="card-interactive flex size-11 items-center justify-center rounded-full border border-surface/15 bg-surface/5 text-surface hover:bg-surface/15"><ArrowUpRight size={20} aria-hidden="true" /></Link>
        </div>
        <MoneyAmount amount={netWorth.netWorth} className="relative mt-5 block text-[clamp(1.9rem,7.5vw,3rem)] leading-tight font-semibold tracking-tight" />
        {netWorthEquivalent ? <p className="relative mt-2 text-sm text-surface/65">~ <MoneyAmount amount={netWorthEquivalent} /> equivalent</p> : null}
        <div className="relative mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-surface/15 pt-4">
          <div><p className="text-xs text-surface/60">Cash available</p><MoneyAmount amount={netWorth.cash} className="mt-1 block text-sm font-semibold" /></div>
          {!isZero(netWorth.liabilities) ? <div><p className="text-xs text-surface/60">Liabilities</p><MoneyAmount amount={netWorth.liabilities} className="mt-1 block text-sm font-semibold" /></div> : null}
        </div>
        <p className="relative mt-4 text-[11px] leading-relaxed text-surface/55">Account balances converted to {netWorth.netWorth.currency}</p>
      </Card>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between px-1"><p className="text-sm font-semibold text-ink">Your cash flow</p><span className="text-xs text-ink-faint">{periodLabel}</span></div>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <Card className="flex min-w-0 flex-col items-start justify-between p-4 sm:p-5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-inflow-soft text-inflow"><ArrowUpRight size={20} aria-hidden="true" /></span>
            <div className="mt-5 min-w-0"><p className="text-xs font-medium text-ink-muted">Income</p><MoneyAmount amount={cashFlow.income} className="mt-1.5 block text-[clamp(1rem,4.1vw,1.5rem)] font-semibold tracking-tight" /></div>
            <Link href="/add?type=income" className="card-interactive mt-3 flex min-h-11 items-center text-xs font-semibold text-inflow">Add income <ArrowUpRight size={14} aria-hidden="true" className="ml-1" /></Link>
          </Card>
          <Card className="flex min-w-0 flex-col items-start justify-between p-4 sm:p-5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-outflow-soft text-outflow"><ArrowDownRight size={20} aria-hidden="true" /></span>
            <div className="mt-5 min-w-0"><p className="text-xs font-medium text-ink-muted">Spending</p><MoneyAmount amount={cashFlow.expense} className="mt-1.5 block text-[clamp(1rem,4.1vw,1.5rem)] font-semibold tracking-tight" /></div>
            <Link href="/add?type=expense" className="card-interactive mt-3 flex min-h-11 items-center text-xs font-semibold text-outflow">Add expense <ArrowUpRight size={14} aria-hidden="true" className="ml-1" /></Link>
          </Card>
        </div>
        <p className="px-1 text-[11px] text-ink-faint">Converted to {cashFlow.income.currency}. Transfers excluded.</p>
      </div>
    </div>
  );
}
