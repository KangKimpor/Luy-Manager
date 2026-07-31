import { LogOut } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { CurrencyToggle } from "@/components/currency-toggle";
import { ManualRateForm } from "@/components/manual-rate-form";
import { MoneyAmount } from "@/components/money-amount";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser, isDemoMode } from "@/lib/auth";
import { readDisplayCurrency } from "@/lib/display-currency";
import { formatMoney, fromMajor } from "@/lib/money";
import { describeFreshness, listRateHistory, loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Settings: who you are, what currency you report in, and which rate you use.
 *
 * The rate section is the substantial part. `references/currency-data.md` argues
 * that for a personal-finance product manual entry is often the *most* accurate
 * source, because the rate that matters is the one your own bank or money changer
 * applied — not the published mid-market figure. Migration 0001 supported personal
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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">Settings</h1>
        {user?.email ? (
          <p className="text-ink-muted text-sm">{user.email}</p>
        ) : demo ? (
          <p className="text-ink-muted text-sm">Running on sample data</p>
        ) : null}
      </header>

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

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent rates</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-border-subtle/70 divide-y">
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
            className="border-border-subtle bg-surface text-ink-muted hover:text-outflow rounded-card flex min-h-11 w-full items-center justify-center gap-2 border text-sm font-semibold"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      ) : null}
    </div>
  );
}
