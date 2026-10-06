/**
 * Parses user-edited fixture data for the Lab's Data tab. Accepts CSV, a JSON
 * array of row objects, or a `{ columns, rows }` dataset. Cells keep their raw
 * text: invalid numbers stay invalid so the chart reports them instead of
 * reading them as zero.
 */

import { parseNumber, parseTime, type ChartDataset, type ColumnType, type DatasetColumn, type RawCell, type RawRow } from "../charts/data/values";

export type DataParse = { ok: true; dataset: ChartDataset; notes: string[] } | { ok: false; error: string };

const MAX_ROWS = 50000;

function inferType(values: RawCell[]): ColumnType {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!present.length) return "string";
  if (present.every((v) => typeof v === "boolean" || v === "true" || v === "false")) return "boolean";
  const numeric = present.filter((v) => parseNumber(v).status === "ok").length;
  if (numeric / present.length >= 0.6) return "number";
  if (present.every((v) => typeof v === "string" && parseTime(v) !== null)) return "datetime";
  return "string";
}

function columnsFromRows(rows: RawRow[]): DatasetColumn[] {
  const names: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!names.includes(k)) names.push(k);
  return names.map((name) => ({ name, label: name, type: inferType(rows.map((r) => r[name])) }));
}

/** RFC 4180-style CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => !(r.length === 1 && r[0] === ""));
}

function fromCsv(text: string): DataParse {
  const table = parseCsv(text);
  if (!table.length) return { ok: false, error: "The CSV has no header row." };
  const header = table[0].map((h) => h.trim());
  const notes: string[] = [];
  const seen = new Map<string, number>();
  const names = header.map((h, i) => {
    const base = h || `column_${i + 1}`;
    if (!h) notes.push(`Column ${i + 1} has no header; named “${base}”.`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    if (n > 1) notes.push(`Duplicate header “${base}” renamed to “${base}_${n}”.`);
    return n > 1 ? `${base}_${n}` : base;
  });
  const rows: RawRow[] = table.slice(1).map((cells, ri) => {
    if (cells.length !== names.length) notes.push(`Row ${ri + 2} has ${cells.length} cells; expected ${names.length}.`);
    return Object.fromEntries(names.map((n, i) => [n, cells[i] === undefined || cells[i] === "" ? null : cells[i]]));
  });
  if (rows.length > MAX_ROWS) return { ok: false, error: `The data has ${rows.length} rows; the Lab editor accepts up to ${MAX_ROWS}.` };
  return { ok: true, dataset: { id: "custom", name: "Edited data", columns: columnsFromRows(rows).map((c, i) => ({ ...c, label: header[i] || c.name })), rows }, notes: notes.slice(0, 8) };
}

function isCell(v: unknown): v is RawCell {
  return v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v);
}

function fromJson(raw: unknown): DataParse {
  let rows: unknown;
  let columns: DatasetColumn[] | null = null;
  let ml: ChartDataset["ml"];
  if (Array.isArray(raw)) rows = raw;
  else if (raw && typeof raw === "object" && Array.isArray((raw as { rows?: unknown }).rows)) {
    const d = raw as { rows: unknown[]; columns?: unknown; ml?: ChartDataset["ml"] };
    rows = d.rows;
    ml = d.ml;
    if (d.columns !== undefined) {
      if (!Array.isArray(d.columns)) return { ok: false, error: "columns must be an array of { name, label, type }." };
      const types: ColumnType[] = ["number", "string", "boolean", "datetime", "geometry"];
      const bad = d.columns.findIndex((c) => !c || typeof c.name !== "string" || (c.type !== undefined && !types.includes(c.type)));
      if (bad >= 0) return { ok: false, error: `Column ${bad + 1} needs a string name and a type of ${types.join(", ")}.` };
      columns = d.columns.map((c) => ({ name: c.name, label: typeof c.label === "string" ? c.label : c.name, type: c.type ?? "string" }));
    }
  } else return { ok: false, error: "Expected an array of row objects or { columns, rows }." };
  const list = rows as unknown[];
  if (list.length > MAX_ROWS) return { ok: false, error: `The data has ${list.length} rows; the Lab editor accepts up to ${MAX_ROWS}.` };
  const badRow = list.findIndex((r) => !r || typeof r !== "object" || Array.isArray(r) || !Object.values(r as object).every(isCell));
  if (badRow >= 0) return { ok: false, error: `Row ${badRow + 1} must be an object of strings, numbers, booleans or null.` };
  const typed = list as RawRow[];
  return { ok: true, dataset: { id: "custom", name: "Edited data", columns: columns ?? columnsFromRows(typed), rows: typed, ml }, notes: [] };
}

export function parseDatasetText(text: string): DataParse {
  const t = text.trim();
  if (!t) return { ok: false, error: "The data input is empty. Enter CSV or JSON; use [] for an intentionally empty result." };
  if (t.startsWith("[") || t.startsWith("{")) {
    try {
      return fromJson(JSON.parse(t));
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
    }
  }
  return fromCsv(t);
}

export function datasetToCsv(ds: ChartDataset, limit = Infinity): string {
  const esc = (v: RawCell) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ds.columns.map((c) => esc(c.name)).join(",");
  const body = ds.rows.slice(0, limit).map((r) => ds.columns.map((c) => esc(r[c.name])).join(","));
  return [head, ...body].join("\n");
}
