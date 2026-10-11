import type { AccountBalance, Category } from "./types";

export const CATEGORY_GROUPS = [
  { name: "Food & groceries", words: /food|drink|coffee|cafe|restaurant|delivery|grocer|dining|snack/ },
  { name: "Transport", words: /transport|fuel|taxi|tuk|grab|parking|vehicle|bus|car\b/ },
  { name: "Home & bills", words: /hous|home|rent|utilit|electric|water|phone|internet|repair|maintenance/ },
  { name: "Shopping", words: /shop|cloth|electronic|furniture|purchase/ },
  { name: "Health & care", words: /health|medical|dental|pharma|fitness|personal care|beauty|hair|gym/ },
  { name: "Fun & subscriptions", words: /entertain|subscription|game|movie|hobby|sport/ },
  { name: "Travel", words: /travel|flight|hotel|holiday|vacation/ },
  { name: "Family & giving", words: /family|kid|child|pet|gift|donat|charit/ },
  { name: "Education", words: /educat|school|tuition|course|book/ },
  { name: "Money & business", words: /fee|charge|insurance|tax|debt|loan|saving|business|invest/ },
  { name: "Income", words: /salary|freelanc|income|refund|interest|sales|bonus/ },
] as const;

export function categoryGroup(category: Category, categories: readonly Category[]): string {
  let parent = category;
  const visited = new Set([category.id]);
  while (parent.parentId) {
    const next = categories.find((item) => item.id === parent.parentId);
    if (!next || visited.has(next.id)) break;
    visited.add(next.id);
    parent = next;
  }
  const name = `${parent.name} ${category.name}`.toLowerCase();
  // A gift received is income; a gift bought belongs with family spending.
  if (!category.appliesTo.includes("expense")) return "Income";
  return CATEGORY_GROUPS.find((group) => group.words.test(name))?.name ?? "Other & custom";
}

export function quickAccounts(accounts: readonly AccountBalance[], selectedId: string): AccountBalance[] {
  return [...accounts].sort((a, b) =>
    Number(b.accountId === selectedId) - Number(a.accountId === selectedId) ||
    (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") ||
    b.transactionCount - a.transactionCount || a.sortOrder - b.sortOrder,
  ).slice(0, 4);
}

export function quickCategories(categories: readonly Category[], selectedId: string | null): Category[] {
  const common = ["coffee", "groceries", "food & drink", "transport", "shopping", "salary", "freelance", "other"];
  const priority = (category: Category) => {
    if (category.id === selectedId) return -1;
    const index = common.indexOf(category.name.toLowerCase());
    return index < 0 ? common.length + category.sortOrder : index;
  };
  return [...categories].sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name)).slice(0, 6);
}
