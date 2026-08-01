import { Check, LogOut, Send, User } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { CurrencyToggle } from "@/components/currency-toggle";
import { ManualRateForm } from "@/components/manual-rate-form";
import { MoneyAmount } from "@/components/money-amount";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser, isDemoMode } from "@/lib/auth";
import { getProfile } from "@/lib/data/reference";
import { readDisplayCurrency } from "@/lib/display-currency";
import { formatMoney, fromMajor } from "@/lib/money";
import { describeFreshness, listRateHistory, loadUsdKhrRate } from "@/lib/rates/repository";
import { botUsername, isTelegramConfigured, requireTelegramEnv } from "@/lib/telegram/env";
import { connectUrl, createLinkToken } from "@/lib/telegram/link";

interface TelegramState {
  /** Whether this deployment has a bot at all. */
  available: boolean;
  connected: boolean;
  /** A fresh one-tap deep link, when there is a signed-in user left to connect. */
  url: string | null;
}

/**
 * What to show in the Telegram card.
 *
 * Three states worth distinguishing, because the fix differs for each: the bot is
 * not configured on this deployment (an operator problem), the account is already
 * linked (nothing to do), or there is a link to hand out.
 */
async function telegramConnectState(): Promise<TelegramState> {
  const username = botUsername();
  if (!isTelegramConfigured() || !username) {
    return { available: false, connected: false, url: null };
  }

  const profile = await getProfile();
  if (!profile) return { available: true, connected: false, url: null };
  if (profile.telegramChatId !== null) {
    return { available: true, connected: true, url: null };
  }

  const { webhookSecret } = requireTelegramEnv();
  return {
    available: true,
    connected: false,
    url: connectUrl(username, createLinkToken(profile.id, webhookSecret)),
  };
}

/**
 * Settings: who you are, what currency you report in, and which rate you use.
 *
 * The rate section is the substantial part. `references/currency-data.md` argues
 * that for a personal-finance product manual entry is often the *most* accurate
 * source, because the rate that matters is the one your own bank or money changer
 * applied, not the published mid-market figure. Migration 0001 supported personal
 * overrides from the start and the reader already prefers them; this is where one
 * gets written.
 */
export default async function SettingsPage() {
  const [displayCurrency, snapshot, user, history] = await Promise.all([
    readDisplayCurrency(),
    loadUsdKhrRate(),
    getUser(),
    listRateHistory(14),
  ]);

  const demo = isDemoMode();
  const telegram = await telegramConnectState();

  return (
    <div className="space-y-4">
      {/* Who you are. The screen name itself comes from the app bar. */}
      <div className="flex items-center gap-3">
        <span className="bg-brand text-surface flex size-10 shrink-0 items-center justify-center rounded-full">
          <User size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          {user?.email ? (
            <p className="text-numeric-md text-ink truncate">{user.email}</p>
          ) : (
            <p className="text-numeric-md text-ink">Sample data</p>
          )}
          <p className="text-ink-faint text-xs">
            {demo ? "Not signed in" : "Signed in"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report totals in</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <CurrencyToggle current={displayCurrency} />
          <p className="text-ink-faint text-xs">
            Applies to net worth and other totals. Individual accounts and
            transactions always stay in the currency they are actually held or spent
            in, so they can be checked against a bank app or a receipt.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exchange rate</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <p className="tabular text-xl font-bold">
              {formatMoney(fromMajor(snapshot.rate.rate, "KHR"))}
              <span className="text-ink-muted text-sm font-normal"> per $1</span>
            </p>
            <p className="text-ink-faint text-xs">
              {describeFreshness(snapshot)}
              {snapshot.rate.source === "api" ? " · fetched automatically" : null}
              {snapshot.rate.source === "manual" ? " · your own figure" : null}
              {snapshot.freshness === "stale" ? (
                <span className="text-outflow">
                  {" "}
                  · the daily sync may have stalled
                </span>
              ) : null}
            </p>
          </div>

          {demo ? (
            <p className="text-ink-muted text-sm">
              Connect Supabase to record your own rate.
            </p>
          ) : (
            <ManualRateForm currentRate={snapshot.rate.rate} />
          )}
        </CardBody>
      </Card>

      {/*
        Telegram, PRD Section 9.
        The token is minted here, server side, on each render. It is short lived by
        design, so a page left open overnight yields a stale link and the bot says so
        rather than failing silently.
      */}
      <Card>
        <CardHeader>
          <CardTitle>Telegram bot</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {!telegram.available ? (
            <p className="text-ink-muted text-body-md">
              Not set up on this deployment. It needs{" "}
              <code className="text-ink text-xs">TELEGRAM_BOT_TOKEN</code>,{" "}
              <code className="text-ink text-xs">TELEGRAM_WEBHOOK_SECRET</code> and{" "}
              <code className="text-ink text-xs">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>.
            </p>
          ) : telegram.connected ? (
            <>
              <p className="text-inflow text-numeric-md flex items-center gap-2">
                <Check size={16} aria-hidden="true" />
                Connected
              </p>
              <p className="text-ink-muted text-body-md">
                Message the bot to log money without opening the app. Try{" "}
                <code className="text-ink text-xs">Spent $5 coffee</code> or{" "}
                <code className="text-ink text-xs">Summary today</code>.
              </p>
            </>
          ) : telegram.url ? (
            <>
              <p className="text-ink-muted text-body-md">
                Log money by messaging the bot. Connect this account, then send it{" "}
                <code className="text-ink text-xs">Spent $5 coffee</code>.
              </p>
              <a
                href={telegram.url}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({ size: "full" })}
              >
                <Send size={16} aria-hidden="true" />
                Connect Telegram
              </a>
              <p className="text-ink-faint text-xs">
                The link is valid for 15 minutes. Reload this page for a fresh one.
              </p>
            </>
          ) : (
            <p className="text-ink-muted text-body-md">
              Sign in to connect Telegram to your account.
            </p>
          )}
        </CardBody>
      </Card>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent rates</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-surface-variant divide-y">
              {history.map((entry) => (
                <li
                  key={entry.asOf}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-ink-muted text-xs">{entry.asOf}</span>
                  <span className="flex items-center gap-3">
                    {entry.publishedRate !== null ? (
                      <span className="text-ink-faint tabular text-xs">
                        published{" "}
                        <MoneyAmount amount={fromMajor(entry.publishedRate, "KHR")} />
                      </span>
                    ) : null}
                    <span className="tabular text-sm font-semibold">
                      <MoneyAmount amount={fromMajor(entry.effectiveRate, "KHR")} />
                    </span>
                    {entry.isOverride ? (
                      <span className="bg-brand-soft text-brand rounded-pill px-2 py-0.5 text-[0.625rem] font-bold">
                        YOURS
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {user ? (
        <form action={signOut}>
          <button
            type="submit"
            // Destructive actions read as destructive before they are pressed.
            className="bg-outflow-soft text-outflow rounded-card flex min-h-12 w-full items-center justify-center gap-2 text-sm font-semibold transition-opacity active:opacity-80"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      ) : null}
    </div>
  );
}
