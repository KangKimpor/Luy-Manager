import { MoneyAmount } from "@/components/money-amount";
import type { DailySpendingBreakdown } from "@/lib/domain/transactions";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function DailySpendingChart({
  breakdown,
  periodLabel,
}: {
  breakdown: DailySpendingBreakdown;
  periodLabel: string;
}) {
  if (breakdown.isFuturePeriod) {
    return (
      <div className="empty-month-chart">
        No spending recorded yet for {periodLabel}.
      </div>
    );
  }

  if (!breakdown.hasSpending) {
    return (
      <div className="empty-month-chart">
        Nothing spent in {periodLabel} yet.
      </div>
    );
  }

  return (
    <div
      className="daily-chart-wrap"
      role="img"
      aria-label={`Daily spending in ${periodLabel}, typical day ${formatMoney(breakdown.typicalDay)}`}
    >
      <div
        className="daily-bars"
        style={{
          gridTemplateColumns: `repeat(${breakdown.totalDays}, minmax(0, 1fr))`,
        }}
      >
        {breakdown.days.map((day) => {
          const dayLabel = day.isFuture
            ? `Day ${day.day}, upcoming`
            : `Day ${day.day}, ${formatMoney(day.amount)}`;
          return (
            <div
              key={day.date}
              title={dayLabel}
              className={cn(
                "daily-bar-slot",
                day.isToday && "is-today",
                day.isFuture && "is-future",
                day.isZero && !day.isFuture && "is-zero",
                day.isCapped && "is-capped",
              )}
            >
              {day.isToday ? <span className="daily-today-dot" aria-hidden="true" /> : null}
              <span
                className="daily-bar-fill"
                style={{ height: `${day.heightPercent}%` }}
              />
            </div>
          );
        })}

        {breakdown.typicalPercent > 0 ? (
          <div
            className="daily-typical-line"
            style={{ bottom: `${breakdown.typicalPercent}%` }}
          >
            <span className="daily-typical-label">
              typical <MoneyAmount amount={breakdown.typicalDay} />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
