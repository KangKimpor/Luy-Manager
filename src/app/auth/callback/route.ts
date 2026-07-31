import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Completes an OAuth or magic-link sign-in.
 *
 * Supabase sends the browser back here with a one-time `code`. Exchanging it for
 * a session is a write — it sets auth cookies — so it has to happen in a route
 * handler rather than during a page render, which cannot set headers.
 *
 * PRD Section 17 decision 4 settled on Supabase Auth, and Section 3 asks for
 * Google OAuth; both land on this one endpoint.
 */

/** Only ever redirect somewhere inside this app. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Supabase reports a refused or expired link as query parameters rather than a
  // failed exchange, so they have to be read before attempting one.
  const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");
  if (errorDescription) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", errorDescription);
    return NextResponse.redirect(url);
  }

  if (!isSupabaseConfigured() || !code) {
    const url = new URL("/login", origin);
    url.searchParams.set(
      "error",
      !code ? "That sign-in link is missing its code." : "Supabase is not configured.",
    );
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/login", origin);
    // A used or expired link is the common case here, and saying so is more
    // useful than a generic failure.
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, origin));
}
