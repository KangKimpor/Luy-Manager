import { APP_ICON_KEYS, AppIcon } from "@/components/app-icon";
import { categoryIconKey } from "@/lib/domain/categories";
import type { Category } from "@/lib/domain/types";

export function CategoryIcon({ category, icon, size = 18 }: { category?: Category | null; icon?: string | null; size?: number }) {
  const key = category ? categoryIconKey(category) : icon ?? "widget";
  const name = APP_ICON_KEYS.find((name) => name === key) ?? "widget";
  return <AppIcon name={name} size={size} className="shrink-0" />;
}
