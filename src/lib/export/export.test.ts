import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { money } from "@/lib/money";
import { exportFixture } from "./fixtures";
import { decimalAmount, exportBalances } from "./ledger";
import { buildMmbak } from "./mmbak";
import { buildXlsx } from "./xlsx";

async function database(bytes: Uint8Array, check: (db: DatabaseSync) => void) {
  const folder = await mkdtemp(join(tmpdir(), "luy-export-test-"));
  let db: DatabaseSync | undefined;
  try {
    const path = join(folder, "backup.mmbak");
    await writeFile(path, bytes); db = new DatabaseSync(path, { readOnly: true }); check(db);
  } finally { db?.close(); await rm(folder, { recursive: true, force: true }); }
}

describe("account export precision", () => {
  test("balances reconcile without mixing currencies", () => {
    const balances = exportBalances(exportFixture());
    expect(balances.get("usd")).toEqual(money(8600, "USD"));
    expect(balances.get("khr")).toEqual(money(46000, "KHR"));
    expect(decimalAmount(money(-1, "USD"))).toBe("-0.01");
    expect(decimalAmount(money(12000, "KHR"))).toBe("12000");
    expect(decimalAmount(money(Number.MAX_SAFE_INTEGER, "USD"))).toBe("90071992547409.91");
  });
  test("missing accounts and mismatched currencies refuse an incomplete export", () => {
    const data = exportFixture(); data.accounts.pop();
    expect(() => exportBalances(data)).toThrow("unavailable account");
    data.accounts[0].currency = "KHR";
    expect(() => exportBalances(data)).toThrow("Cannot add");
  });
});

