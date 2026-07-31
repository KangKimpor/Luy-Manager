import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseServiceEnv } from "./env";

/**
 * Service-role Supabase client, for work that has no user session.
 *
 * Row Level Security does not apply to this client. It exists for exactly one
 * reason in Phase 1: the published USD/KHR rate is stored with `user_id = null`
 * because it is a fact about the world rather than a user's data, and the
 * `exchange_rates_insert_own` policy (`auth.uid() = user_id`) can never be
 * satisfied for a null owner.
 *
 * Uses `@supabase/supabase-js` directly rather than `@supabase/ssr`: there is no
 * session to read from or refresh into cookies, and going through the cookie
 * plumbing would imply one exists. Session persistence is switched off for the
 * same reason.
 *
 * Never import this from a client component. The key it reads grants unrestricted
 * access to every row in the database.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = requireSupabaseServiceEnv();

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
