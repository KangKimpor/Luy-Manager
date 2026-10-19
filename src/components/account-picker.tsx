"use client";

import { EntryChoicePicker } from "@/components/entry-choice-picker";
import { quickAccounts, quickEntryAccounts } from "@/lib/domain/entry-choices";
import type { AccountBalance } from "@/lib/domain/types";

export function AccountPicker({ accounts, selectedId, onSelect, label = "Account", compact = false }: {
  accounts: readonly AccountBalance[]; selectedId: string;
  onSelect: (account: AccountBalance) => void; label?: string; compact?: boolean;
}) {
  return <EntryChoicePicker compact={compact} showQuickChoices={compact} label={label} collection="accounts" selectedId={selectedId} quickIds={(compact ? quickEntryAccounts(accounts, selectedId) : quickAccounts(accounts, selectedId)).map((account) => account.accountId)}
    options={accounts.map((account) => ({ id: account.accountId, label: account.name, detail: account.currency, group: account.currency,
      keywords: `${account.institution ?? ""} ${account.type.replaceAll("_", " ")}` }))}
    onSelect={(id) => { const account = accounts.find((item) => item.accountId === id); if (account) onSelect(account); }} />;
}
