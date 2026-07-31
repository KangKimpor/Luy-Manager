import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabaseEnv } from "./env";

/**
 * Server Supabase client for server components, route handlers and actions.
 *
 * The cookie writes are wrapped in try/catch because Next.js forbids setting
 * cookies from a server component render. Supabase attempts a write whenever it
 * refreshes a token; swallowing the failure there is correct, since middleware is
 * the place that persists the refreshed session.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component render, where cookies are read-only.
          // Middleware refreshes the session instead.
        }
      },
    },
  });
}
