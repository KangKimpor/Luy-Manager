"use client";

import { EntryChoicePicker } from "@/components/entry-choice-picker";
import { quickAccounts } from "@/lib/domain/entry-choices";
import type { AccountBalance } from "@/lib/domain/types";

export function AccountPicker({ accounts, selectedId, onSelect, label = "Account", compact = false }: {
  accounts: readonly AccountBalance[]; selectedId: string;
  onSelect: (account: AccountBalance) => void; label?: string; compact?: boolean;
}) {
  return <EntryChoicePicker compact={compact} label={label} collection="accounts" selectedId={selectedId} quickIds={quickAccounts(accounts, selectedId).map((account) => account.accountId)}
    options={accounts.map((account) => ({ id: account.accountId, label: account.name, detail: account.currency, group: account.currency,
      keywords: `${account.institution ?? ""} ${account.type.replaceAll("_", " ")}` }))}
    onSelect={(id) => { const account = accounts.find((item) => item.accountId === id); if (account) onSelect(account); }} />;
}
