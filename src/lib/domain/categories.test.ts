import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_CATALOG, categoryGroup, categoryIconKey, categoryLabel, groupedCategories, resolveCategory } from "./categories";
import { DEMO_CATEGORIES } from "@/lib/demo-data";
import type { Category, Merchant } from "./types";

const category = (name: string, extra: Partial<Category> = {}): Category => ({
  id: name, userId: "owner", name, icon: null, parentId: null, color: null,
  appliesTo: ["expense"], isSystem: false, sortOrder: 0, ...extra,
});
const merchant = (name: string, defaultCategoryId: string | null): Merchant => ({
  id: name, userId: "owner", name, normalizedName: name.toLowerCase(), defaultCategoryId, logoUrl: null,
});

describe("category catalog", () => {
  it("keeps the flat database and demo catalogs aligned with distinct local icons", () => {
    const migration = readFileSync("supabase/migrations/0015_flat_categories.sql", "utf8");
    const seeded = [...migration.matchAll(/\('([^']+)', '[^']+', '(?:expense|income|adjustment)'::public.transaction_type/g)].map(match => match[1]);
    expect(CATEGORY_CATALOG.map(([name]) => name)).toEqual(seeded);
    expect(DEMO_CATEGORIES).toHaveLength(CATEGORY_CATALOG.length);
    expect(new Set(DEMO_CATEGORIES.map(entry => entry.id)).size).toBe(CATEGORY_CATALOG.length);
    expect(new Set(DEMO_CATEGORIES.map(categoryIconKey)).size).toBe(CATEGORY_CATALOG.length);
    for (const entry of DEMO_CATEGORIES) {
      expect(existsSync(`public/icons/lets-icons/${categoryIconKey(entry)}.svg`)).toBe(true);
      expect(entry.parentId).toBeNull();
    }
  });

  it("removes emoji decoration for display without changing stored names", () => {
    const entry = category("\u2615\uFE0F Coffee \u{1F1F0}\u{1F1ED}", { icon: "\u2615" });
    expect(categoryLabel(entry)).toBe("Coffee");
    expect(categoryIconKey(entry)).toBe("drink");
    expect(entry.name).toContain("\u2615");
    expect(categoryLabel(category("\u{1F44D}\u{1F3FB}"))).toBe("Custom category");
    expect(categoryLabel(category("\u{0031}\uFE0F\u20E3 Water"))).toBe("Water");
  });

  it("gives custom names the catalog does not list a bundled icon instead of the generic grid", () => {
    for (const name of ["Game", "Internet", "Selfcare", "Social Life", "Subscription", "Trading"]) {
      const key = categoryIconKey(category(name));
      expect(key).not.toBe("widget");
      expect(existsSync(`public/icons/lets-icons/${key}.svg`)).toBe(true);
    }
    expect(categoryIconKey(category("Game", { icon: "\u{1F3AE}" }))).toBe("gamepad");
    expect(categoryIconKey(category("Something unlisted"))).toBe("widget");
  });

  it("has only flat expense, income and adjustment lists, including custom names", () => {
    const custom = category("My apartment", { parentId: "old-parent" });
    expect(categoryGroup(custom)).toBe("Expense");
    expect(categoryLabel(custom)).toBe("My apartment");
    expect(categoryGroup(category("Gift", { appliesTo: ["income"] }))).toBe("Income");
    expect(categoryGroup(category("Balance Adjustment", { appliesTo: ["adjustment"] }))).toBe("Adjustments");
    expect(groupedCategories([custom]).flatMap(group => group.categories)).toEqual([custom]);
  });
});

describe("conservative category matching", () => {
  const coffee = category("Drinks");
  const food = category("Food");
  const rent = category("Housing");
  const categories = [food, coffee, rent];

  it("matches complete names and aliases, never short substrings or ambiguous phrases", () => {
    expect(resolveCategory(categories, "brown coffee")?.id).toBe(coffee.id);
    expect(resolveCategory(categories, "coffee food")).toBeNull();
    expect(resolveCategory(categories, "cof")).toBeNull();
    expect(resolveCategory(categories, "parent")).toBeNull();
    expect(resolveCategory(categories, "coffee rent")).toBeNull();
    expect(resolveCategory([coffee, { ...coffee, id: "duplicate" }], "coffee")).toBeNull();
    expect(resolveCategory(categories, "unknown")).toBeNull();
  });

  it("respects merchant defaults and refuses conflicting or unavailable rules", () => {
    expect(resolveCategory(categories, "Starbucks", [merchant("Starbucks", coffee.id)])?.id).toBe(coffee.id);
    expect(resolveCategory(categories, "Housing", [merchant("Housing", coffee.id)])?.id).toBe(rent.id);
    expect(resolveCategory(categories, "Shop", [merchant("Shop", coffee.id), merchant("Shop", rent.id)])).toBeNull();
    expect(resolveCategory(categories, "Cafe", [merchant("Cafe", "unavailable")])).toBeNull();
  });

  it("uses the most specific phrase and only the supplied eligible categories", () => {
    const phone = category("Phone & Internet");
    expect(resolveCategory([...categories, phone], "coffee phone bill")?.id).toBe(phone.id);
    expect(resolveCategory([category("Salary", { appliesTo: ["income"] })], "rent")).toBeNull();
    expect(resolveCategory([category("My tea")], "My tea")?.id).toBe("My tea");
  });
});

 it.each([
  ["coffee", "Drinks"], ["Brown", "Drinks"], ["Koi", "Drinks"], ["Matcha", "Drinks"], ["HeroTea", "Drinks"], ["Coconut", "Drinks"],
  ["Bingsu", "Food"], ["Kuyteav", "Food"], ["Malatang", "Food"], ["Indy's", "Food"], ["Indy’s Steak", "Food"],
  ["Fuel", "Transportation"], ["Grab", "Transportation"], ["Parking", "Transportation"], ["Kampot", "Trip"],
  ["Case and Belt", "Shopping"], ["Donation", "Charity"], ["Spotify", "Subscription"], ["Movies", "Social Life"],
  ["Cellcard", "Phone & Internet"], ["Football Betting", "Betting"], ["Football", "Fitness"], ["eFootball Tournament", "Game"],
  ["Water", "Drinks"], ["Water bill", "Utilities"], ["Grab delivery", "Food"], ["pet food", "Pets"],
 ])("classifies %s as %s", (note, name) => {
  expect(resolveCategory(DEMO_CATEGORIES.filter(category => category.appliesTo.includes("expense")), note)?.name).toBe(name);
 });
