import type { AccountBalance, Category } from "./types";
import { categoryDefinition } from "./categories";
import { CURRENCIES } from "@/lib/money";

export { categoryGroup } from "./categories";

export function quickAccounts(accounts: readonly AccountBalance[], selectedId: string): AccountBalance[] {
  return [...accounts].sort((a, b) =>
    Number(b.accountId === selectedId) - Number(a.accountId === selectedId) ||
    (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") ||
    b.transactionCount - a.transactionCount || a.sortOrder - b.sortOrder,
  ).slice(0, 4);
}

export function quickEntryAccounts(accounts: readonly AccountBalance[], selectedId: string): AccountBalance[] {
  return CURRENCIES.flatMap(currency => {
    const candidates = accounts.filter(account => account.isActive && account.currency === currency);
    const aba = candidates.filter(account => /\baba\b/i.test(`${account.institution ?? ""} ${account.name}`));
    const checking = aba.filter(account => /checking/i.test(account.name));
    const account = quickAccounts(checking.length ? checking : aba.length ? aba : candidates, selectedId)[0];
    return account ? [account] : [];
  });
}

export function quickCategories(categories: readonly Category[], selectedId: string | null): Category[] {
  const priority = (category: Category) => {
    if (category.id === selectedId) return -1;
    return categoryDefinition(category)?.[4] ?? 1000 + category.sortOrder;
  };
  return [...categories].sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name)).slice(0, 6);
}
