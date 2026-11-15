"use client";

import { CalendarDays } from "@/components/app-icon";
import { useId } from "react";

import { shiftCalendarDate } from "@/lib/calendar";
import { cn } from "@/lib/utils";

export function TransactionDateField({ value, today, onChange }: {
  value: string; today: string; onChange: (date: string) => void;
}) {
  const id = useId();
  const yesterday = shiftCalendarDate(today, -1);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-ink-muted flex items-center gap-2 text-sm font-medium">
        <CalendarDays size={16} aria-hidden="true" /> Date
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2">
          {[[today, "Today"], [yesterday, "Yesterday"]].map(([date, label]) => (
            <button key={label} type="button" aria-pressed={value === date} onClick={() => onChange(date)}
              className={cn("rounded-pill min-h-11 px-4 text-sm font-medium transition-colors", value === date ? "bg-brand text-on-action" : "bg-fill text-ink")}>
              {label}
            </button>
          ))}
        </div>
        <input id={id} type="date" required value={value} onChange={(event) => onChange(event.target.value)}
          className="field-input min-w-0 flex-1 text-sm" />
      </div>
    </div>
  );
}
