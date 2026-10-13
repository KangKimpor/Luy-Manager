import { AppLink as Link } from "@/components/app-link";
import { MoneyAmount } from "@/components/money-amount";
import { activityHref, type ActivityParams } from "@/lib/activity-url";
import { activityCalendar, weekdayLabels, type ActivityDay } from "@/lib/domain/activity";
import { formatMoney, isZero, type CurrencyCode } from "@/lib/money";
import type { Period } from "@/lib/period";
import { cn } from "@/lib/utils";

export function ActivityCalendar({ period, days, currency, startsOn, params }: {
  period: Period; days: readonly ActivityDay[]; currency: CurrencyCode; startsOn: number; params: ActivityParams;
}) {
  const cells = activityCalendar(period, days, currency, startsOn);
  return <div className="rounded-card border border-surface-variant bg-surface p-1 shadow-card">
    <div className="grid grid-cols-7" aria-hidden="true">
      {weekdayLabels(startsOn).map(label => <span key={label} className="py-2 text-center text-[10px] font-semibold text-ink-muted">{label}</span>)}
    </div>
    <div className="grid grid-cols-7" aria-label={`${period.label} calendar`}>
      {cells.map(cell => {
        const contents = <>
          <span className={cn("tabular flex size-6 items-center justify-center rounded-full text-xs font-semibold", cell.today && "bg-brand text-on-action")}>{cell.day}</span>
          {!isZero(cell.flow.income) ? <MoneyAmount amount={cell.flow.income} className="block truncate text-[9px] text-inflow" /> : null}
          {!isZero(cell.flow.expense) ? <MoneyAmount amount={cell.flow.expense} className="block truncate text-[9px] text-outflow" /> : null}
          {!isZero(cell.flow.income) && !isZero(cell.flow.expense) ? <MoneyAmount amount={cell.flow.net} className="block truncate text-[9px] text-ink-muted" /> : null}
        </>;
        const label = `${cell.date}, ${cell.count} entries. Income ${formatMoney(cell.flow.income)}, expense ${formatMoney(cell.flow.expense)}, total ${formatMoney(cell.flow.net)}`;
        const classes = cn("min-h-23 min-w-0 rounded-lg border border-transparent px-0.5 py-1", params.day === cell.date && "border-brand bg-brand-soft", !cell.inMonth && "text-ink-faint opacity-50");
        return cell.inMonth ? <Link key={cell.date} href={activityHref(params, { view: "calendar", day: cell.date })} aria-label={label} aria-current={params.day === cell.date ? "date" : undefined} title={label} className={classes}>{contents}</Link> : <div key={cell.date} className={classes}>{contents}</div>;
      })}
    </div>
  </div>;
}