describe("Money Manager backup", () => {
  test("is a complete SQLite/Core Data store with native amounts, opening entries and paired transfers", async () => {
    const data = exportFixture(); data.accounts[1].isActive = false;
    const bytes = await buildMmbak(data);
    expect(strFromU8(bytes.subarray(0, 15))).toBe("SQLite format 3");
    await database(bytes, (db) => {
      expect(db.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
      expect(db.prepare("SELECT count(*) n FROM Z_MODELCACHE").get()).toMatchObject({ n: 1 });
      expect(db.prepare("SELECT ZPOINT FROM ZCURRENCY WHERE ZISO='KHR'").get()).toMatchObject({ ZPOINT: 0 });
      const tx = db.prepare("SELECT * FROM ZINOUTCOME WHERE ZUID='riel'").get()!;
      expect(tx).toMatchObject({ ZAMOUNT: 1.5, ZAMOUNTACCOUNT: 6000, ZAMOUNTSUB: 6000, ZDO_TYPE: "1", ZCURRENCYUID: "USD_KHR", ZTXDATESTR: "2026-10-10" });
      expect(tx.ZDATE).toBe((Date.parse(data.transactions[1].occurredAt) - Date.UTC(2001, 0, 1)) / 1000);
      expect(db.prepare("SELECT ZDO_TYPE,ZTOASSETUID,ZTXUIDTRANS FROM ZINOUTCOME WHERE ZUID='out'").get()).toMatchObject({ ZDO_TYPE: "3", ZTOASSETUID: "khr", ZTXUIDTRANS: "pair" });
      expect(db.prepare("SELECT ZDO_TYPE,ZTOASSETUID,ZTXUIDTRANS FROM ZINOUTCOME WHERE ZUID='in'").get()).toMatchObject({ ZDO_TYPE: "4", ZTOASSETUID: "usd", ZTXUIDTRANS: "pair" });
      expect(db.prepare("SELECT count(*) n FROM ZINOUTCOME").get()).toMatchObject({ n: 7 });
      for (const row of db.prepare("SELECT ZASSETUID, SUM(CASE WHEN ZDO_TYPE IN ('1','3','8') THEN -ZAMOUNTACCOUNT ELSE ZAMOUNTACCOUNT END) balance FROM ZINOUTCOME GROUP BY ZASSETUID").all()) {
        expect(row.balance).toBe(row.ZASSETUID === "usd" ? 86 : 46000);
      }
      const details = JSON.parse(db.prepare("SELECT ZZDATA2 FROM ZINOUTCOME WHERE ZUID='expense'").get()!.ZZDATA2 as string);
      expect(details.splits).toEqual(data.splits); expect(details.tenders).toEqual(data.tenders);
      expect(db.prepare("SELECT Z_MAX FROM Z_PRIMARYKEY WHERE Z_NAME='InOutCome'").get()).toMatchObject({ Z_MAX: 7 });
      expect(db.prepare("SELECT ZMEMO,ZISDEL FROM ZASSET WHERE ZUID='khr'").get()).toMatchObject({ ZISDEL: 0, ZMEMO: "Closed in Luy Manager" });
    });
  });
  test("supports a KHR base and includes empty model tables for restoration", async () => {
    const data = exportFixture(); data.baseCurrency = "KHR"; data.transactions = [];
    await database(await buildMmbak(data), (db) => {
      expect(db.prepare("SELECT ZISMAINCURRENCY,ZRATE FROM ZCURRENCY WHERE ZISO='USD'").get()).toMatchObject({ ZISMAINCURRENCY: 0, ZRATE: 4000 });
      expect(db.prepare("SELECT ZISMAINCURRENCY,ZRATE FROM ZCURRENCY WHERE ZISO='KHR'").get()).toMatchObject({ ZISMAINCURRENCY: 1, ZRATE: 1 });
      expect(db.prepare("SELECT count(*) n FROM ZPHOTO").get()).toMatchObject({ n: 0 });
      expect(db.prepare("SELECT count(*) n FROM ZMESSAGEMACRO2").get()).toMatchObject({ n: 0 });
    });
  });
  test("rejects an orphan transfer rather than dropping its other leg", async () => {
    const data = exportFixture(); data.transactions = data.transactions.filter((t) => t.id !== "in");
    await expect(buildMmbak(data)).rejects.toThrow("incomplete");
  });
  test("preserves settled base amounts and treats names as bound data", async () => {
    const data = exportFixture(); data.accounts[0].name = "Wallet'); DROP TABLE ZASSET; --";
    Object.assign(data.transactions[1], { baseAmount: -149, baseCurrency: "USD", exchangeRate: 4026 });
    await database(await buildMmbak(data), (db) => {
      expect(db.prepare("SELECT ZAMOUNT FROM ZINOUTCOME WHERE ZUID='riel'").get()).toMatchObject({ ZAMOUNT: 1.49 });
      expect(db.prepare("SELECT ZNICNAME FROM ZASSET WHERE ZUID='usd'").get()).toMatchObject({ ZNICNAME: data.accounts[0].name });
    });
  });
});

describe("Excel workbook", () => {
  test("contains all six sheets, signed numeric native amounts, and exact minor units", () => {
    const files = unzipSync(buildXlsx(exportFixture()));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    for (const name of ["Accounts", "Transactions", "Categories", "Splits", "Payments", "Read me"]) expect(workbook).toContain(`name="${name}"`);
    const tx = strFromU8(files["xl/worksheets/sheet2.xml"]);
    expect(tx).toContain('<c r="F2" s="2"><v>-5.25</v></c>');
    expect(tx).toContain('<c r="F3" s="3"><v>-6000</v></c>');
    expect(tx).toContain('<c r="H3" t="inlineStr"><is><t xml:space="preserve">-6000</t></is></c>');
    expect(tx).toContain("Coffee &amp; cake &lt;3");
    expect(tx).toContain('state="frozen"');
  });
  test("user text cannot become formulas and large amounts never lose a minor unit", () => {
    const data = exportFixture(); data.accounts[0].name = '=HYPERLINK("https://example.invalid")';
    data.accounts[0].openingBalance = Number.MAX_SAFE_INTEGER;
    data.transactions = [];
    const sheet = strFromU8(unzipSync(buildXlsx(data))["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("=HYPERLINK(&quot;https://example.invalid&quot;)");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">90071992547409.91');
    expect(sheet).toContain("9007199254740991");
  });
});
