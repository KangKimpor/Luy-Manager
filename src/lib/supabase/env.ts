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
