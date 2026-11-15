"use server";

import { cookies } from "next/headers";

import {
  APPEARANCE_COOKIE,
  APPEARANCE_MAX_AGE,
  parseAppearance,
} from "@/lib/appearance";

/**
 * Switch the colour appearance preference (light, dark, or system).
 *
 * Stored in a cookie so the server renders `<html data-theme="...">` directly on
 * first paint without a flash of the wrong theme.
 */
export async function setAppearance(value: string): Promise<void> {
  const appearance = parseAppearance(value);
  const store = await cookies();

  store.set(APPEARANCE_COOKIE, appearance, {
    path: "/",
    maxAge: APPEARANCE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
}
