import type { AccountBalance, Category } from "./types";
import { categoryDefinition } from "./categories";

export { categoryGroup } from "./categories";

export function quickAccounts(accounts: readonly AccountBalance[], selectedId: string): AccountBalance[] {
  return [...accounts].sort((a, b) =>
    Number(b.accountId === selectedId) - Number(a.accountId === selectedId) ||
    (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") ||
    b.transactionCount - a.transactionCount || a.sortOrder - b.sortOrder,
  ).slice(0, 4);
}

export function quickCategories(categories: readonly Category[], selectedId: string | null): Category[] {
  const priority = (category: Category) => {
    if (category.id === selectedId) return -1;
    return categoryDefinition(category)?.[4] ?? 1000 + category.sortOrder;
  };
  return [...categories].sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name)).slice(0, 6);
}
