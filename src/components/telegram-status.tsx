"use client";

import { useState, useTransition } from "react";
import { Activity, CheckCircle2, Loader2 } from "lucide-react";
import { checkTelegramStatus } from "@/app/actions/telegram";
import type { TelegramStatus } from "@/lib/telegram/status";

export function TelegramStatusCheck() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const healthy = status?.webhookMatches && !status.deliveryError && status.pendingUpdates === 0;
  return (
    <div className="mt-4 space-y-3">
      <button type="button" disabled={pending}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
        onClick={() => startTransition(async () => {
          const result = await checkTelegramStatus();
          setStatus(result.ok ? result.data : null);
          setError(result.ok ? null : result.error);
        })}>
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Activity size={16} aria-hidden="true" />}
        {pending ? "Checking bot..." : "Check bot connection"}
      </button>
      <div aria-live="polite" className="space-y-1 text-sm text-ink-muted">
        {error && <p className="text-outflow">{error}</p>}
        {status && <>
          <p className="flex items-center gap-2 font-semibold text-ink">{healthy && <CheckCircle2 size={16} className="text-inflow" aria-hidden="true" />}@{status.username}: {healthy ? "ready" : "needs attention"}</p>
          <p>{!status.webhookRegistered ? "No webhook is registered. Run the bot setup command for this app." : status.webhookMatches ? "Telegram delivers messages to this app." : "The registered webhook points to a different app address."}</p>
          <p>{status.pendingUpdates} messages waiting for delivery.</p>
          {status.deliveryError && <p className="text-outflow">{status.deliveryError}</p>}
        </>}
      </div>
    </div>
  );
}
