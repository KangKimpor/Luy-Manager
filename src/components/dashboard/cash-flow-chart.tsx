"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyTotal } from "@/lib/domain/transactions";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { CHART_COLORS } from "@/lib/theme";

/**
 * Daily cash flow, PRD Section 11.
 *
 * The curved area shape follows the fitness_app reference template's chart
 * treatment. Values are passed to recharts as major-unit numbers because the
 * library needs plain numbers for scaling; every label routes back through
 * formatMoney so the displayed figures stay correct for the currency.
 */

interface CashFlowChartProps {
  series: readonly DailyTotal[];
  currency: CurrencyCode;
}

export function CashFlowChart({ series, currency }: CashFlowChartProps) {
  const data = series.map((day) => ({
    date: day.date,
    label: day.date.slice(8), // day of month
    income: day.income.minor,
    expense: day.expense.minor,
  }));

  const hasActivity = data.some((d) => d.income > 0 || d.expense > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow</CardTitle>
      </CardHeader>
      <CardBody>
        {hasActivity ? (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="inflowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.inflow} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLORS.inflow} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.outflow} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLORS.outflow} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: CHART_COLORS.inkFaint }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${CHART_COLORS.border}`,
                    fontSize: 12,
                  }}
                  // recharts types the value as possibly undefined or a string,
                  // so it is narrowed to a number before being treated as minor
                  // units.
                  formatter={(value, name) => {
                    const minor = typeof value === "number" ? Math.round(value) : 0;
                    return [
                      formatMoney(money(minor, currency)),
                      name === "income" ? "Income" : "Expense",
                    ];
                  }}
                  labelFormatter={(label) => `Day ${label}`}
                />

                <Area
                  type="monotone"
                  dataKey="income"
                  stroke={CHART_COLORS.inflow}
                  strokeWidth={2}
                  fill="url(#inflowFill)"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke={CHART_COLORS.outflow}
                  strokeWidth={2}
                  fill="url(#outflowFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-ink-faint py-8 text-center text-sm">
            No activity in this period yet.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
