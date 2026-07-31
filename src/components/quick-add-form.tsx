"use client";

import { Check, Delete } from "lucide-react";
import { useMemo, useState } from "react";

import { CurrencyBadge } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { buildTransaction } from "@/lib/domain/transactions";
import type { AccountBalance, Category, TransactionType } from "@/lib/domain/types";
import { CURRENCIES, type CurrencyCode, formatMoney, fromMajor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Fast transaction entry.
 *
 * PRD Section 1 sets a five-second budget for adding a transaction, which rules
 * out a conventional form. The design that follows from that:
 *
 *   - A custom keypad rather than a text input. It removes the OS keyboard's
 *     open/close animation, guarantees the same layout on every device, and
 *     cannot produce a non-numeric value that needs validating.
 *   - Currency toggled with one tap, defaulting to the selected account's own
 *     currency, because that is what the user is about to spend.
 *   - Category and account are optional. Forcing a category on entry is what
 *     makes people stop logging cash purchases; an uncategorised row is far more
 *     useful than a missing one.
 *
 * Submission is stubbed until Supabase is wired: it builds the exact row that
 * will be inserted and surfaces it, so the shape is verifiable now.
 */

const TYPES: Array<{ value: TransactionType; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

interface QuickAddFormProps {
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
}

export function QuickAddForm({ accounts, categories }: QuickAddFormProps) {
  const [type, setType] = useState<TransactionType>("expense");
  const [raw, setRaw] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.accountId ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(accounts[0]?.currency ?? "USD");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const relevantCategories = useMemo(
    () => categories.filter((category) => category.appliesTo.includes(type)),
    [categories, type],
  );

  const amount = useMemo(() => {
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed)) return fromMajor(0, currency);
    return fromMajor(parsed, currency);
  }, [raw, currency]);

  const canSave = amount.minor > 0 && accountId !== "";

  function press(key: (typeof KEYS)[number]) {
    setSaved(null);

    if (key === "del") {
      setRaw((current) => current.slice(0, -1));
      return;
    }

    if (key === ".") {
      // Riel has no subunit, so a decimal point would be meaningless.
      if (currency === "KHR" || raw.includes(".")) return;
      setRaw((current) => (current === "" ? "0." : `${current}.`));
      return;
    }

    setRaw((current) => {
      // Cap at two decimals for USD; more would be silently rounded away.
      const [, decimals] = current.split(".");
      if (decimals !== undefined && decimals.length >= 2) return current;
      if (current === "0") return key;
      return current + key;
    });
  }

  function selectAccount(next: AccountBalance) {
    setAccountId(next.accountId);
    // Follow the account's currency: spending from a KHR wallet means riel.
    setCurrency(next.currency);
    if (next.currency === "KHR") setRaw((current) => current.split(".")[0]);
  }

  function handleSave() {
    if (!canSave) return;

    const row = buildTransaction(
      {
        accountId,
        type,
        amount,
        categoryId,
        notes: note.trim() === "" ? null : note.trim(),
      },
      "USD",
    );

    // Placeholder for the Supabase insert. Building the row here proves the
    // sign convention and conversion fields are correct before persistence lands.
    setSaved(`${row.type} ${row.amount} ${row.currency}`);
    setRaw("");
    setNote("");
    setCategoryId(null);
  }

  return (
    <div className="space-y-3">
      {/* Type toggle. */}
      <div className="bg-surface-muted rounded-pill flex gap-1 p-1" role="group" aria-label="Transaction type">
        {TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={type === option.value}
            onClick={() => {
              setType(option.value);
              setCategoryId(null);
            }}
            className={cn(
              "rounded-pill min-h-9 flex-1 text-sm font-semibold transition-colors",
              type === option.value ? "bg-surface text-ink shadow-card" : "text-ink-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Amount display. */}
      <Card>
        <CardBody className="pt-4">
          <div className="flex items-center justify-between gap-3">
            <output
              aria-live="polite"
              aria-label="Amount entered"
              className={cn(
                "tabular text-3xl font-bold",
                type === "expense" ? "text-outflow" : "text-inflow",
              )}
            >
              {formatMoney(amount)}
            </output>

            <div className="flex gap-1" role="group" aria-label="Currency">
              {CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={currency === code}
                  onClick={() => {
                    setCurrency(code);
                    if (code === "KHR") setRaw((current) => current.split(".")[0]);
                  }}
                  className={cn(
                    "rounded-pill min-h-9 px-3 text-xs font-bold transition-colors",
                    currency === code
                      ? "bg-brand text-white"
                      : "bg-surface-muted text-ink-muted",
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Keypad. */}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === "del" ? "Delete last digit" : key}
            disabled={key === "." && currency === "KHR"}
            className={cn(
              "bg-surface shadow-card rounded-card flex min-h-14 items-center justify-center text-xl font-semibold transition-colors active:bg-surface-muted",
              key === "." && currency === "KHR" && "opacity-30",
            )}
          >
            {key === "del" ? <Delete size={20} aria-hidden="true" /> : key}
          </button>
        ))}
      </div>

      {/* Account. */}
      <fieldset>
        <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          Account
        </legend>
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <button
              key={account.accountId}
              type="button"
              aria-pressed={accountId === account.accountId}
              onClick={() => selectAccount(account)}
              className={cn(
                "rounded-pill flex min-h-9 items-center gap-1.5 border px-3 text-xs font-medium transition-colors",
                accountId === account.accountId
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border-subtle bg-surface text-ink-muted",
              )}
            >
              {account.name}
              <CurrencyBadge currency={account.currency} />
            </button>
          ))}
        </div>
      </fieldset>

      {/* Category. */}
      <fieldset>
        <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          Category <span className="normal-case">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {relevantCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
              className={cn(
                "rounded-pill min-h-9 border px-3 text-xs font-medium transition-colors",
                categoryId === category.id
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border-subtle bg-surface text-ink-muted",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Note. */}
      <div>
        <label htmlFor="note" className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
          Note <span className="normal-case">(optional)</span>
        </label>
        <input
          id="note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Coffee at Brown"
          className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint min-h-11 w-full border px-3 text-sm"
        />
      </div>

      <Button size="full" disabled={!canSave} onClick={handleSave}>
        <Check size={18} aria-hidden="true" />
        Save {type === "expense" ? "expense" : "income"}
      </Button>

      {saved ? (
        <p role="status" className="text-inflow text-center text-sm font-medium">
          Built row: {saved} — persistence lands with the Supabase wiring.
        </p>
      ) : null}
    </div>
  );
}
