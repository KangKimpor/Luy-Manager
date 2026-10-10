import type { TelegramIntent } from "./parse";

export type ReportRequest =
  | { kind: "summary"; window: "today" | "month" }
  | { kind: "recent" }
  | { kind: "accounts" }
  | { kind: "budget" }
  | { kind: "ledger" };

export type CommandReportRequest = Exclude<ReportRequest, { kind: "ledger" }>;

export interface ReportState {
  kind: "report";
  messageId: number;
  request: ReportRequest;
  at: string;
  timezone: string;
}

export function reportRequest(intent: TelegramIntent): CommandReportRequest | null {
  if (intent.kind === "summary") return { kind: "summary", window: intent.window };
  if (intent.kind === "recent" || intent.kind === "accounts" || intent.kind === "budget") {
    return { kind: intent.kind };
  }
  return null;
}

/** Operational logs are untyped JSON, so never use an unchecked message id. */
export function readReportState(value: unknown): ReportState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<ReportState>;
  if (state.kind !== "report" || !Number.isSafeInteger(state.messageId) || (state.messageId ?? 0) <= 0
    || typeof state.at !== "string" || !Number.isFinite(Date.parse(state.at)) || typeof state.timezone !== "string") return null;
  try { new Intl.DateTimeFormat("en", { timeZone: state.timezone }); } catch { return null; }
  const request = state.request;
  if (!request || typeof request !== "object") return null;
  if (request.kind === "summary") {
    if (request.window !== "today" && request.window !== "month") return null;
  } else if (!["recent", "accounts", "budget", "ledger"].includes(request.kind)) return null;
  return { kind: "report", messageId: state.messageId!, request, at: state.at, timezone: state.timezone };
}

export function reportKey(request: ReportRequest): string {
  return request.kind === "summary" ? `summary:${request.window}` : request.kind;
}
