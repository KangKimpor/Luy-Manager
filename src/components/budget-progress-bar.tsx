import { MoneyAmount } from "@/components/money-amount";
import type { BudgetProgress } from "@/lib/domain/budgets";
import { absolute } from "@/lib/money";
import { cn } from "@/lib/utils";

const FILL_CLASS = {
  under: "is-ok",
  warning: "is-warn",
  over: "is-over",
} as const;

export function BudgetPaceCaption({ entry }: { entry: BudgetProgress }) {
  if (entry.paceStatus === "over") {
    return (
      <span className="text-outflow font-medium">
        Over by <MoneyAmount amount={absolute(entry.remaining)} />
      </span>
    );
  }
  if (entry.paceStatus === "ahead-of-pace") return <span>Ahead of pace</span>;
  if (entry.paceStatus === "on-pace") return <span>On pace</span>;
  return <span>Under pace</span>;
}

export function BudgetProgressBar({
  entry,
  label,
}: {
  entry: BudgetProgress;
  label: string;
}) {
  const fillPercent = Math.min(100, Math.round(entry.fillRatio * 100));
  const rawPercent = Math.round(entry.fraction * 100);
  const paceLeft =
    entry.elapsedShare !== null
      ? Math.min(100, Math.max(0, Math.round(entry.elapsedShare * 100)))
      : null;

  return (
    <div className="budget-track-wrap">
      <div
        className="budget-track"
        role="progressbar"
        aria-valuenow={fillPercent}
        aria-valuetext={`${rawPercent}% spent`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("budget-fill", FILL_CLASS[entry.status])}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      {paceLeft !== null ? (
        <span
          className="budget-pace-tick"
          style={{ left: `${paceLeft}%` }}
          title={`Period elapsed: ${paceLeft}%`}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
