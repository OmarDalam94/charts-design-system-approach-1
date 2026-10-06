/**
 * Raw cell parsing. Missing, invalid and zero stay distinct: nothing here
 * turns an unreadable value into 0.
 */

export type RawCell = string | number | boolean | null | undefined;
export type RawRow = Record<string, RawCell>;

export type ColumnType = "number" | "string" | "boolean" | "datetime" | "geometry";

export type DatasetColumn = { name: string; label: string; type: ColumnType };

export type ChartDataset = {
  id: string;
  name: string;
  columns: DatasetColumn[];
  rows: RawRow[];
  /** Present only for ML-prediction sources; enables "Y-axis values (ML only)". */
  ml?: { actual: string; predicted: string };
};

export type NumberParse =
  | { status: "ok"; value: number }
  | { status: "missing"; value: null }
  | { status: "invalid"; value: null; raw: string };

const NUMERIC_TEXT = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/;

export function parseNumber(v: RawCell): NumberParse {
  if (v === null || v === undefined) return { status: "missing", value: null };
  if (typeof v === "number") {
    return Number.isFinite(v) ? { status: "ok", value: v } : { status: "invalid", value: null, raw: String(v) };
  }
  if (typeof v === "boolean") return { status: "invalid", value: null, raw: String(v) };
  const s = v.trim();
  if (s === "") return { status: "missing", value: null };
  if (!NUMERIC_TEXT.test(s) || s === "-" || s === "+" || s === ".") {
    return { status: "invalid", value: null, raw: v };
  }
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? { status: "ok", value: n } : { status: "invalid", value: null, raw: v };
}

export function toNumberOrNull(v: RawCell): number | null {
  return parseNumber(v).value;
}

/**
 * Timestamps are read in UTC. Accepts ISO dates (`2024-03`, `2024-03-05`,
 * `2024-03-05T10:00:00Z`) and epoch milliseconds.
 */
export function parseTime(v: RawCell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  const s = v.trim();
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 1);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const withZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
    const t = Date.parse(withZone);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export function cellText(v: RawCell): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function columnOf(dataset: ChartDataset, name: string): DatasetColumn | undefined {
  return dataset.columns.find((c) => c.name === name);
}

export function columnLabelOf(dataset: ChartDataset, name: string): string {
  return columnOf(dataset, name)?.label ?? name;
}

export type AggregationMode = "raw" | "sum" | "average" | "min" | "max" | "count";

export function aggregationFromLabel(label: string): AggregationMode {
  const m = label.trim().toLowerCase();
  if (m.startsWith("sum")) return "sum";
  if (m.startsWith("average") || m.startsWith("avg")) return "average";
  if (m.startsWith("min")) return "min";
  if (m.startsWith("max")) return "max";
  if (m.startsWith("count")) return "count";
  return "raw";
}

/**
 * Aggregate one group. Nulls are skipped; a group with no valid values is
 * null, not 0. Count counts rows in the group, valid or not.
 */
export function aggregate(values: (number | null)[], mode: AggregationMode, rowCount = values.length): number | null {
  if (mode === "count") return rowCount;
  const valid = values.filter((v): v is number => v !== null);
  if (!valid.length) return null;
  switch (mode) {
    case "sum":
      return valid.reduce((a, b) => a + b, 0);
    case "average":
      return valid.reduce((a, b) => a + b, 0) / valid.length;
    case "min":
      return Math.min(...valid);
    case "max":
      return Math.max(...valid);
    case "raw":
    default:
      return valid[0];
  }
}

/** Whether a part-to-whole percentage has a valid interpretation for this aggregation. */
export function isAdditive(mode: AggregationMode): boolean {
  return mode === "raw" || mode === "sum" || mode === "count";
}
