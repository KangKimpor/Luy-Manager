import type { AccountExport } from "./types";
import { add, money, type Money } from "@/lib/money";

/** Reconcile the exported rows themselves, rather than a balance read at another instant. */
export function exportBalances(data: AccountExport): Map<string, Money> {
  const balances = new Map(data.accounts.map((a) => [a.id, money(a.openingBalance, a.currency)]));
  for (const tx of data.transactions) {
    const balance = balances.get(tx.accountId);
    if (!balance) throw new Error("An entry refers to an unavailable account. Reload before exporting.");
    balances.set(tx.accountId, add(balance, money(tx.amount, tx.currency)));
  }
  return balances;
}

/** Excel has only 15 significant digits. The accompanying minor-unit column stays text. */
export function decimalAmount(amount: Money): string {
  const minor = BigInt(amount.minor);
  if (amount.currency === "KHR") return String(minor);
  const magnitude = minor < BigInt(0) ? -minor : minor;
  return `${minor < BigInt(0) ? "-" : ""}${magnitude / BigInt(100)}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
}
