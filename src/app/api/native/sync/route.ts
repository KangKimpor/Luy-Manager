import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, requireSupabaseEnv } from "@/lib/supabase/env";
import { queueTelegramReportRefresh } from "@/lib/telegram/report-refresh";

/** Native clients have bearer sessions, not browser cookies. Never accept an owner from the body. */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return Response.json({ error: "Sign in to sync." }, { status: 401 });
  if (!isSupabaseConfigured()) return Response.json({ error: "Sync is unavailable." }, { status: 503 });
  const { url, anonKey } = requireSupabaseEnv();
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Sign in again." }, { status: 401 });
    // Refresh existing report messages. Repeated retries do not create duplicate ledger entries or replies.
    queueTelegramReportRefresh(data.user.id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Sync is temporarily unavailable." }, { status: 503 });
  }
}
