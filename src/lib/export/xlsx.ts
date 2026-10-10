import { strToU8, zipSync } from "fflate";
import { money, type Money } from "@/lib/money";
import { decimalAmount, exportBalances } from "./ledger";
import type { AccountExport } from "./types";

interface AmountCell { decimal: string; style: number }
type Cell = string | number | boolean | null | AmountCell;
interface Sheet { name: string; headers: string[]; rows: Cell[][] }

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function amountCell(amount: Money): AmountCell {
  return { decimal: decimalAmount(amount), style: amount.currency === "USD" ? 2 : 3 };
}

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function cell(value: Cell, address: string, header = false): string {
  const style = header ? ' s="1"' : "";
  if (value === null) return `<c r="${address}"/>`;
  if (typeof value === "object") {
    const digits = value.decimal.replace(/[-.]/g, "").replace(/^0+/, "");
    if (digits.length <= 15) return `<c r="${address}" s="${value.style}"><v>${value.decimal}</v></c>`;
    return cell(value.decimal, address);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("An export value is invalid.");
    return `<c r="${address}"${style}><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") return `<c r="${address}" t="b"><v>${value ? 1 : 0}</v></c>`;
  // Inline strings, including leading '=' characters, never become formulas.
  return `<c r="${address}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function sheetXml(sheet: Sheet): string {
  if (sheet.rows.length > 1_048_575) throw new Error("This ledger exceeds Excel's row limit.");
  const rows = [sheet.headers, ...sheet.rows].map((row, index) => `<row r="${index + 1}">${row.map((v, c) => cell(v, `${columnName(c)}${index + 1}`, index === 0)).join("")}</row>`).join("");
  const last = `${columnName(sheet.headers.length - 1)}${sheet.rows.length + 1}`;
  return `${XML}<worksheet xmlns="${NS}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="${sheet.headers.length}" width="24" customWidth="1"/></cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}

export function buildXlsx(data: AccountExport): Uint8Array {
  const balances = exportBalances(data);
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const categories = new Map(data.categories.map((c) => [c.id, c.name]));
  const merchants = new Map(data.merchants.map((m) => [m.id, m.name]));
  const sheets: Sheet[] = [
    { name: "Accounts", headers: ["Account ID", "Account", "Institution", "Type", "Currency", "Opening balance", "Opening minor units", "Current balance", "Current minor units", "Active", "Include in net worth"], rows: data.accounts.map((a) => [a.id, a.name, a.institution, a.type, a.currency, amountCell(money(a.openingBalance, a.currency)), String(a.openingBalance), amountCell(balances.get(a.id)!), String(balances.get(a.id)!.minor), a.isActive, a.includeInNetWorth]) },
    { name: "Transactions", headers: ["Transaction ID", "Occurred at (ISO)", "Account", "Account ID", "Type", "Amount", "Currency", "Amount minor units", "Category", "Merchant", "Notes", "Location", "Transfer group ID", "Exchange rate", "Base amount", "Base currency", "Base minor units", "Source", "Pending"], rows: data.transactions.map((t) => [t.id, t.occurredAt, accounts.get(t.accountId)!.name, t.accountId, t.type, amountCell(money(t.amount, t.currency)), t.currency, String(t.amount), categories.get(t.categoryId ?? "") ?? null, merchants.get(t.merchantId ?? "") ?? null, t.notes, t.location, t.transferGroupId, t.exchangeRate, t.baseAmount !== null && t.baseCurrency ? amountCell(money(t.baseAmount, t.baseCurrency)) : null, t.baseCurrency, t.baseAmount !== null ? String(t.baseAmount) : null, t.createdVia, t.isPending]) },
    { name: "Categories", headers: ["Category ID", "Category", "Parent category ID", "Applies to"], rows: data.categories.map((c) => [c.id, c.name, c.parentId, c.appliesTo.join(", ")]) },
    { name: "Splits", headers: ["Split ID", "Transaction ID", "Category", "Category ID", "Amount", "Currency", "Amount minor units", "Notes"], rows: data.splits.map((s) => [s.id, s.transactionId, categories.get(s.categoryId ?? "") ?? null, s.categoryId, amountCell(money(s.amount, s.currency)), s.currency, String(s.amount), s.notes]) },
    { name: "Payments", headers: ["Payment ID", "Transaction ID", "Account ID", "Amount", "Currency", "Amount minor units", "Exchange rate"], rows: data.tenders.map((t) => [t.id, t.transactionId, t.accountId, amountCell(money(t.amount, t.currency)), t.currency, String(t.amount), t.exchangeRate]) },
    { name: "Read me", headers: ["Field", "Value"], rows: [
      ["Exported at", data.exportedAt], ["Timezone", data.timezone],
      ["Scope", "All accounts, including closed accounts, and all non-deleted transactions."],
      ["Amounts", "USD uses cents; KHR uses whole riel. Native currencies are never summed together."],
      ["Precision", "Minor units are exact text. Amounts over Excel's 15-digit precision are also text."],
      ["Transfers", "Both signed legs share the same transfer group ID. Exclude transfers from income and expense."],
      ["Balances", "Opening balance plus exported transactions. Pending entries follow the app's balance rules."],
    ] },
  ];
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, value: string) => { files[name] = strToU8(value); };
  add("[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  add("_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add("xl/workbook.xml", `${XML}<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  add("xl/_rels/workbook.xml.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add("xl/styles.xml", `${XML}<styleSheet xmlns="${NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]-&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0&quot;៛&quot;;[Red]-#,##0&quot;៛&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zipSync(files, { level: 6 });
}
