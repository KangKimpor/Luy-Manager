"use server";

import { headers } from "next/headers";
import { requireUserId } from "@/lib/auth";
import { isTelegramConfigured } from "@/lib/telegram/env";
import { readTelegramStatus, type TelegramStatus } from "@/lib/telegram/status";
import type { ActionResult } from "./transactions";

export async function checkTelegramStatus(): Promise<ActionResult<TelegramStatus>> {
  try {
    await requireUserId();
    if (!isTelegramConfigured()) return { ok: false, error: "Set the bot token and webhook secret in the deployment environment first." };
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    if (!host) return { ok: false, error: "Could not determine this app's address." };
    const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
    return { ok: true, data: await readTelegramStatus(origin) };
  } catch {
    // A failed fetch can include a URL containing the bot token. Do not return or
    // log that error object, including for authenticated users.
    return { ok: false, error: "Could not check the bot. Sign in and check the deployment's Telegram configuration." };
  }
}
