import type { Category, Merchant } from "./types";

export const CATEGORY_GROUPS = ["Expense", "Income", "Adjustments"] as const;

// One flat catalog. Keywords are complete phrases shared by web entry and Telegram.
export const CATEGORY_CATALOG: readonly (readonly [name: string, icon: string, group: string, keywords: string, quickPriority?: number])[] = [
  ["Food", "pizza", "Expense", "food;meal;breakfast;lunch;dinner;restaurant;dining;bingsu;kuyteav;malatang;indy;indy s;indys;noodle;boat noodle;duck noodle;udon;banh canh;steak;burger;stable burger;burrito;pizza;spaghetti;bread;fried bread;breadtalk;marugame;trattoria;dumpling;mochi;ice cream;dq;snow yogurt;beef;ginger rice;chicken run;kaixin;foodpanda;nham24;wownow;grab delivery", 0],
  ["Drinks", "drink", "Expense", "drink;drinks;coffee;cafe;latte;espresso;brown;brown coffee;koi;matcha;herotea;hero tea;coconut;tea;water;pepsi;soda;starbucks;amazon cafe;boost;baytea3", 1],
  ["Groceries", "basket", "Expense", "groceries;grocery;supermarket;lucky supermarket;aeon;chip mong", 4],
  ["Transportation", "road", "Expense", "transport;transportation;fuel;petrol;gasoline;grab;parking;tuk tuk;taxi;passapp;bus;caltex;ptt;total;oil change;motowash;bike repair", 2],
  ["Housing", "home", "Expense", "housing;rent;mortgage"],
  ["Utilities", "lamp", "Expense", "utilities;electricity;electric bill;edc;water bill"],
  ["Phone & Internet", "wifi", "Expense", "internet;wifi;phone bill;mobile top up;cellcard;smart top up;metfone"],
  ["Shopping", "bag", "Expense", "shopping;case;belt;clothing;clothes;shirt;shoes;electronics;computer;laptop;phone case", 3],
  ["Health", "stethoscope", "Expense", "health;medical;doctor;hospital;pharmacy;medicine;medication;dental;dentist;antadys"],
  ["Personal Care", "pipette", "Expense", "personal care;selfcare;haircut;salon;beauty;skincare"],
  ["Fitness", "trophy", "Expense", "fitness;gym;football;futsal;sport"],
  ["Social Life", "chat-smile", "Expense", "social life;entertainment;cinema;movie;movies;bowling;karaoke;selfie booth;playground;obsession ticket;supergirl ticket"],
  ["Game", "gamepad", "Expense", "game;games;gaming;efootball;pes;card game;efootball tournament;efootball top up;efootball account;efootball league"],
  ["Subscription", "refresh", "Expense", "subscription;subscriptions;netflix;spotify;youtube premium;icloud;chatgpt"],
  ["Trip", "suitcase", "Expense", "trip;travel;holiday;vacation;kampot;kep;siem reap;flight;flights;airfare;hotel;hotels;accommodation;kampot trip accommodation"],
  ["Family & Kids", "group", "Expense", "family;kids;childcare"],
  ["Pets", "pets", "Expense", "pets;pet;vet;pet food"],
  ["Gifts", "gift", "Expense", "gift;gifts;present;flower;flowers"],
  ["Charity", "charity", "Expense", "charity;donation;donations;wat"],
  ["Education", "mortarboard", "Expense", "education;school;tuition;course;english book"],
  ["Fees & Charges", "paper", "Expense", "fee;fees;bank fee;charges"],
  ["Insurance", "chield-check", "Expense", "insurance"],
  ["Taxes", "notebook", "Expense", "tax;taxes"],
  ["Debt Payments", "credit-card", "Expense", "debt;loan payment;credit card payment"],
  ["Repairs & Maintenance", "setting-alt-line", "Expense", "repair;repairs;maintenance"],
  ["Business", "tie", "Expense", "business"],
  ["Savings Contributions", "wallet-alt", "Expense", "savings contribution"],
  ["Trading", "candlestick", "Expense", "trading;investment purchase"],
  ["Betting", "betting", "Expense", "bet;betting;football betting"],
  ["Other", "widget", "Expense", "other", 5],
  ["Salary", "money", "Income", "salary;payroll;wages", 0],
  ["Freelance", "desktop", "Income", "freelance;freelancing", 1],
  ["Gift", "star", "Income", "gift;gifts"],
  ["Investment Income", "chart", "Income", "investment income;dividend;dividends"],
  ["Refund", "refund-back", "Income", "refund;reimbursement"],
  ["Bonus", "sparkle", "Income", "bonus"],
  ["Sales", "shop", "Income", "sales;sale"],
  ["Rental Income", "key", "Income", "rental income"],
  ["Interest", "line-up", "Income", "interest"],
  ["Allowance", "wallet", "Income", "allowance"],
  ["Petty Cash", "petty-cash", "Income", "petty cash"],
  ["Tournament Prize", "tournament-prize", "Income", "tournament prize;prize;winnings"],
  ["Other Income", "layers", "Income", "other income"],
  ["Balance Adjustment", "colum-up", "Adjustments", "balance adjustment;modified bal"],
] as const;

// Used only to consolidate previous names, never as extra choices in the picker.
export const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  "Food & Drink": "Food", "Food & Drinks": "Food", Restaurant: "Food", Delivery: "Food",
  Coffee: "Drinks", Transport: "Transportation", Fuel: "Transportation", "Tuk Tuk / Grab": "Transportation",
  Rent: "Housing", Electricity: "Utilities", Water: "Utilities", Clothing: "Shopping", Electronics: "Shopping",
  Medical: "Health", Dental: "Health", Entertainment: "Social Life", Subscriptions: "Subscription",
  Travel: "Trip", Flights: "Trip", Hotels: "Trip", "Gifts & Donations": "Gifts", Internet: "Phone & Internet",
  Selfcare: "Personal Care", "Modified Bal.": "Balance Adjustment",
};

export function categoryLabel(category?: Pick<Category, "name"> | null): string {
  if (!category) return "Uncategorised";
  return category.name.replace(/[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200D\uFE0F\uFE0E\u{1F3FB}-\u{1F3FF}]/gu, "").replace(/\s+/g, " ").trim() || "Custom category";
}

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function categoryDefinition(category: Pick<Category, "name">) {
  const label = categoryLabel(category);
  const alias = Object.entries(CATEGORY_ALIASES).find(([name]) => normalize(name) === normalize(label))?.[1] ?? label;
  return CATEGORY_CATALOG.find(([name]) => normalize(name) === normalize(alias));
}

export function categoryGroup(category: Category): string {
  if (category.appliesTo.includes("expense")) return "Expense";
  return category.appliesTo.some((type) => type === "income" || type === "refund") ? "Income" : "Adjustments";
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
  const groups = CATEGORY_GROUPS.map((name) => ({ name, categories: categories.filter((category) => categoryGroup(category) === name)
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
  const score = Math.max(...matches.map((match) => match.score));
  const best = matches.filter((match) => match.score === score);
  return best.length === 1 ? best[0].category : null;
}
