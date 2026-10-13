import { APP_COLORS } from "./theme";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "luy.theme";

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? value as Theme : "system";
}

export function themeColors(theme: Theme) {
  return theme === "system" ? [
    { media: "(prefers-color-scheme: light)", color: APP_COLORS.background },
    { media: "(prefers-color-scheme: dark)", color: APP_COLORS.darkBackground },
  ] : [{ color: theme === "dark" ? APP_COLORS.darkBackground : APP_COLORS.background }];
}
