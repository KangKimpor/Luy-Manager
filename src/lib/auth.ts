/**
 * Who is asking.
 *
 * Every read and write in the data layer goes through here rather than reading a
 * session inline, which is what makes "did we check authorization" answerable by
 * looking at one file. Next's own guidance calls this a data access layer and
 * recommends putting the check in it rather than in a layout, because a layout
 * does not re-run on every navigation and cannot be relied on to gate anything.
 *
 * Row Level Security is still the real boundary. These helpers exist so the app
 * fails with a redirect or a clear error instead of silently querying as nobody
 * and rendering an empty page.
 */

import { cache } from "react";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Whether the app is running without a Supabase project.
 *
 * In that state every page falls back to demo data. Kept as a named concept so
 * the fallback is a deliberate, visible mode rather than an accident that looks
 * like real but empty data.
 */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

/**
 * The signed-in user, or null.
 *
 * Wrapped in React's `cache` so the several server components that need the user
 * during one render share a single validation round trip instead of each making
 * their own.
 *
 * Uses `getUser()`, not `getSession()`: the latter decodes the cookie and trusts
 * it, which is fine for optimistic UI and not fine for deciding what data to
 * return.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  if (isDemoMode()) return null;

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    email: user.email ?? null,
    displayName:
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null,
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
  };
});

/**
 * The signed-in user, or a redirect to sign-in.
 *
 * For pages and actions that cannot do anything useful without one. `redirect`
 * throws, so control does not return and the caller gets a non-null user.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The signed-in user's id for a mutation, or an error.
 *
 * Server actions are reachable by direct POST, not only through the UI, so each
 * one has to establish who is calling. This throws rather than redirecting
 * because an action responding with a redirect to a fetch is confusing to debug.
 */
export async function requireUserId(): Promise<string> {
  const user = await getUser();
  if (!user) {
    throw new Error("You need to be signed in to do that.");
  }
  return user.id;
}
