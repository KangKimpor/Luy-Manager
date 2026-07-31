"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "./env";

/**
 * Browser Supabase client.
 *
 * Uses the anon key, which is safe to ship because Row Level Security in
 * migration 0001 is the actual access boundary. The anon key alone grants nothing
 * without a session; every policy is keyed on auth.uid().
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
