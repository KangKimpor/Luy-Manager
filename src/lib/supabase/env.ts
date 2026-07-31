/**
 * Supabase environment access.
 *
 * Reads through a single module so a missing variable fails with a message that
 * says which one and where to set it, instead of surfacing as an opaque "Invalid
 * URL" from deep inside the client library.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export class MissingSupabaseEnvError extends Error {
  constructor(missing: readonly string[]) {
    super(
      `Missing Supabase environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and fill them in from your Supabase project settings.`,
    );
    this.name = "MissingSupabaseEnvError";
  }
}

/** Whether Supabase is configured. Lets the app fall back to demo data. */
export function isSupabaseConfigured(): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function requireSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) throw new MissingSupabaseEnvError(missing);

  return { url: url as string, anonKey: anonKey as string };
}

export interface SupabaseServiceEnv extends SupabaseEnv {
  serviceRoleKey: string;
}

/** Whether the service role key is present, without reading its value. */
export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Environment for writes that act without a user session.
 *
 * The published USD/KHR rate is a fact about the world, so it is stored with
 * `user_id = null`. The `exchange_rates_insert_own` policy checks
 * `auth.uid() = user_id`, which no signed-in user can satisfy for a null owner,
 * so the daily rate writer has to hold the service role key.
 *
 * Kept in its own accessor, deliberately not on `requireSupabaseEnv`, so that
 * reaching for the key that bypasses Row Level Security is always a visible,
 * separate act at the call site.
 */
export function requireSupabaseServiceEnv(): SupabaseServiceEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) throw new MissingSupabaseEnvError(missing);

  return {
    url: url as string,
    anonKey: anonKey as string,
    serviceRoleKey: serviceRoleKey as string,
  };
}
