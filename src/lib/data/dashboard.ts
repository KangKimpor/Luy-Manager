import { currentPeriod, summarizeBudgets } from "@/lib/domain/budgets";
import type { ExchangeRate } from "@/lib/money";
import type { Period } from "@/lib/period";
import { listBudgets } from "./budgets";
import { listLedgerLinesInRange, listTransactions } from "./transactions";

/** One union read avoids downloading the month again for overlapping budgets. */
export async function loadDashboardLedger(period: Period, rate: ExchangeRate, now = new Date()) {
  const budgets = await listBudgets();
  const windows = budgets.map(budget => currentPeriod(budget, now));
  const from = new Date(Math.min(period.from.getTime(), ...windows.map(window => window.from.getTime())));
  const to = new Date(Math.max(period.to.getTime(), ...windows.map(window => window.to.getTime() - 1)));
  const [lines, recent] = await Promise.all([
    listLedgerLinesInRange(from, to),
    listTransactions({ from: period.from, to: period.to }, { number: 1, size: 5 }),
  ]);
  return {
    lines: lines.filter(line => { const at = new Date(line.occurredAt); return at >= period.from && at <= period.to; }),
    recent: recent.transactions,
    progress: summarizeBudgets(budgets, lines, rate, now),
  };
}
