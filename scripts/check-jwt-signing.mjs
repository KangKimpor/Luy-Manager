/** A diagnostic only: an unavailable JWKS must not fail the RLS checks. */
export async function checkJwtSigning(projectUrl, anon, fetcher = fetch) {
  try {
    const response = await fetcher(`${projectUrl}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey: anon }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return `Could not check JWT signing keys (${response.status}).`;
    const body = await response.json();
    if (!Array.isArray(body.keys)) return "Could not check JWT signing keys: invalid JWKS response.";
    if (body.keys.length === 0) return "No public JWT signing keys. getClaims() falls back to a network call per request. Migrate the project to asymmetric JWT signing keys in Supabase Auth.";
    return null;
  } catch {
    return "Could not check JWT signing keys. Check Supabase Auth signing keys in the dashboard.";
  }
}
