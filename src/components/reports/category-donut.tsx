"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS } from "@/lib/theme";
import { MoneyAmount } from "@/components/money-amount";
import { formatMoney, type Money } from "@/lib/money";

export interface CategorySlice { name: string; share: number; color: string; total: Money; transactionCount: number }

export function CategoryDonut({ slices, total, label }: { slices: readonly CategorySlice[]; total: Money; label: string }) {
  return <div className="relative h-72 w-full" role="img" aria-label={`${label}: ${formatMoney(total)}. ${slices.map(slice => `${slice.name}: ${formatMoney(slice.total)}, ${(slice.share * 100).toFixed(1)}%, ${slice.transactionCount} transactions`).join(". ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart accessibilityLayer>
        <Pie data={[...slices]} dataKey="share" nameKey="name" innerRadius="59%" outerRadius="94%" cornerRadius={12} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}
          labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
            if (percent === undefined || percent < 6 / 100) return null;
            const radius = (Number(innerRadius) + Number(outerRadius)) / 2;
            const angle = -Number(midAngle) * Math.PI / 180;
            const x = Number(cx) + radius * Math.cos(angle);
            const y = Number(cy) + radius * Math.sin(angle);
            return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="var(--color-on-action)" className="tabular text-xs font-bold">{(percent * 100).toFixed(0)}%</text>;
          }}>
          {slices.map(slice => <Cell key={slice.name} fill={slice.color} />)}
        </Pie>
        <Tooltip formatter={(_value, _name, item) => `${formatMoney(item.payload.total)} (${(item.payload.share * 100).toFixed(1)}%) · ${item.payload.transactionCount} transactions`} contentStyle={{ backgroundColor: CHART_COLORS.surface, color: "var(--color-ink)", border: `1px solid ${CHART_COLORS.border}`, borderRadius: "1rem", fontSize: "0.75rem" }} />
      </PieChart>
    </ResponsiveContainer>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
      <span className="text-xs text-ink-muted">{label}</span>
      <MoneyAmount amount={total} className="max-w-[50%] break-all text-center text-numeric-md font-bold text-ink" />
    </div>
  </div>;
}
