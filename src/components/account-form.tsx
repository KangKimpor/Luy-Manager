"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CurrencyBadge } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { createAccount, updateAccount } from "@/app/actions/accounts";
import { ACCOUNT_PRESETS, ACCOUNT_TYPE_LABELS } from "@/lib/domain/accounts";
import { ACCOUNT_TYPES, type Account, type AccountType } from "@/lib/domain/types";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Create or edit one account (PRD Section 6).
 *
 * Starts from the presets in the domain layer — ABA, ACLEDA, Wing, TrueMoney, cash
 * in each currency — because typing an institution name and picking a colour by
 * hand is the most tedious part of setting up a finance app, and these are the
 * institutions a Cambodian user actually holds money with.
 *
 * Currency is fixed once the account exists. Every transaction on it is denominated
 * in that currency, so changing it would reinterpret every stored amount —
 * 1,240,000 riel silently becoming $12,400. Banks model this the same way: separate
 * USD and KHR accounts rather than one that switches.
 */

export function AccountForm({ account }: { account?: Account }) {
  const router = useRouter();
  const editing = account !== undefined;

  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? "USD");
  const [openingBalance, setOpeningBalance] = useState(
    account ? formatMinorForInput(account.openingBalance, account.currency) : "",
  );
  const [includeInNetWorth, setIncludeInNetWorth] = useState(
    account?.includeInNetWorth ?? true,
  );
  const [icon, setIcon] = useState(account?.icon ?? "");
  const [color, setColor] = useState(account?.color ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(preset: (typeof ACCOUNT_PRESETS)[number]) {
    setName(preset.label);
    setInstitution(preset.institution ?? "");
    setType(preset.type);
    setCurrency(preset.currencies[0]);
    setIcon(preset.icon);
    setColor(preset.color);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const input = {
      name: name.trim(),
      institution: institution.trim() === "" ? null : institution.trim(),
      type,
      currency,
      openingBalance,
      icon: icon.trim() === "" ? null : icon.trim(),
      color: color.trim() === "" ? null : color.trim(),
      includeInNetWorth,
    };

    const result = editing
      ? await updateAccount({ ...input, id: account.id })
      : await createAccount(input);

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push("/accounts");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!editing ? (
        <fieldset>
          <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
            Start from a preset
          </legend>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-pill border-border-subtle bg-surface text-ink-muted hover:text-ink flex min-h-9 items-center gap-1.5 border px-3 text-xs font-medium transition-colors"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: preset.color }}
                />
                {preset.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Card>
        <CardBody className="space-y-3 pt-4">
          <div>
            <label
              htmlFor="account-name"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Name
            </label>
            <input
              id="account-name"
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ABA USD"
              className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint min-h-11 w-full border px-3 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="account-institution"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Institution <span className="normal-case">(optional)</span>
            </label>
            <input
              id="account-institution"
              type="text"
              value={institution}
              onChange={(event) => setInstitution(event.target.value)}
              placeholder="ABA Bank"
              className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint min-h-11 w-full border px-3 text-sm"
            />
          </div>

          <fieldset>
            <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
              Type
            </legend>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={type === option}
                  onClick={() => setType(option)}
                  className={cn(
                    "rounded-pill min-h-9 border px-3 text-xs font-medium transition-colors",
                    type === option
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border-subtle bg-surface text-ink-muted",
                  )}
                >
                  {ACCOUNT_TYPE_LABELS[option]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
              Currency
            </legend>
            <div className="flex gap-2">
              {CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={currency === code}
                  // Fixed after creation: changing it would reinterpret every
                  // amount already recorded against the account.
                  disabled={editing}
                  onClick={() => setCurrency(code)}
                  className={cn(
                    "rounded-pill min-h-9 border px-4 text-xs font-bold transition-colors",
                    currency === code
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border-subtle bg-surface text-ink-muted",
                    editing && "opacity-50",
                  )}
                >
                  {code}
                </button>
              ))}
              <CurrencyBadge currency={currency} className="self-center" />
            </div>
            {editing ? (
              <p className="text-ink-faint mt-1.5 text-xs">
                An account&apos;s currency cannot change — every transaction on it is
                recorded in {currency}. Create a separate account for the other
                currency, which is how the banks do it too.
              </p>
            ) : null}
          </fieldset>

          <div>
            <label
              htmlFor="account-opening"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Opening balance <span className="normal-case">(optional)</span>
            </label>
            <input
              id="account-opening"
              type="text"
              inputMode="decimal"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
              placeholder={currency === "KHR" ? "0" : "0.00"}
              className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint tabular min-h-11 w-full border px-3 text-sm"
            />
            <p className="text-ink-faint mt-1.5 text-xs">
              {type === "credit_card"
                ? "Enter what you owe as a negative number, e.g. -485."
                : "Blank means the account starts empty."}
            </p>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={includeInNetWorth}
              onChange={(event) => setIncludeInNetWorth(event.target.checked)}
              className="size-4"
            />
            <span className="text-ink">Count toward net worth</span>
          </label>
        </CardBody>
      </Card>

      {error ? (
        <p role="alert" className="text-outflow flex items-start gap-1.5 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button size="full" type="submit" disabled={pending || name.trim() === ""}>
        <Check size={18} aria-hidden="true" />
        {pending ? "Saving…" : editing ? "Save changes" : "Add account"}
      </Button>
    </form>
  );
}

/**
 * Render stored minor units back into an editable major-unit string.
 *
 * Display only, and only to prefill the input — the value the user then edits is
 * re-parsed by the money layer on submit rather than being trusted as a number.
 */
function formatMinorForInput(minor: number, currency: CurrencyCode): string {
  if (minor === 0) return "";
  const decimals = currency === "KHR" ? 0 : 2;
  return (minor / 10 ** decimals).toFixed(decimals);
}
