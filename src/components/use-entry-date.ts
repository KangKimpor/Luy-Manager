"use client";

import { useRef, useState } from "react";
import { readEntryRate } from "@/app/actions/entry-options";
import { isCalendarDate } from "@/lib/calendar";
import type { ExchangeRate } from "@/lib/money";

export function useEntryDate(today: string, initialRate: ExchangeRate, readOnly: boolean) {
  const [date, setDate] = useState(today);
  const [rate, setRate] = useState(initialRate);
  const [ratePending, setRatePending] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const revision = useRef(0);
  const rates = useRef(new Map([[today, initialRate]]));

  async function selectDate(next: string) {
    const current = ++revision.current;
    setDate(next);
    setDateError(null);
    const cached = rates.current.get(next);
    if (!isCalendarDate(next) || cached || readOnly) {
      setRatePending(false);
      if (cached) setRate(cached);
      return;
    }
    setRatePending(true);
    try {
      const result = await readEntryRate(next);
      if (revision.current !== current) return;
      if (!result.ok) { setDateError(result.error); return; }
      rates.current.set(next, result.data);
      setRate(result.data);
    } catch { if (revision.current === current) setDateError("Could not load the rate for this date. Choose the date again to retry."); }
    finally { if (revision.current === current) setRatePending(false); }
  }
  return { date, selectDate, rate, ratePending, dateError };
}
