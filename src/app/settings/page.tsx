import {
  Banknote,
  Check,
  LogOut,
  Palette,
  Send,
  Swap,
  User,
} from "@/components/app-icon";

import { signOut } from "@/app/actions/auth";
import { AppearanceControl } from "@/components/appearance-control";
import { CurrencyToggle } from "@/components/currency-toggle";
import { ManualRateForm } from "@/components/manual-rate-form";
import { TelegramStatusCheck } from "@/components/telegram-status";
import { buttonVariants } from "@/components/ui/button";
import { readAppearance } from "@/lib/appearance";
import { getUser, isDemoMode } from "@/lib/auth";
import { getProfile } from "@/lib/data/reference";
import { readDisplayCurrency } from "@/lib/display-currency";
import { formatMoney, fromMajor } from "@/lib/money";
import { describeFreshness, loadUsdKhrRate } from "@/lib/rates/repository";
import {
  botUsername,
  isTelegramConfigured,
  requireTelegramEnv,
} from "@/lib/telegram/env";
import { connectUrl, createLinkToken } from "@/lib/telegram/link";

interface TelegramState {
  available: boolean;
  connected: boolean;
  url: string | null;
}

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

export default async function SettingsPage() {
  const [displayCurrency, appearance, snapshot, user, telegram] = await Promise.all([
    readDisplayCurrency(),
    readAppearance(),
    loadUsdKhrRate(),
    getUser(),
    telegramConnectState(),
  ]);

  const demo = isDemoMode();
  const perDollar = formatMoney(fromMajor(snapshot.rate.rate, "KHR"));

  return (
    <div className="page-enter stagger-children mx-auto max-w-2xl space-y-6">
      <section aria-label="Account status">
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-left">
              <span
                className="settings-tile"
                style={{ backgroundColor: "var(--color-brand)" }}
              >
                <User size={16} aria-hidden="true" />
              </span>
              <span className="settings-label truncate">
                {user?.email ?? "Sample data"}
              </span>
            </div>
            <span className="settings-value shrink-0">
              {demo ? "Not signed in" : "Signed in"}
            </span>
          </div>
        </div>
      </section>

      <section className="sec-wrap" aria-label="Preferences">
        <div className="settings-group-header">Preferences</div>
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-left">
              <span
                className="settings-tile"
                style={{ backgroundColor: "var(--color-brand)" }}
              >
                <Swap size={16} aria-hidden="true" />
              </span>
              <span className="settings-label">Currency</span>
            </div>
            <CurrencyToggle current={displayCurrency} />
          </div>

          <div className="settings-row settings-row-wrap">
            <div className="settings-row-left">
              <span
                className="settings-tile"
                style={{ backgroundColor: "var(--color-chart-4)" }}
              >
                <Palette size={16} aria-hidden="true" />
              </span>
              <span className="settings-label">Appearance</span>
            </div>
            <AppearanceControl current={appearance} />
          </div>
        </div>
        <p className="settings-group-footer">
          Totals convert to your chosen currency. Accounts and transactions keep their original
          currency.
        </p>
      </section>

      <section className="sec-wrap" aria-label="Exchange rate">
        <div className="settings-group-header">Exchange rate</div>
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-left">
              <span
                className="settings-tile"
                style={{ backgroundColor: "var(--color-khr)" }}
              >
                <Banknote size={16} aria-hidden="true" />
              </span>
              <span className="settings-label">Current rate</span>
            </div>
            <span className="settings-value font-num tabular">$1 = {perDollar}</span>
          </div>

          <div className="settings-row no-icon">
            {demo ? (
              <p className="text-ink-muted text-sm">
                Your own rate is available when your account is connected.
              </p>
            ) : (
              <ManualRateForm currentRate={snapshot.rate.rate} />
            )}
          </div>
        </div>
        <p className="settings-group-footer">
          {describeFreshness(snapshot)}
          {snapshot.rate.source === "api" ? " · fetched automatically" : null}
          {snapshot.rate.source === "manual" ? " · your own figure" : null}
          {snapshot.freshness === "stale" ? (
            <span className="text-outflow"> · the daily sync may have stalled</span>
          ) : null}
          {!demo
            ? " Transactions you have already recorded keep the rate they were saved with."
            : null}
        </p>
      </section>

      <section className="sec-wrap" aria-label="Integrations">
        <div className="settings-group-header">Integrations</div>
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-left">
              <span
                className="settings-tile"
                style={{ backgroundColor: "var(--color-usd)" }}
              >
                <Send size={15} aria-hidden="true" />
              </span>
              <span className="settings-label">Telegram bot</span>
            </div>
            <span className="settings-value">
              {!telegram.available
                ? "Not configured"
                : telegram.connected
                  ? "Connected"
                  : "Not connected"}
            </span>
          </div>

          <div className="settings-row no-icon flex-col items-stretch gap-3 py-3.5">
            <div>
              <p className="text-ink text-sm font-semibold">Your money, in a message.</p>
              <p className="caption mt-0.5">
                Connect @LuyManagerBot and keep your ledger up to date from Telegram.
              </p>
            </div>

            {!telegram.available ? (
              <p className="caption">
                Connect your Telegram bot in this deployment to log money from a chat.
              </p>
            ) : telegram.connected ? (
              <div className="space-y-2.5">
                <p className="text-inflow flex items-center gap-1.5 text-sm font-semibold">
                  <Check size={16} aria-hidden="true" />
                  Connected
                </p>
                <a
                  href={`https://t.me/${botUsername()}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={buttonVariants({ size: "full" })}
                >
                  <Send size={16} aria-hidden="true" />
                  Open Telegram
                </a>
              </div>
            ) : telegram.url ? (
              <div className="space-y-2">
                <a
                  href={telegram.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={buttonVariants({ size: "full" })}
                >
                  <Send size={16} aria-hidden="true" />
                  Connect Telegram
                </a>
                <p className="caption">
                  The link is valid for 15 minutes. Reload this page for a fresh one.
                </p>
              </div>
            ) : (
              <p className="caption">Sign in to connect Telegram to your account.</p>
            )}

            {telegram.available ? <TelegramStatusCheck /> : null}
          </div>
        </div>
        <p className="settings-group-footer">
          Try sending -$5 coffee, +$500 salary, Transfer $20 ABA to Cash, or /budget.
        </p>
      </section>

      {user ? (
        <section className="sec-wrap" aria-label="Sign out">
          <div className="settings-group">
            <form action={signOut}>
              <button
                type="submit"
                className="text-outflow hover:bg-outflow-soft/50 flex min-h-[52px] w-full items-center justify-center gap-2 text-base font-medium transition-colors"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
