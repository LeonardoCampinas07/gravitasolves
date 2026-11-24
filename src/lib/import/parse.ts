/** Leitura de CSV e XLSX para { headers, rows }. */
import Papa from "papaparse";

export interface ParsedSheet { headers: string[]; rows: Record<string, unknown>[] }
export const MAX_ROWS = 100_000;

export async function parseSpreadsheet(buf: Buffer, filename: string): Promise<ParsedSheet> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return parseCsv(decodeText(buf));
  if (ext === "xlsx") return parseXlsx(buf);
  if (ext === "xls") throw new Error("Formato .xls (Excel 97-2003) não suportado. Salve como .xlsx ou .csv.");
  throw new Error("Envie um arquivo .csv ou .xlsx.");
}

/** UTF-8 com fallback para Windows-1252 (CSV exportado pelo Excel em português). */
export function decodeText(buf: Buffer): string {
  let text = buf.toString("utf8");
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
  return text.replace(/^﻿/, "");
}

export function parseCsv(text: string): ParsedSheet {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim(), delimitersToGuess: [";", ",", "\t", "|"],
  });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  if (!headers.length) throw new Error("Não encontramos o cabeçalho da planilha (primeira linha com os nomes das colunas).");
  if (res.data.length > MAX_ROWS) throw new Error(`A planilha tem mais de ${MAX_ROWS.toLocaleString("pt-BR")} linhas. Divida em arquivos menores.`);
  return { headers, rows: res.data };
}

async function parseXlsx(buf: Buffer): Promise<ParsedSheet> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) throw new Error("A planilha está vazia.");
  if (ws.actualRowCount > MAX_ROWS + 1) throw new Error(`A planilha tem mais de ${MAX_ROWS.toLocaleString("pt-BR")} linhas.`);
  let headerRow = 0;
  const headers: string[] = [];
  ws.eachRow((row, idx) => {
    if (headerRow) return;
    const vals = (row.values as unknown[]).slice(1).map(cellValue);
    if (vals.filter((v) => v !== null && String(v).trim()).length >= 1) {
      headerRow = idx;
      vals.forEach((v, i) => { headers[i] = v === null ? "" : String(v).trim(); });
    }
  });
  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, idx) => {
    if (idx <= headerRow) return;
    const vals = (row.values as unknown[]).slice(1).map(cellValue);
    if (vals.every((v) => v === null || String(v).trim() === "")) return;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { if (h) obj[h] = vals[i] ?? null; });
    rows.push(obj);
  });
  return { headers: headers.filter(Boolean), rows };
}

function cellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result); // fórmula
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if ("text" in o) return o.text; // hyperlink
    if ("error" in o) return null;
  }
  return v;
}
