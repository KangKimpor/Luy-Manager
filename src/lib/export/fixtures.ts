import type { Account, Transaction } from "@/lib/domain/types";
import { exchangeRate } from "@/lib/money";
import type { AccountExport } from "./types";

export function exportFixture(): AccountExport {
  const account = (id: string, currency: "USD" | "KHR", openingBalance: number): Account => ({ id, userId: "owner", name: id, institution: null, type: "bank", currency, openingBalance, icon: null, color: null, isActive: true, includeInNetWorth: true, sortOrder: 0 });
  const tx = (id: string, accountId: string, amount: number, currency: "USD" | "KHR", type: Transaction["type"], extra: Partial<Transaction> = {}): Transaction => ({ id, userId: "owner", accountId, amount, currency, type, categoryId: "coffee", merchantId: null, notes: "Coffee & cake <3", location: null, transferGroupId: null, exchangeRate: null, baseAmount: null, baseCurrency: null, occurredAt: "2026-10-09T18:30:00.000Z", createdVia: "telegram", isPending: false, ...extra });
  return {
    accounts: [account("usd", "USD", 10000), account("khr", "KHR", 12000)],
    transactions: [tx("expense", "usd", -525, "USD", "expense"), tx("riel", "khr", -6000, "KHR", "expense"), tx("refund", "usd", 125, "USD", "refund"), tx("out", "usd", -1000, "USD", "transfer", { transferGroupId: "pair" }), tx("in", "khr", 40000, "KHR", "transfer", { transferGroupId: "pair" })],
    categories: [{ id: "coffee", userId: "owner", name: "Coffee", parentId: null, icon: null, color: null, appliesTo: ["expense"], isSystem: false, sortOrder: 0 }],
    merchants: [], splits: [{ id: "split", transactionId: "expense", categoryId: "coffee", amount: -525, currency: "USD", notes: null }],
    tenders: [{ id: "payment", transactionId: "expense", accountId: "usd", amount: 525, currency: "USD", exchangeRate: null }],
    baseCurrency: "USD", timezone: "Asia/Phnom_Penh", rate: exchangeRate(4000, "USD", "KHR"), exportedAt: "2026-10-10T06:00:00.000Z",
  };
}
