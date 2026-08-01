"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { type CurrencyCode, formatMoney, money } from "@/lib/money";

/**
 * Net worth over the last twelve months.
 *
 * The chart is handed integer minor units and formats them through the money layer
 * at the axis and tooltip. Recharts works in plain numbers, so the alternative
 * would be passing it major-unit floats, which for riel would mean dividing by one
 * and for dollars by a hundred, and then trusting a chart library with rounding.
 * Keeping minor units all the way through means the only conversion is the one
 * `formatMoney` does for display.
 */
export function NetWorthTrend({
  points,
  currency,
}: {
  points: ReadonlyArray<{ label: string; minor: number }>;
  currency: CurrencyCode;
}) {
  if (points.length === 0) {
    return <p className="text-ink-faint py-6 text-center text-sm">Not enough history yet.</p>;
  }

  const data = points.map((point) => ({
    // Just the month, so twelve labels fit on a phone.
    name: point.label.split(" ")[0].slice(0, 3),
    value: point.minor,
    full: point.label,
  }));

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "var(--color-ink-faint)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            hide
            // Not forced to zero: net worth rarely starts there, and anchoring the
            // axis at zero would flatten a year of real movement into a straight line.
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "0.75rem",
              border: "1px solid var(--color-border-subtle)",
              fontSize: "0.75rem",
            }}
            formatter={(value) => [formatMoney(money(Number(value), currency)), "Net worth"]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-brand)"
            strokeWidth={2}
            fill="url(#netWorthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
