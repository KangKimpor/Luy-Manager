/**
 * Reference data: categories, profile and settings.
 *
 * Grouped together because they share a lifecycle (seeded on signup, changed
 * rarely, read on almost every page), and because that makes them the natural
 * candidates for React's per-render `cache`.
 */

import { cache } from "react";

import { getUser } from "@/lib/auth";
import type { Category, Merchant, Profile, Settings } from "@/lib/domain/types";
import type { CurrencyCode } from "@/lib/money";
import { CATEGORY_LOOKUP, DEMO_CATEGORIES } from "@/lib/demo-data";

import {
  asRow,
  asRows,
  CATEGORY_COLUMNS,
  DataError,
  dataContext,
  SETTINGS_COLUMNS,
} from "./client";
import { mapRows, toCategory, toMerchant, toProfile, toSettings } from "./mappers";

export async function merchantLookup(ids: readonly string[]): Promise<Record<string, Merchant>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const context = await dataContext();
  if (!context) return {};
  // Bound each URL and response below PostgREST's row cap.
  const chunks = Array.from({ length: Math.ceil(unique.length / 100) }, (_, index) => unique.slice(index * 100, (index + 1) * 100));
  const groups = await Promise.all(chunks.map(async chunk => {
    const { data, error } = await context.supabase.from("merchants")
      .select("id, user_id, name, normalized_name, default_category_id, logo_url")
      .eq("user_id", context.userId).in("id", chunk);
    if (error) throw new DataError("load transaction merchants", error);
    return mapRows(asRows(data), toMerchant, "merchants");
  }));
  return Object.fromEntries(groups.flat().map(merchant => [merchant.id, merchant]));
}

export const listCategories = cache(async (): Promise<Category[]> => {
  const context = await dataContext();
  if (!context) return DEMO_CATEGORIES;

  const { data, error } = await context.supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new DataError("load your categories", error);
  return mapRows(asRows(data), toCategory, "categories");
});

export const categoryLookup = cache(async (): Promise<Record<string, Category>> => {
  const context = await dataContext();
  if (!context) return CATEGORY_LOOKUP;

  const categories = await listCategories();
  return Object.fromEntries(categories.map((category) => [category.id, category]));
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const context = await dataContext();
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("profiles")
    .select("id, display_name, base_currency, locale, timezone, telegram_chat_id")
    .eq("id", context.userId)
    .maybeSingle();

  if (error) throw new DataError("load your profile", error);
  const row = asRow(data);
  return row ? toProfile(row) : null;
});

export const getSettings = cache(async (): Promise<Settings | null> => {
  const context = await dataContext();
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("settings")
    .select(SETTINGS_COLUMNS)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) throw new DataError("load your settings", error);
  const row = asRow(data);
  return row ? toSettings(row) : null;
});

/**
 * The currency the user's own reports default to.
 *
 * `profiles.base_currency` is the stored preference; the cookie in
 * `@/lib/display-currency` is the per-visit override on top of it. This is the
 * value the cookie falls back to once someone is signed in.
 */
export async function getBaseCurrency(): Promise<CurrencyCode | null> {
  const user = await getUser();
  if (!user) return null;

  return (await getProfile())?.baseCurrency ?? null;
}
