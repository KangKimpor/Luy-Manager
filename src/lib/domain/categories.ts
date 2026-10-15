import type { Category, Merchant } from "./types";

export const CATEGORY_GROUPS = [
  "Food & groceries", "Transport", "Home & bills", "Shopping", "Health & care",
  "Entertainment", "Travel", "Family & giving", "Education", "Money & business", "Income", "Other & custom",
] as const;

// Names remain compatible with existing rows; groups never change ledger identity.
export const CATEGORY_CATALOG: readonly (readonly [name: string, icon: string, group: string, keywords: string, quickPriority?: number])[] = [
  ["Food & Drink", "pizza", "Food & groceries", "food;meal;breakfast;lunch;dinner", 2],
  ["Coffee", "drink", "Food & groceries", "coffee;cafe;latte;espresso;brown", 0],
  ["Restaurant", "knife", "Food & groceries", "restaurant;dining"],
  ["Delivery", "package-car", "Food & groceries", "food delivery;foodpanda;nham24"],
  ["Groceries", "basket", "Food & groceries", "groceries;grocery;supermarket", 1],
  ["Transport", "road", "Transport", "transport;bus;parking", 3],
  ["Fuel", "oil", "Transport", "fuel;petrol;gasoline"],
  ["Tuk Tuk / Grab", "road", "Transport", "tuk tuk;grab;taxi;passapp"],
  ["Housing", "home", "Home & bills", "housing"],
  ["Rent", "key", "Home & bills", "rent"],
  ["Utilities", "lamp", "Home & bills", "utilities"],
  ["Electricity", "flash", "Home & bills", "electricity;electric bill;edc"],
  ["Water", "water", "Home & bills", "water bill"],
  ["Phone & Internet", "mobile", "Home & bills", "internet;wifi;phone bill;mobile top up"],
  ["Repairs & Maintenance", "setting-alt-line", "Home & bills", "repair;repairs;maintenance"],
  ["Shopping", "bag", "Shopping", "shopping", 4],
  ["Clothing", "tie", "Shopping", "clothing;clothes;shirt;shoes"],
  ["Electronics", "desktop", "Shopping", "electronics;computer;laptop"],
  ["Health", "favorite", "Health & care", "health"],
  ["Medical", "stethoscope", "Health & care", "medical;doctor;hospital;pharmacy;medicine"],
  ["Dental", "tooth", "Health & care", "dental;dentist"],
  ["Personal Care", "pipette", "Health & care", "personal care;haircut;salon;beauty"],
  ["Fitness", "trophy", "Health & care", "fitness;gym"],
  ["Entertainment", "gamepad", "Entertainment", "entertainment;cinema;movie;games"],
  ["Subscriptions", "refresh", "Entertainment", "subscription;subscriptions;netflix;spotify"],
  ["Travel", "suitcase", "Travel", "travel;holiday;vacation"],
  ["Flights", "send", "Travel", "flight;flights;airfare"],
  ["Hotels", "bed", "Travel", "hotel;hotels;accommodation"],
  ["Family & Kids", "group", "Family & giving", "family;kids;childcare"],
  ["Pets", "favorite", "Family & giving", "pets;pet;vet;pet food"],
  ["Gifts & Donations", "gift", "Family & giving", "gift;gifts;donation;donations;charity"],
  ["Education", "mortarboard", "Education", "education;school;tuition;course"],
  ["Fees & Charges", "paper", "Money & business", "fee;fees;charge;charges;bank fee"],
  ["Insurance", "chield-check", "Money & business", "insurance"],
  ["Taxes", "notebook", "Money & business", "tax;taxes"],
  ["Debt Payments", "credit-card", "Money & business", "debt;loan payment;credit card payment"],
  ["Business", "suitcase", "Money & business", "business"],
  ["Savings Contributions", "wallet-alt", "Money & business", "savings contribution"],
  ["Salary", "money", "Income", "salary;payroll;wages", 0],
  ["Freelance", "desktop", "Income", "freelance;freelancing", 1],
  ["Gift", "gift", "Income", "gift;gifts"],
  ["Investment Income", "chart", "Income", "investment income;dividend;dividends"],
  ["Refund", "refund-back", "Income", "refund;reimbursement"],
  ["Bonus", "star", "Income", "bonus"],
  ["Sales", "shop", "Income", "sales;sale"],
  ["Rental Income", "home", "Income", "rental income"],
  ["Interest", "line-up", "Income", "interest"],
  ["Other Income", "wallet", "Income", "other income"],
  ["Other", "widget", "Other & custom", "other", 5],
] as const;

