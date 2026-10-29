import { currentPeriod, summarizeBudgets } from "@/lib/domain/budgets";
import type { ExchangeRate } from "@/lib/money";
import type { Period } from "@/lib/period";
import { listBudgets } from "./budgets";
import { listLedgerLinesInRange, listRecentTransactions } from "./transactions";

/** One union read avoids downloading the month again for overlapping budgets. */
export async function loadDashboardLedger(period: Period, rate: ExchangeRate | Promise<ExchangeRate>, now = new Date()) {
  // Reads do not depend on the rate, and recent rows do not depend on budgets.
  const [{ budgets, lines }, recent, resolvedRate] = await Promise.all([
    listBudgets().then(async budgets => {
      const windows = budgets.map(budget => currentPeriod(budget, now));
      const from = new Date(Math.min(period.from.getTime(), ...windows.map(window => window.from.getTime())));
      const to = new Date(Math.max(period.to.getTime(), ...windows.map(window => window.to.getTime() - 1)));
      const lines = await listLedgerLinesInRange(from, to);
      return { budgets, lines };
    }),
    listRecentTransactions({ from: period.from, to: period.to }),
    rate,
  ]);
  return {
    lines: lines.filter(line => { const at = new Date(line.occurredAt); return at >= period.from && at <= period.to; }),
    recent,
    progress: summarizeBudgets(budgets, lines, resolvedRate, now),
  };
}
