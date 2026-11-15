import type { ReactNode } from "react";

import { APP_ICON_KEYS, AppIcon } from "@/components/app-icon";
import { categoryIconKey } from "@/lib/domain/categories";
import type { Category } from "@/lib/domain/types";
import { CHART_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";

const CATEGORY_CHART_COLORS = CHART_COLORS.categories.slice(0, 6);
const OTHER_CHART_COLOR = CHART_COLORS.categories[6];

/** Map each category to its CSS chart colour token, reserving chart-other for uncategorised/Other. */
export function categoryColorToken(category?: Category | null): string {
  if (!category || category.name === "Other") return OTHER_CHART_COLOR;
  return CATEGORY_CHART_COLORS[Math.abs(category.sortOrder) % CATEGORY_CHART_COLORS.length];
}

export function CategoryIcon({ category, icon, size = 18 }: { category?: Category | null; icon?: string | null; size?: number }) {
  const key = category ? categoryIconKey(category) : icon ?? "widget";
  const name = APP_ICON_KEYS.find((name) => name === key) ?? "widget";
  return <AppIcon name={name} size={size} className="shrink-0" />;
}

export function RowIconTile({
  color,
  children,
  className,
}: {
  color: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("row-icon-tile", className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, var(--color-surface))`,
        color,
      }}
    >
      {children}
    </span>
  );
}
