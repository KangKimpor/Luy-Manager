import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { absolute, convert, money, resolveMultiplier, toMajor, CURRENCY_META, type CurrencyCode } from "@/lib/money";
import { exportBalances } from "./ledger";
import type { AccountExport } from "./types";
import template from "./money-manager-schema.json";

const CORE_DATA_EPOCH = Date.UTC(2001, 0, 1);
const GROUPS = [
  { id: "1", name: "Debit Card", order: 104, status: 3 },
  { id: "2", name: "Savings", order: 105, status: 4 },
  { id: "11", name: "Cash", order: 101, status: 11 },
  { id: "4", name: "Investments", order: 107, status: 8 },
  { id: "5", name: "Accounts", order: 102, status: 1 },
  { id: "6", name: "Insurance", order: 110, status: 10 },
  { id: "7", name: "Others", order: 111, status: 7 },
  { id: "8", name: "Card", order: 103, status: 2 },
  { id: "9", name: "Top-Up/Prepaid", order: 106, status: 6 },
  { id: "10", name: "Overdrafts", order: 108, status: 9 },
  { id: "3", name: "Loan", order: 109, status: 5 },
];

function localDay(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A new Core Data database, never a renamed JSON file or a copy of the user's backup. */
export async function buildMmbak(data: AccountExport): Promise<Uint8Array> {
  exportBalances(data);
  const directory = await mkdtemp(join(tmpdir(), "luy-export-"));
  let db: DatabaseSync | undefined;
  try {
    const path = join(directory, "export.mmbak");
    db = new DatabaseSync(path);
    db.exec("PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = DELETE;");
    for (const statement of template.schema) db.exec(statement);
    const timestamp = new Date(data.exportedAt).getTime();
    const counts = new Map<string, number>();
    const inserts = new Map<string, { columns: Array<{ name: string; type: string }>; run: (...values: SQLInputValue[]) => unknown }>();
    for (const entity of template.entities) {
      const table = `Z${entity.name.toUpperCase()}`;
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string; type: string }>;
      const statement = db.prepare(`INSERT INTO ${table} (${columns.map((c) => c.name).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
      inserts.set(table, { columns, run: (...values) => statement.run(...values) });
      counts.set(table, 0);
    }
    function insert(entityName: string, values: Record<string, SQLInputValue>) {
      const entity = template.entities.find((e) => e.name === entityName)!;
      const table = `Z${entityName.toUpperCase()}`;
      const id = counts.get(table)! + 1;
      const common = { Z_PK: id, Z_ENT: entity.id, Z_OPT: 1, ZISDEL: 0, ZISSYNCED: 0, ZSYNCVERSION: 0, ZUTIME: timestamp, ...values };
      const { columns, run } = inserts.get(table)!;
      run(...columns.map((c) => c.name in common ? common[c.name as keyof typeof common] : /^(INTEGER|INT|FLOAT)/.test(c.type) ? 0 : null));
      counts.set(table, id);
    }
    db.exec("BEGIN");
    const uid = (currency: CurrencyCode) => `${data.baseCurrency}_${currency}`;
    for (const [index, currency] of (["USD", "KHR"] as const).entries()) {
      const meta = CURRENCY_META[currency];
      insert("Currency", { ZUID: uid(currency), ZISO: currency, ZMAINISO: data.baseCurrency, ZPOINT: meta.decimals, ZRATE: resolveMultiplier(currency, data.baseCurrency, data.rate), ZISMAINCURRENCY: currency === data.baseCurrency ? 1 : 0, ZISSHOW: 1, ZORDERSEQ: index + 1, ZMODIFYDATE: (timestamp - CORE_DATA_EPOCH) / 1000, ZINSERTTYPE: "I", ZMEMO: currency, ZSYMBOL: meta.symbol, ZSYMBOLPOSITION: meta.symbolLeading ? "P" : "S" });
    }
    for (const group of GROUPS) insert("AssetGroup", { ZUID: group.id, ZASSETGROUPNAME: group.name, ZORDER: group.order, ZSTATUS: group.status });
    for (const account of data.accounts) {
      const group = account.type === "cash" ? "11" : account.type === "savings" ? "2" : account.type === "investment" ? "4" : account.type === "credit_card" ? "8" : account.type === "ewallet" ? "9" : "5";
      insert("Asset", { ZUID: account.id, ZNICNAME: account.name, ZGROUPUID: group, ZCURRENCYUID: uid(account.currency), ZORDER: account.sortOrder, ZMEMO: [account.institution, !account.isActive ? "Closed in Luy Manager" : null, !account.includeInNetWorth ? "Excluded from net worth in Luy Manager" : null].filter(Boolean).join(" · "), ZZDATA2: JSON.stringify({ source: "luy-manager", account }) });
    }
    // The target format separates income and expense categories. Keep both when a Luy category serves both.
    const categoryIds = new Set<string>();
    for (const category of data.categories) {
      for (const direction of [0, 1]) {
        const id = `${category.id}:${direction}`;
        categoryIds.add(id);
        insert("Category", { ZUID: id, ZNAME: category.name, ZPUID: category.parentId ? `${category.parentId}:${direction}` : "0", ZDOTYPE: direction, ZSTATUS: 0, ZORDER: category.sortOrder });
      }
    }
    const accounts = new Map(data.accounts.map((a) => [a.id, a]));
    const merchants = new Map(data.merchants.map((m) => [m.id, m.name]));
    const groups = new Map<string, typeof data.transactions>();
    for (const tx of data.transactions) if (tx.transferGroupId) groups.set(tx.transferGroupId, [...(groups.get(tx.transferGroupId) ?? []), tx]);
    const splits = new Map<string, typeof data.splits>();
    for (const split of data.splits) splits.set(split.transactionId, [...(splits.get(split.transactionId) ?? []), split]);
    const tenders = new Map<string, typeof data.tenders>();
    for (const tender of data.tenders) tenders.set(tender.transactionId, [...(tenders.get(tender.transactionId) ?? []), tender]);
    const firstDate = data.transactions.reduce((date, t) => t.occurredAt < date ? t.occurredAt : date, data.exportedAt);
    for (const account of data.accounts) {
      if (!account.openingBalance) continue;
      const native = absolute(money(account.openingBalance, account.currency));
      const date = new Date(firstDate).getTime() - 1000;
      insert("InOutCome", { ZUID: `opening:${account.id}`, ZASSETUID: account.id, ZCURRENCYUID: uid(account.currency), ZDO_TYPE: account.openingBalance < 0 ? "8" : "7", ZCATEGORYUID: "-4", ZCONTENT: "Opening balance", ZAMOUNT: toMajor(convert(native, data.baseCurrency, data.rate)), ZAMOUNTACCOUNT: toMajor(native), ZAMOUNTSUB: toMajor(native), ZDATE: (date - CORE_DATA_EPOCH) / 1000, ZTXDATESTR: localDay(new Date(date).toISOString(), data.timezone), ZZDATA2: JSON.stringify({ source: "luy-manager", openingBalance: account.openingBalance, currency: account.currency }) });
    }
    for (const tx of data.transactions) {
      const native = absolute(money(tx.amount, tx.currency));
      const base = tx.baseAmount !== null && tx.baseCurrency === data.baseCurrency ? absolute(money(tx.baseAmount, tx.baseCurrency)) : convert(native, data.baseCurrency, data.rate);
      const direction = tx.amount < 0 ? 1 : 0;
      const category = tx.categoryId ? `${tx.categoryId}:${direction}` : null;
      const pair = tx.transferGroupId ? groups.get(tx.transferGroupId) : null;
      if (tx.type === "transfer" && (!pair || pair.length !== 2 || pair[0].accountId === pair[1].accountId || (pair[0].amount < 0) === (pair[1].amount < 0) || pair.some((leg) => leg.type !== "transfer" || leg.amount === 0))) {
        throw new Error("A transfer is incomplete. Reload your ledger before exporting.");
      }
      const other = pair?.find((leg) => leg.id !== tx.id);
      insert("InOutCome", {
        ZUID: tx.id, ZASSETUID: tx.accountId, ZASSET_NIC: accounts.get(tx.accountId)!.name,
        ZCURRENCYUID: uid(tx.currency), ZCATEGORYUID: category && categoryIds.has(category) ? category : null,
        ZDO_TYPE: tx.type === "transfer" ? direction ? "3" : "4" : tx.type === "adjustment" ? direction ? "8" : "7" : String(direction),
        ZAMOUNT: toMajor(base), ZAMOUNTACCOUNT: toMajor(native), ZAMOUNTSUB: toMajor(native),
        ZCONTENT: merchants.get(tx.merchantId ?? "") ?? tx.notes ?? "", ZMEMO: tx.notes,
        ZDATE: (new Date(tx.occurredAt).getTime() - CORE_DATA_EPOCH) / 1000, ZTXDATESTR: localDay(tx.occurredAt, data.timezone),
        ZTOASSETUID: other?.accountId ?? null, ZTXUIDTRANS: tx.transferGroupId,
        // Preserve Luy-only details without guessing at undocumented target fields.
        ZZDATA2: JSON.stringify({ source: "luy-manager", transaction: tx, splits: splits.get(tx.id) ?? [], tenders: tenders.get(tx.id) ?? [] }),
      });
    }
    insert("Etc", { ZDATATYPE: 273, ZDATAYTYPEKEY: "ios_db_version", ZDATA: "2194", ZUID: randomUUID().toUpperCase() });
    insert("Etc", { ZDATATYPE: 20181211, ZDATAYTYPEKEY: "init_db_version", ZDATA: "2.9.1", ZUID: randomUUID().toUpperCase() });
    for (const entity of template.entities) db.prepare("INSERT INTO Z_PRIMARYKEY VALUES (?, ?, 0, ?)").run(entity.id, entity.name, counts.get(`Z${entity.name.toUpperCase()}`)!);
    db.prepare("INSERT INTO Z_METADATA VALUES (?, ?, ?)").run(template.metadataVersion, randomUUID().toUpperCase(), Buffer.from(template.metadataPlist, "base64"));
    db.prepare("INSERT INTO Z_MODELCACHE VALUES (?)").run(Buffer.from(template.modelCache, "base64"));
    db.exec("COMMIT; VACUUM;");
    db.close(); db = undefined;
    return new Uint8Array(await readFile(path));
  } finally {
    db?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
