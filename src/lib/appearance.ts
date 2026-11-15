import { cookies } from "next/headers";

export const APPEARANCE_COOKIE = "luy.appearance";

/** A year, matching the display-currency preference cookie. */
export const APPEARANCE_MAX_AGE = 60 * 60 * 24 * 365;

export const APPEARANCES = ["light", "dark", "system"] as const;

export type Appearance = (typeof APPEARANCES)[number];

export const DEFAULT_APPEARANCE: Appearance = "system";

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === "string" && APPEARANCES.includes(value as Appearance);
}

/** Validate a cookie value into an appearance preference, falling back to system. */
export function parseAppearance(value: string | undefined | null): Appearance {
  return value && isAppearance(value) ? value : DEFAULT_APPEARANCE;
}

/** `data-theme` attribute for <html>: omitted when following system preference. */
export function appearanceThemeAttribute(appearance: Appearance): "light" | "dark" | undefined {
  return appearance === "system" ? undefined : appearance;
}

/** The appearance preference for this request. */
export async function readAppearance(): Promise<Appearance> {
  const store = await cookies();
  return parseAppearance(store.get(APPEARANCE_COOKIE)?.value);
}
