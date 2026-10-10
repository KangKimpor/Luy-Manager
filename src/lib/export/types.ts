import type { Account, Category, Merchant, Transaction, TransactionSplit, TransactionTender } from "@/lib/domain/types";
import type { CurrencyCode, ExchangeRate } from "@/lib/money";

export interface AccountExport {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  merchants: Merchant[];
  splits: TransactionSplit[];
  tenders: TransactionTender[];
  baseCurrency: CurrencyCode;
  timezone: string;
  rate: ExchangeRate;
  exportedAt: string;
}
