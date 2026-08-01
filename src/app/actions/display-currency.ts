"use server";

import { cookies } from "next/headers";

import {
  DISPLAY_CURRENCY_COOKIE,
  DISPLAY_CURRENCY_MAX_AGE,
  parseDisplayCurrency,
} from "@/lib/display-currency";

/**
 * Switch the currency totals are reported in.
 *
 * Setting a cookie has to happen in a server function, because a server component
 * render cannot write response headers. The toggle in the UI calls this.
 *
 * No explicit revalidation follows. Next.js re-renders the current page and its
 * layouts after a server function sets a cookie, and the pages that read this
 * preference are request-time rendered because of that same read, so there is no
 * cached output to invalidate.
 */
export async function setDisplayCurrency(value: string): Promise<void> {
  // Validated rather than trusted. This is reachable by direct POST, not only
  // through the toggle, and an unchecked value would reach `money()` on the next
  // render and throw there instead of here.
  const currency = parseDisplayCurrency(value);

  const store = await cookies();
  store.set(DISPLAY_CURRENCY_COOKIE, currency, {
    path: "/",
    maxAge: DISPLAY_CURRENCY_MAX_AGE,
    sameSite: "lax",
    // Readable by client script: harmless, and it lets a future client-side
    // formatter pick the same unit without a round trip.
    httpOnly: false,
    // Plain HTTP in local development would drop a Secure cookie, which would
    // make the toggle silently do nothing.
    secure: process.env.NODE_ENV === "production",
  });
}
