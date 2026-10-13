"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS } from "@/lib/theme";

export interface CategorySlice { name: string; share: number; color: string }

export function CategoryDonut({ slices }: { slices: readonly CategorySlice[] }) {
  return <div className="h-52 w-full" role="img" aria-label="Category shares. Exact amounts are in the ranked list below.">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart accessibilityLayer>
        <Pie data={[...slices]} dataKey="share" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke={CHART_COLORS.surface} isAnimationActive={false}>
          {slices.map(slice => <Cell key={slice.name} fill={slice.color} />)}
        </Pie>
        <Tooltip formatter={value => `${Math.round(Number(value) * 100)}%`} contentStyle={{ backgroundColor: CHART_COLORS.surface, color: "var(--color-ink)", border: `1px solid ${CHART_COLORS.border}`, borderRadius: "1rem", fontSize: "0.75rem" }} />
      </PieChart>
    </ResponsiveContainer>
  </div>;
}
