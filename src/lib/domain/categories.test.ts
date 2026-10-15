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
  it("covers every seeded category and supplies local icons and valid demo parents", () => {
    const original = readFileSync("supabase/migrations/0002_seed_defaults.sql", "utf8");
    const extended = readFileSync("supabase/migrations/0012_extended_categories.sql", "utf8");
    const seeded = [...original.matchAll(/\(target_user_id(?:, (?:food_id|transport_id))?, '([^']+)'/g),
      ...extended.matchAll(/\('([^']+)', '[^']+', '(?:expense|income)'/g)].map((match) => match[1]);
    expect(CATEGORY_CATALOG.map(([name]) => name).sort()).toEqual(seeded.sort());
    expect(DEMO_CATEGORIES).toHaveLength(49);
    for (const entry of DEMO_CATEGORIES) {
      expect(existsSync(`public/icons/lets-icons/${categoryIconKey(entry)}.svg`)).toBe(true);
      if (entry.parentId) expect(DEMO_CATEGORIES.some((parent) => parent.id === entry.parentId)).toBe(true);
    }
    expect(new Set(DEMO_CATEGORIES.map((entry) => entry.id)).size).toBe(49);
    expect(DEMO_CATEGORIES.find((entry) => entry.name === "Tuk Tuk / Grab")?.id).toBe("cat-grab");
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

  it("uses parent groups safely, preserves custom names, and separates income", () => {
    const home = category("Housing");
    const custom = category("My apartment", { parentId: home.id });
    expect(categoryGroup(custom, [home, custom])).toBe("Home & bills");
    expect(categoryLabel(custom)).toBe("My apartment");
    expect(categoryGroup(category("Gift", { appliesTo: ["income"] }), [])).toBe("Income");
    expect(categoryGroup(category("Coffee", { parentId: "missing" }), [])).toBe("Food & groceries");
    const loop = category("Custom", { parentId: "Custom" });
    expect(categoryGroup(loop, [loop])).toBe("Other & custom");
    expect(groupedCategories([custom, home]).flatMap((group) => group.categories)).toContain(custom);
  });
});

describe("conservative category matching", () => {
  const coffee = category("Coffee", { parentId: "Food & Drink" });
  const food = category("Food & Drink");
  const rent = category("Rent");
  const categories = [food, coffee, rent];

  it("matches complete names and aliases, never short substrings or ambiguous phrases", () => {
    expect(resolveCategory(categories, "brown coffee")?.id).toBe(coffee.id);
    expect(resolveCategory(categories, "coffee food")?.id).toBe(coffee.id);
    expect(resolveCategory(categories, "cof")).toBeNull();
    expect(resolveCategory(categories, "parent")).toBeNull();
    expect(resolveCategory(categories, "coffee rent")).toBeNull();
    expect(resolveCategory([coffee, { ...coffee, id: "duplicate" }], "coffee")).toBeNull();
    expect(resolveCategory(categories, "unknown")).toBeNull();
  });

  it("respects merchant defaults and refuses conflicting or unavailable rules", () => {
    expect(resolveCategory(categories, "Starbucks", [merchant("Starbucks", coffee.id)])?.id).toBe(coffee.id);
    expect(resolveCategory(categories, "Rent", [merchant("Rent", coffee.id)])?.id).toBe(rent.id);
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
