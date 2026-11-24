/** Célula CSV segura: aspas escapadas e proteção contra injeção de fórmula no Excel. */
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com ";" (padrão do Excel em pt-BR) e BOM para acentos. */
export function toCsv(rows: unknown[][]) {
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