export function categoryLabel(category?: Pick<Category, "name"> | null): string {
  if (!category) return "Uncategorised";
  return category.name.replace(/[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200D\uFE0F\uFE0E\u{1F3FB}-\u{1F3FF}]/gu, "").replace(/\s+/g, " ").trim() || "Custom category";
}

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function categoryDefinition(category: Pick<Category, "name">) {
  return CATEGORY_CATALOG.find(([name]) => normalize(name) === normalize(categoryLabel(category)));
}

export function categoryGroup(category: Category, categories: readonly Category[]): string {
  if (!category.appliesTo.includes("expense")) return "Income";
  let root = category;
  const visited = new Set([category.id]);
  while (root.parentId) {
    const next = categories.find((item) => item.id === root.parentId);
    if (!next || visited.has(next.id)) break;
    visited.add(next.id);
    root = next;
  }
  return categoryDefinition(root)?.[2] ?? categoryDefinition(category)?.[2] ?? "Other & custom";
}

const LEGACY_ICONS: Record<string, string> = {
  utensils: "knife", "utensils-crossed": "knife", coffee: "drink", bike: "package-car", car: "road",
  "car-taxi-front": "road", fuel: "oil", "shopping-cart": "basket", "shopping-bag": "bag",
  house: "home", zap: "flash", "heart-pulse": "stethoscope", tv: "video", "graduation-cap": "mortarboard",
  receipt: "paper", "circle-dashed": "widget", banknote: "money", laptop: "desktop", "trending-up": "line-up",
  "rotate-ccw": "refund-back", plane: "send", sparkles: "star", dumbbell: "trophy", repeat: "refresh",
  "shield-check": "chield-check", landmark: "notebook", users: "group", "paw-print": "favorite",
  "briefcase-business": "suitcase", wrench: "setting-alt-line", wifi: "mobile", "piggy-bank": "wallet-alt",
  droplets: "water", shirt: "tie", smartphone: "mobile", hotel: "bed", store: "shop",
};

// Custom or imported names the catalog does not list. Without an entry here they
// fall back to the generic grid icon and are indistinguishable in a picker.
const NAME_ICONS: Record<string, string> = {
  game: "gamepad", internet: "wifi", selfcare: "sparkle",
  "social life": "chat-smile", subscription: "refresh", trading: "candlestick",
};

export function categoryIconKey(category?: Category | null): string {
  if (!category) return "widget";
  return categoryDefinition(category)?.[1] ?? NAME_ICONS[normalize(categoryLabel(category))] ?? LEGACY_ICONS[category.icon ?? ""] ?? category.icon ?? "widget";
}

export function categoryKeywords(category: Category): string {
  return categoryDefinition(category)?.[3].replaceAll(";", " ") ?? "";
}

export function groupedCategories(categories: readonly Category[]) {
  const groups = CATEGORY_GROUPS.map((name) => ({ name, categories: categories.filter((category) => categoryGroup(category, categories) === name)
    .sort((a, b) => a.sortOrder - b.sortOrder || categoryLabel(a).localeCompare(categoryLabel(b))) }));
  return groups.filter((group) => group.categories.length > 0);
}

/** Only complete phrases and unique matches can assign a category automatically. */
export function resolveCategory(categories: readonly Category[], descriptor: string, merchants: readonly Merchant[] = []): Category | null {
  const needle = normalize(descriptor);
  if (!needle) return null;
  const exact = categories.filter((category) => normalize(categoryLabel(category)) === needle);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const contains = (phrase: string) => phrase !== "" && ` ${needle} `.includes(` ${phrase} `);
  const merchantMatches = merchants.filter((merchant) => contains(normalize(merchant.normalizedName || merchant.name)));
  if (merchantMatches.length) {
    const defaults = [...new Set(merchantMatches.map((merchant) => merchant.defaultCategoryId))];
    return defaults.length === 1 ? categories.find((category) => category.id === defaults[0]) ?? null : null;
  }
  const matches = categories.flatMap((category) => {
    const phrases = [categoryLabel(category), ...(categoryDefinition(category)?.[3].split(";") ?? [])].map(normalize).filter(contains);
    return phrases.length ? [{ category, score: Math.max(...phrases.map((phrase) => phrase.split(" ").length)) }] : [];
  });
  const specific = matches.filter(({ category }) => !matches.some((match) => match.category.parentId === category.id));
  const score = Math.max(...specific.map((match) => match.score));
  const best = specific.filter((match) => match.score === score);
  return best.length === 1 ? best[0].category : null;
}
