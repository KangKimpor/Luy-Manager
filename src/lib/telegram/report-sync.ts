import { asRows } from "@/lib/data/client";
import type { CurrencyCode } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { editMessage, sendMessage } from "./client";
import { isTelegramConfigured } from "./env";
import { renderTelegramReport } from "./handle";
import { readReportState, reportKey, type ReportRequest, type ReportState } from "./report-state";
import { validTimezone } from "./reporting";

type Admin = ReturnType<typeof createAdminClient>;
type Profile = { id: string; telegram_chat_id: number; base_currency: CurrencyCode; timezone: string };
const jobs = new Map<string, { rerun: boolean; running: Promise<void> }>();

async function revision(admin: Admin, userId: string): Promise<string> {
  // Include deleted rows: a deletion is itself a ledger revision.
  const { data, error } = await admin.from("transactions").select("updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Could not check the ledger revision.");
  return (data as { updated_at: string } | null)?.updated_at ?? "";
}

async function stillLinked(admin: Admin, profile: Profile): Promise<boolean> {
  const { data, error } = await admin.from("profiles").select("id")
    .eq("id", profile.id).eq("telegram_chat_id", profile.telegram_chat_id).maybeSingle();
  if (error) throw new Error("Could not verify the linked chat.");
  return data !== null;
}

async function record(admin: Admin, profile: Profile, text: string, state: ReportState | null, error: string | null = null) {
  // Append revisions so the audit retains what the bot originally displayed.
  const result = await admin.from("telegram_logs").insert({
    user_id: profile.id, chat_id: profile.telegram_chat_id, direction: "outbound",
    message_text: text, parsed: state, error_message: error,
  });
  if (result.error) console.error("[telegram] Could not log the refreshed report.");
}

async function refreshOnce(admin: Admin, profile: Profile): Promise<void> {
  const requests: ReportRequest[] = [{ kind: "summary", window: "today" }, { kind: "summary", window: "month" },
    { kind: "recent" }, { kind: "accounts" }, { kind: "budget" }, { kind: "ledger" }];
  // Read each view separately, ordered by request time. A busy history view must
  // not push a still-visible budget or daily summary out of a global log limit.
  const groups = await Promise.all(requests.map(async request => {
    const { data, error } = await admin.from("telegram_logs").select("message_text, parsed")
      .eq("user_id", profile.id).eq("chat_id", profile.telegram_chat_id).eq("direction", "outbound")
      .is("error_message", null).contains("parsed", { kind: "report", request })
      .order("parsed->>at", { ascending: false }).order("created_at", { ascending: false }).limit(5);
    if (error) throw new Error("Could not load the Telegram reports.");
    return asRows(data);
  }));
  const latest = new Map<string, { state: ReportState; text: unknown }>();
  for (const row of groups.flat()) {
    const state = readReportState(row.parsed);
    if (!state) continue;
    const key = reportKey(state.request);
    const previous = latest.get(key);
    // A background audit entry can be newer than a fresh user request.
    // Compare the request time rather than letting that entry revive an older card.
    if (!previous || state.at > previous.state.at) latest.set(key, { state, text: row.message_text });
  }
  if (!latest.has("ledger") && ["summary:today", "summary:month", "recent"].some(key => !latest.has(key))) {
    const text = await renderTelegramReport(admin, profile, { kind: "ledger" });
    if (!await stillLinked(admin, profile)) return;
    const sent = await sendMessage(profile.telegram_chat_id, text);
    await record(admin, profile, text, sent.ok && sent.messageId
      ? { kind: "report", request: { kind: "ledger" }, at: new Date().toISOString(), timezone: validTimezone(profile.timezone), messageId: sent.messageId } : null,
    sent.ok ? null : sent.error ?? "Could not deliver the refreshed report.");
  }
  if (latest.size === 0) return;
  await Promise.all([...latest.values()].map(async ({ state, text: previousText }) => {
    try {
      const reportProfile = state.request.kind === "ledger" ? profile : { ...profile, timezone: state.timezone };
      const text = await renderTelegramReport(admin, reportProfile, state.request, new Date(state.at));
      if (text === previousText) return;
      if (!await stillLinked(admin, profile)) return;
      const edited = await editMessage(profile.telegram_chat_id, state.messageId, text);
      if (edited.missing) {
        if (!await stillLinked(admin, profile)) return;
        const sent = await sendMessage(profile.telegram_chat_id, text);
        await record(admin, profile, text, sent.ok && sent.messageId ? { ...state, messageId: sent.messageId } : null,
          sent.ok ? null : sent.error ?? "Could not deliver the refreshed report.");
      } else {
        await record(admin, profile, text, edited.ok ? state : null,
          edited.ok ? null : edited.error ?? "Could not update the report.");
      }
    } catch {
      console.error("[telegram] A report could not be refreshed.");
    }
  }));
}

/** Receives only the authenticated owner's id, never a chat id from a web form. */
export async function refreshTelegramReports(userId: string): Promise<void> {
  if (!isTelegramConfigured() || !isServiceRoleConfigured()) return;
  const active = jobs.get(userId);
  if (active) { active.rerun = true; await active.running; return; }
  const job = { rerun: false, running: Promise.resolve() };
  jobs.set(userId, job);
  job.running = Promise.resolve().then(async () => {
    try {
      const admin = createAdminClient();
      do {
        job.rerun = false;
        const { data, error } = await admin.from("profiles").select("id, telegram_chat_id, base_currency, timezone")
          .eq("id", userId).maybeSingle();
        if (error) throw new Error("Could not find the linked chat.");
        const profile = data as Profile | null;
        if (!profile || !Number.isSafeInteger(profile.telegram_chat_id) || profile.telegram_chat_id <= 0) return;
        // Another server instance may finish a deletion during Telegram delivery.
        // Re-read after delivery and repair a report calculated before that change.
        for (let attempt = 0; attempt < 3; attempt++) {
          const before = await revision(admin, userId);
          await refreshOnce(admin, profile);
          if (before === await revision(admin, userId)) break;
        }
      } while (job.rerun);
    } catch {
      console.error("[telegram] Report refresh failed. The web change remains saved.");
    } finally {
      jobs.delete(userId);
    }
  });
  await job.running;
}
