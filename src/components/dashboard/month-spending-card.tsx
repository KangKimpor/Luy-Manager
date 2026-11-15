import { DailySpendingChart } from "@/components/dashboard/daily-spending-chart";
import { MoneyAmount } from "@/components/money-amount";
import { MonthStepper } from "@/components/month-stepper";
import type { CashFlowSummary, DailySpendingBreakdown } from "@/lib/domain/transactions";
import type { Period } from "@/lib/period";

export function MonthSpendingCard({
  period,
  prevHref,
  nextHref,
  cashFlow,
  breakdown,
}: {
  period: Period;
  prevHref: string;
  nextHref: string;
  cashFlow: CashFlowSummary;
  breakdown: DailySpendingBreakdown;
}) {
  return (
    <section className="sec-wrap order-3 lg:order-none" aria-label={`${period.label} summary`}>
      <div className="month-sec-head">
        <MonthStepper compact label={period.label} prevHref={prevHref} nextHref={nextHref} />
        <span className="caption">
          Day {breakdown.elapsedDays} of {breakdown.totalDays}
        </span>
      </div>

      <div className="proto-card">
        <div className="month-figures">
          <div>
            <span className="month-fig-label">Spent</span>
            <span className="month-fig-val">
              <MoneyAmount amount={cashFlow.expense} />
            </span>
          </div>
          <div>
            <span className="month-fig-label">Came in</span>
            <span className="month-fig-val text-inflow">
              <MoneyAmount amount={cashFlow.income} />
            </span>
          </div>
          <div>
            <span className="month-fig-label">Left over</span>
            <span className="month-fig-val">
              <MoneyAmount amount={cashFlow.net} colorBySign showPlus />
            </span>
          </div>
        </div>

        <p className="caption month-note">
          Converted to {cashFlow.expense.currency}. Transfers left out.
        </p>

        <DailySpendingChart breakdown={breakdown} periodLabel={period.label} />
      </div>
    </section>
  );
}
