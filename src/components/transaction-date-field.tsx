"use client";

import { CalendarDays } from "@/components/app-icon";
import { useEffect, useId, useRef, useState } from "react";

import { isCalendarDate, shiftCalendarDate } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDateChipLabel(value: string, today: string, yesterday: string): string {
  if (value === today) return "Today";
  if (value === yesterday) return "Yesterday";
  if (!isCalendarDate(value)) return "Date";
  const [y, m, d] = value.split("-").map(Number);
  return SHORT_DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d)));
}

export function TransactionDateField({ value, today, onChange, compact = false }: {
  value: string; today: string; onChange: (date: string) => void; compact?: boolean;
}) {
  const id = useId();
  const popoverId = useId();
  const yesterday = shiftCalendarDate(today, -1);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!compact || !open) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [compact, open]);

  if (compact) {
    const label = formatDateChipLabel(value, today, yesterday);
    return (
      <div ref={containerRef} className="relative shrink-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={popoverId}
          aria-label={`Date: ${label}`}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "rounded-control flex h-11 items-center gap-1.5 px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
            open || value !== today ? "bg-brand-soft text-brand" : "bg-fill text-ink",
          )}
        >
          <CalendarDays size={15} aria-hidden="true" />
          <span>{label}</span>
        </button>

        {open ? (
          <div
            id={popoverId}
            className="glass panel-enter rounded-card absolute top-full right-0 z-40 mt-2 w-64 space-y-2.5 p-3"
          >
            <div className="grid grid-cols-2 gap-2">
              {([[today, "Today"], [yesterday, "Yesterday"]] as const).map(([dateOption, optionLabel]) => (
                <button
                  key={optionLabel}
                  type="button"
                  aria-pressed={value === dateOption}
                  onClick={() => {
                    onChange(dateOption);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-pill min-h-11 px-3 text-xs font-medium transition-colors",
                    value === dateOption ? "bg-brand text-on-action" : "bg-fill text-ink",
                  )}
                >
                  {optionLabel}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor={id} className="text-ink-muted mb-1 block text-xs font-medium">
                Date
              </label>
              <input
                id={id}
                type="date"
                required
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="field-input text-sm"
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

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
