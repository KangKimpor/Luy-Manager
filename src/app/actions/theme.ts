"use server";

import { cookies } from "next/headers";
import { THEMES, THEME_COOKIE, type Theme } from "@/lib/theme-preference";

export async function setTheme(form: FormData): Promise<void> {
  const value = form.get("theme");
  if (!THEMES.includes(value as Theme)) throw new Error("Choose Light, Dark or System.");
  (await cookies()).set(THEME_COOKIE, value as Theme, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax",
    httpOnly: true, secure: process.env.NODE_ENV === "production",
  });
}
