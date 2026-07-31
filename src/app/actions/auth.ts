"use server";

import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out.
 *
 * A server action rather than a client-side `signOut()` call because the session
 * lives in httpOnly cookies that only the server can clear. Doing it in the
 * browser would drop the client's copy and leave the cookie in place, so the next
 * request would arrive signed in again.
 */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    // 'local' rather than 'global': signing out on a phone should not end the
    // session on a laptop.
    await supabase.auth.signOut({ scope: "local" });
  }

  redirect("/login");
}
