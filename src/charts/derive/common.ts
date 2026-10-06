import type { Opt } from "../../chartModel";
import { chartAsset, legendPositionsFor, type ChartAssetDef } from "../assets";
import {
  aggregate,
  aggregationFromLabel,
  cellText,
  columnLabelOf,
  columnOf,
  parseTime,
  toNumberOrNull,
  type AggregationMode,
  type ChartDataset,
  type RawRow,
} from "../data/values";
import { formatKpiValue, notationFromLabel, numberFormatter, type Notation, type NumberFormatter } from "../format";
import { evaluateExpression } from "../expr";
import { SettingsReader, type Adaptation, type Config, type ConflictNote } from "../settings";
import type {
  BadgeModel,
  DataTableModel,
  FlagEvaluation,
  HeaderModel,
  Issue,
  KpiModel,
  LegendItem,
  LegendModel,
  Tone,
  TooltipConfig,
} from "../model";

/** Lab-only product extensions. None are existing catalog properties. */
export type ChartExtensions = {
  /** Stack multi-series areas (extension: catalog Area is overlay only). */
  stackedArea?: boolean;
};

export type ChartInput = {
  visualId: string;
  config: Config;
  dataset: ChartDataset;
  title?: string;
  description?: string;
  insight?: string;
  /** Host-supplied lifecycle state. */
  status?: "ready" | "loading" | "error" | "stale" | "partial";
  statusMessage?: string;
  /**
   * Builder only: columns used for unmapped required fields. Every use is
   * disclosed as an adaptation; the Lab never passes suggestions.
   */
  suggestedMappings?: Record<string, string>;
  /** Record that flag conditions are evaluated against. */
  assetContext?: Record<string, unknown>;
  extensions?: ChartExtensions;
};

export class DeriveContext {
  readonly input: ChartInput;
  readonly asset: ChartAssetDef;
  readonly s: SettingsReader;
  readonly rows: RawRow[];
  readonly issues: Issue[] = [];
  readonly adaptations: Adaptation[] = [];
  readonly conflicts: ConflictNote[] = [];
  readonly notation: Notation;
  readonly aggregation: AggregationMode;
  readonly suggested: string[] = [];

  constructor(input: ChartInput) {
    this.input = input;
    this.asset = chartAsset(input.visualId);
    this.s = new SettingsReader(input.visualId, input.config);
    this.rows = input.dataset.rows;
    this.notation = notationFromLabel(this.s.str("Mapping", "Number notation"));
    this.aggregation = this.s.has("Mapping", "Aggregation") ? aggregationFromLabel(this.s.str("Mapping", "Aggregation")) : "raw";
  }

  issue(id: string, severity: Issue["severity"], message: string, settings?: string[]) {
    if (!this.issues.some((i) => i.id === id)) this.issues.push({ id, severity, message, settings });
  }

  adapt(a: Adaptation) {
    if (!this.adaptations.some((x) => x.id === a.id)) this.adaptations.push(a);
  }

  /** Mapped column for a Mapping field, a disclosed suggestion, or "". */
  col(name: string): string {
    const mapped = this.s.column(name);
    if (mapped) {
      if (!columnOf(this.input.dataset, mapped)) {
        this.issue(`unknown-column:${name}`, "error", `${name} is mapped to “${mapped}”, which is not in the data source.`, [`Mapping::${name}`]);
        return "";
      }
      return mapped;
    }
    const suggestion = this.input.suggestedMappings?.[name];
    if (suggestion && columnOf(this.input.dataset, suggestion)) {
      if (!this.suggested.includes(name)) this.suggested.push(name);
      this.adapt({
        id: `suggested:${name}`,
        setting: `Mapping::${name}`,
        requested: "Unmapped",
        effective: columnLabelOf(this.input.dataset, suggestion),
        reason: `Preview uses a suggested column for ${name}; map it to save this choice.`,
      });
      return suggestion;
    }
    return "";
  }

  /**
   * Measure column after "Y-axis values (ML only)". Assets that draw one value per mark
   * cannot show actual and predicted side by side, so "Actual vs predicted" uses actual.
   */
  measure(name: string): string {
    return this.mlColumn(this.col(name));
  }

  /** Applies "Y-axis values (ML only)" to a measure column on ML-prediction sources. */
  mlColumn(mapped: string): string {
    const ml = this.input.dataset.ml;
    if (!ml || !this.s.has("Mapping", "Y-axis values (ML only)")) return mapped;
    const mode = this.s.str("Mapping", "Y-axis values (ML only)");
    if (mode.startsWith("Predicted")) return ml.predicted;
    if (mode.startsWith("Actual vs")) {
      this.adapt({
        id: "ml-single-measure",
        setting: "Mapping::Y-axis values (ML only)",
        requested: "Actual vs predicted",
        effective: "Actual only",
        reason: `${this.asset.label} shows one value per mark, so the predicted column is not drawn.`,
      });
    }
    return ml.actual;
  }

  /** Column chosen by a field control outside the Mapping group (KPI Display, Status badge). */
  colIn(group: string, name: string): string {
    const mapped = this.s.str(group, name);
    if (!mapped) {
      const key = `${group}::${name}`;
      const suggestion = this.input.suggestedMappings?.[key];
      if (!suggestion || !columnOf(this.input.dataset, suggestion)) return "";
      this.adapt({ id: `suggested:${key}`, setting: key, requested: "Unset", effective: columnLabelOf(this.input.dataset, suggestion), reason: `Preview uses a suggested column for ${name}; choose one to save it.` });
      return suggestion;
    }
    if (!columnOf(this.input.dataset, mapped)) {
      this.issue(`unknown-column:${group}:${name}`, "error", `${name} is set to “${mapped}”, which is not in the data source.`, [`${group}::${name}`]);
      return "";
    }
    return mapped;
  }

  label(column: string): string {
    return columnLabelOf(this.input.dataset, column);
  }

  formatter(extra?: { spec?: string; preset?: string; unit?: string }): NumberFormatter {
    return numberFormatter({ notation: this.notation, ...extra });
  }

  /** Required Mapping fields that the editor shows and that have no column. */
  missingRequired(skip: (o: Opt) => boolean = () => false): string[] {
    return this.s.fields
      .filter((o) => o.group === "Mapping" && o.level === "required" && (o.type === "field" || o.type === "multi"))
      .filter((o) => this.s.isVisible(o.group, o.name))
      .filter((o) => !skip(o))
      .filter((o) => {
        if (o.type === "multi") return this.s.list(o.group, o.name).length === 0;
        return !this.col(o.name);
      })
      .map((o) => o.name);
  }

  /** The row that represents "now": latest by time column when one is mapped, else last row. */
  latestRow(timeColumn?: string): { row: RawRow; index: number } | null {
    if (!this.rows.length) return null;
    if (timeColumn) {
      let best = -1;
      let bestT = -Infinity;
      this.rows.forEach((r, i) => {
        const t = parseTime(r[timeColumn]);
        if (t !== null && t >= bestT) {
          bestT = t;
          best = i;
        }
      });
      if (best >= 0) return { row: this.rows[best], index: best };
    }
    return { row: this.rows[this.rows.length - 1], index: this.rows.length - 1 };
  }
}

export type KpiCalc = "hidden" | "last" | "first" | "max" | "min" | "sum";

export function kpiCalcFromLabel(label: string): KpiCalc {
  const l = label.toLowerCase();
  if (l.startsWith("hidden")) return "hidden";
  if (l.startsWith("last")) return "last";
  if (l.startsWith("first")) return "first";
  if (l.startsWith("max")) return "max";
  if (l.startsWith("min")) return "min";
  return "sum";
}

export function calcValue(values: (number | null)[], calc: KpiCalc): { value: number | null; index: number } {
  const valid = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  if (!valid.length) return { value: null, index: -1 };
  switch (calc) {
    case "first":
      return { value: valid[0].v, index: valid[0].i };
    case "last":
      return { value: valid[valid.length - 1].v, index: valid[valid.length - 1].i };
    case "max": {
      const m = valid.reduce((a, b) => (b.v > a.v ? b : a));
      return { value: m.v, index: m.i };
    }
    case "min": {
      const m = valid.reduce((a, b) => (b.v < a.v ? b : a));
      return { value: m.v, index: m.i };
    }
    default:
      return { value: valid.reduce((a, b) => a + b.v, 0), index: -1 };
  }
}

/** Headline KPI for assets with the KPI Display group (story cards). */
export function storyKpi(ctx: DeriveContext, primaryColumn: string): KpiModel | null {
  const s = ctx.s;
  if (!s.has("KPI Display", "KPI value calculation")) return null;
  const calc = kpiCalcFromLabel(s.str("KPI Display", "KPI value calculation"));
  const manual = s.bool("KPI Display", "Manual override");
  const showMax = s.bool("KPI Display", "Show max value", true);
  const fmt = ctx.formatter();
  if (manual) {
    const raw = s.str("KPI Display", "Value");
    if (!raw) {
      if (calc === "hidden") return null;
      ctx.issue("kpi-manual-empty", "warning", "Manual override is on but Value is empty; the headline is hidden.", ["KPI Display::Value"]);
      return null;
    }
    const n = toNumberOrNull(raw);
    const unit = s.str("KPI Display", "Unit");
    const min = toNumberOrNull(s.str("KPI Display", "Min"));
    const max = toNumberOrNull(s.str("KPI Display", "Max"));
    return {
      value: n,
      text: n === null ? raw : fmt.format(n),
      unit: unit || undefined,
      maxText: showMax && max !== null ? `/ ${fmt.format(max)}` : undefined,
      rangeText: min !== null && max !== null ? `${fmt.format(min)}–${fmt.format(max)}` : undefined,
      comparison: null,
      source: "Manual override",
    };
  }
  if (calc === "hidden") return null;
  const fieldMapped = ctx.colIn("KPI Display", "KPI value field");
  const column = (fieldMapped ? ctx.mlColumn(fieldMapped) : "") || primaryColumn;
  if (!column) return null;
  const values = ctx.rows.map((r) => toNumberOrNull(r[column]));
  const { value, index } = calcValue(values, calc);
  const unitCol = ctx.colIn("KPI Display", "KPI unit field");
  const unitRow = index >= 0 ? ctx.rows[index] : ctx.rows.find((r) => cellText(r[unitCol]));
  const unit = unitCol && unitRow ? cellText(unitRow[unitCol]) : "";
  const maxCol = ctx.colIn("KPI Display", "KPI max value field");
  const minCol = ctx.colIn("KPI Display", "KPI min value field");
  const pick = (col: string) => {
    if (!col) return null;
    if (index >= 0) return toNumberOrNull(ctx.rows[index][col]);
    return calcValue(ctx.rows.map((r) => toNumberOrNull(r[col])), calc === "sum" ? "sum" : "max").value;
  };
  const max = pick(maxCol);
  const min = pick(minCol);
  return {
    value,
    text: fmt.format(value),
    unit: unit || undefined,
    maxText: showMax && max !== null ? `/ ${fmt.format(max)}` : undefined,
    rangeText: min !== null && max !== null ? `${fmt.format(min)}–${fmt.format(max)}` : undefined,
    comparison: null,
    source: `${s.str("KPI Display", "KPI value calculation")} of ${ctx.label(column)}${fieldMapped ? "" : " (primary measure)"}`,
  };
}

/** KPI Card / Legacy KPI headline. */
export function cardKpi(ctx: DeriveContext): { kpi: KpiModel; label: string } {
  const s = ctx.s;
  const column = ctx.measure("Value");
  const calc = kpiCalcFromLabel(s.str("Mapping", "Value calculation") || "First row");
  const kind = s.str("KPI card", "Value format") || "Number";
  const values = column ? ctx.rows.map((r) => toNumberOrNull(r[column])) : [];
  let { value, index } = calcValue(values, calc);
  if (column && ctx.aggregation !== "raw") {
    value = aggregate(values, ctx.aggregation, ctx.rows.length);
    index = -1;
    ctx.conflicts.push({
      settings: ["Mapping::Aggregation", "Mapping::Value calculation"],
      resolution: `Aggregation (${s.str("Mapping", "Aggregation")}) combines all ${ctx.rows.length} rows, so Value calculation is not used.`,
    });
  }
  const unitCol = ctx.col("Unit");
  const showUnit = s.bool("KPI card", "Show unit", true);
  const unitRow = index >= 0 ? ctx.rows[index] : ctx.rows[0];
  const unit = showUnit && unitCol && unitRow ? cellText(unitRow[unitCol]) : "";
  const pickSame = (col: string) => {
    if (!col) return null;
    if (index >= 0) return toNumberOrNull(ctx.rows[index][col]);
    return calcValue(ctx.rows.map((r) => toNumberOrNull(r[col])), calc).value;
  };
  const maxCol = ctx.col("Max value");
  const max = pickSame(maxCol);
  const cmpCol = ctx.col("Comparison value");
  const cmp = pickSame(cmpCol);
  const showCmp = s.bool("KPI card", "Show comparison vs last period", true);
  const showMax = s.bool("KPI card", "Show max value", true);
  let comparison: KpiModel["comparison"] = null;
  if (showCmp && cmpCol) {
    if (value === null || cmp === null) {
      ctx.issue("kpi-comparison-missing", "info", "Comparison is on, but the value or comparison value is missing for the selected row.", ["Mapping::Comparison value"]);
    } else {
      const delta = value - cmp;
      const pct = cmp !== 0 ? (delta / Math.abs(cmp)) * 100 : null;
      const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
      const body = formatKpiValue(Math.abs(delta), kind, ctx.notation);
      comparison = {
        delta,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        text: `${sign}${body}${pct !== null ? ` (${sign}${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%)` : ""}`,
        basis: `vs ${ctx.label(cmpCol)}`,
      };
    }
  } else if (showCmp && !cmpCol) {
    ctx.issue("kpi-comparison-unmapped", "info", "Show comparison is on, but Comparison value is not mapped, so no comparison is shown.", ["Mapping::Comparison value"]);
  }
  return {
    label: column ? ctx.label(column) : "Value",
    kpi: {
      value,
      text: formatKpiValue(value, kind, ctx.notation),
      unit: unit || undefined,
      maxText: showMax && max !== null ? `/ ${formatKpiValue(max, kind, ctx.notation)}` : undefined,
      comparison,
      source: `${ctx.aggregation !== "raw" && column ? s.str("Mapping", "Aggregation") : s.str("Mapping", "Value calculation") || "First row"} of ${column ? ctx.label(column) : "—"}`,
    },
  };
}

const POSITIVE = /\b(on track|good|healthy|ok|normal|up|online|available|pass|positive)\b/i;
const WARNING = /\b(watch|warn|warning|degraded|caution|moderate|stale)\b/i;
const NEGATIVE = /\b(at risk|risk|critical|bad|down|offline|fail|error|alert|negative|severe)\b/i;

export function toneForText(text: string): Tone {
  if (NEGATIVE.test(text)) return "negative";
  if (WARNING.test(text)) return "warning";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}

function toneForColor(hex: string): Tone {
  const h = hex.toLowerCase();
  if (h.startsWith("#f87171") || h.startsWith("#ef4444") || h.startsWith("#e85868")) return "negative";
  if (h.startsWith("#fbbf24") || h.startsWith("#f0a830")) return "warning";
  if (h.startsWith("#34d399") || h.startsWith("#59c96a")) return "positive";
  return "neutral";
}

export function statusBadge(ctx: DeriveContext, opts: { statusColumn?: string; valueText?: string; timeColumn?: string }): BadgeModel | null {
  const s = ctx.s;
  if (!s.has("Status badge", "Show status badge") || !s.bool("Status badge", "Show status badge", true)) return null;
  const source = s.str("Status badge", "Text source") || "Specific column";
  const latest = ctx.latestRow(opts.timeColumn);
  const row = latest?.row ?? {};
  let text = "";
  let sourceText = "";
  if (source.startsWith("Manual")) {
    text = s.str("Status badge", "Fallback");
    sourceText = "Manual text";
    if (!text) {
      ctx.issue("badge-manual-empty", "info", "Status badge uses Manual text, but the text is empty, so no badge is shown.", ["Status badge::Fallback"]);
      return null;
    }
  } else if (source.startsWith("Template")) {
    const template = s.str("Status badge", "Template") || "{status} · {value}";
    const statusCol = opts.statusColumn || ctx.colIn("Status badge", "Column");
    text = template.replace(/\{([^}]+)\}/g, (_, token: string) => {
      const t = token.trim();
      if (t === "status") return statusCol ? cellText(row[statusCol]) : "";
      if (t === "value") return opts.valueText ?? "";
      return cellText(row[t]);
    }).replace(/^\s*·\s*|\s*·\s*$/g, "").trim();
    sourceText = "Template";
    if (!text) {
      ctx.issue("badge-template-empty", "info", "The badge template resolved to empty text for the latest row, so no badge is shown.", ["Status badge::Template"]);
      return null;
    }
  } else {
    const col = ctx.colIn("Status badge", "Column") || opts.statusColumn || "";
    if (!col) {
      ctx.issue("badge-column-unset", "info", "Status badge is on but no badge Column is chosen, so no badge is shown.", ["Status badge::Column"]);
      return null;
    }
    text = cellText(row[col]);
    sourceText = `${ctx.label(col)} (latest row)`;
    if (!text) {
      ctx.issue("badge-empty", "info", `The latest row has no ${ctx.label(col)} value, so no badge is shown.`, ["Status badge::Column"]);
      return null;
    }
  }
  let tone = toneForText(text);
  let color: string | undefined;
  const colorCol = ctx.colIn("Status badge", "Color Source");
  if (colorCol) {
    const thresholds = s.rows("Status badge", "Color thresholds");
    const n = toNumberOrNull(row[colorCol]);
    const configured = thresholds.filter((t) => String(t.min).trim() !== "" || String(t.max).trim() !== "");
    if (n !== null) {
      if (!configured.length) {
        ctx.issue("badge-thresholds-unset", "info", "Color Source is numeric, but no threshold has a min or max, so the badge tone comes from its text.", ["Status badge::Color thresholds"]);
      }
      const hit = configured.find((t) => {
        const lo = String(t.min).trim() === "" ? -Infinity : Number(t.min);
        const hi = String(t.max).trim() === "" ? Infinity : Number(t.max);
        return n >= lo && n <= hi;
      });
      if (hit) {
        color = hit.color;
        tone = toneForColor(hit.color);
      }
    } else {
      const label = cellText(row[colorCol]).toLowerCase();
      const hit = thresholds.find((t) => (t.label ?? "").toLowerCase() === label);
      if (hit) {
        color = hit.color;
        tone = toneForColor(hit.color);
      }
    }
  }
  return { text, tone, color, source: sourceText };
}

export function insightText(ctx: DeriveContext, timeColumn?: string): string | undefined {
  const s = ctx.s;
  if (!s.has("Layout & visibility", "Show insight") || !s.bool("Layout & visibility", "Show insight", true)) return undefined;
  const col = s.column("Insight field");
  if (col) {
    const latest = ctx.latestRow(timeColumn);
    const text = latest ? cellText(latest.row[col]).trim() : "";
    if (text) return text;
  }
  return ctx.input.insight?.trim() || undefined;
}

type FlagValue = {
  label?: string;
  conditionJoin?: string;
  conditions?: { propertyMode?: string; property?: string; operator?: string; valueMode?: string; value?: string }[];
  tooltipMode?: string;
  tooltipInsight?: string;
};

function evalCondition(op: string, actual: unknown, expected: string): boolean {
  const present = actual !== undefined && actual !== null;
  const text = present ? String(actual) : "";
  const ci = op.includes("case insensitive");
  const a = ci ? text.toLowerCase() : text;
  const e = ci ? expected.toLowerCase() : expected;
  const n = Number(actual);
  const en = Number(expected);
  const base = op.replace(" (case insensitive)", "");
  switch (base) {
    case "exists":
      return present;
    case "does not exist":
      return !present;
    case "is empty":
      return !present || text === "";
    case "is not empty":
      return present && text !== "";
    case "is equal to":
      return a === e;
    case "is not equal to":
      return a !== e;
    case "contains":
      return a.includes(e);
    case "does not contain":
      return !a.includes(e);
    case "starts with":
      return a.startsWith(e);
    case "does not start with":
      return !a.startsWith(e);
    case "ends with":
      return a.endsWith(e);
    case "does not end with":
      return !a.endsWith(e);
    case "matches regex":
    case "does not match regex": {
      try {
        const m = new RegExp(expected, ci ? "i" : "").test(text);
        return base === "matches regex" ? m : !m;
      } catch {
        return false;
      }
    }
    case "is greater than":
    case "is after":
      return Number.isFinite(n) && n > en;
    case "is less than":
    case "is before":
      return Number.isFinite(n) && n < en;
    case "is greater than or equal to":
    case "is after or equal to":
      return Number.isFinite(n) && n >= en;
    case "is less than or equal to":
    case "is before or equal to":
      return Number.isFinite(n) && n <= en;
    case "is true":
      return actual === true || text === "true";
    case "is false":
      return actual === false || text === "false";
    default:
      return false;
  }
}

/**
 * Flags evaluate against the host's asset context record. Conditions whose
 * property (or any name in an expression) is missing from the context cannot pass;
 * an expression that does not parse keeps the flag hidden and raises a data note.
 */
export function evaluateFlags(ctx: DeriveContext): FlagEvaluation[] {
  const out: FlagEvaluation[] = [];
  const context = ctx.input.assetContext ?? {};
  for (const [name, kind] of [
    ["Positive Flag", "positive"],
    ["Neutral Flag", "neutral"],
    ["Negative Flag", "negative"],
  ] as const) {
    if (!ctx.s.has("Flags", name)) continue;
    const raw = ctx.s.raw("Flags", name) as FlagValue | boolean | undefined;
    if (!raw || typeof raw !== "object") continue;
    const label = raw.label?.trim() || name.replace(" Flag", "");
    const conditions = raw.conditions ?? [];
    let tooltip = raw.tooltipInsight?.trim() || undefined;
    if (tooltip && raw.tooltipMode === "expression") {
      const t = evaluateExpression(tooltip, context);
      if (!t.ok) ctx.issue(`flag-tooltip:${name}`, "warning", `${name} tooltip expression: ${t.error}.`, [`Flags::${name}`]);
      tooltip = t.ok && t.value !== null ? String(t.value) : undefined;
    }
    if (!conditions.length) {
      out.push({ kind, label, tooltip, shown: true, reason: "No conditions: always shown." });
      continue;
    }
    const missing = new Set<string>();
    const errors: string[] = [];
    const resolve = (mode: string | undefined, text: string, asProperty: boolean): unknown => {
      if (mode === "expression") {
        const r = evaluateExpression(text, context);
        if (r.ok) return r.value;
        if (r.missing) r.missing.forEach((m) => missing.add(m));
        else errors.push(`“${text}”: ${r.error}`);
        return undefined;
      }
      if (!asProperty) return text;
      if (text && !(text in context)) missing.add(text);
      return text ? context[text] : undefined;
    };
    const results = conditions.map((c) => {
      const actual = resolve(c.propertyMode, c.property ?? "", true);
      const expected = resolve(c.valueMode, c.value ?? "", false);
      return evalCondition(c.operator ?? "", actual, expected === undefined || expected === null ? "" : String(expected));
    });
    for (const e of errors) ctx.issue(`flag-expr:${name}:${e}`, "warning", `${name}: expression ${e}.`, [`Flags::${name}`]);
    const any = (raw.conditionJoin ?? "AND").toUpperCase().startsWith("OR");
    const pass = !errors.length && (any ? results.some(Boolean) : results.every(Boolean));
    const miss = [...missing];
    out.push({
      kind,
      label,
      tooltip,
      shown: pass,
      reason: pass
        ? `${any ? "A condition" : "All conditions"} matched.`
        : errors.length
          ? `Not shown: ${errors[0]}.`
          : miss.length
            ? `Not shown: ${miss.join(", ")} ${miss.length === 1 ? "is" : "are"} not in the asset context.`
            : "Not shown: conditions did not match.",
    });
  }
  return out;
}

export function headerFor(ctx: DeriveContext, extra: { kpi: KpiModel | null; badge: BadgeModel | null; flags: FlagEvaluation[] }): HeaderModel {
  const s = ctx.s;
  const icon = s.str("Layout & visibility", "Chart header icon") || undefined;
  const info = s.bool("Layout & visibility", "Show header info icon") ? ctx.input.description?.trim() || "No description provided." : undefined;
  return {
    title: ctx.input.title?.trim() || ctx.asset.label,
    description: ctx.input.description?.trim() || undefined,
    icon,
    info,
    kpi: extra.kpi,
    badge: extra.badge,
    flags: extra.flags.filter((f) => f.shown).map(({ kind, label, tooltip }) => ({ kind, label, tooltip })),
  };
}

export function tooltipConfig(ctx: DeriveContext, unit?: string): TooltipConfig {
  const s = ctx.s;
  const enabled = s.has("Tooltips", "Show tooltips") ? s.bool("Tooltips", "Show tooltips", true) : true;
  const raw = s.str("Tooltips", "Tooltip format");
  const isTemplate = raw.includes("{");
  const format = ctx.formatter({ spec: isTemplate ? "" : raw, unit });
  if (format.issue) ctx.issue("tooltip-format", "warning", `Tooltip format: ${format.issue}`, ["Tooltips::Tooltip format"]);
  const fields = s.has("Tooltips", "Tooltip content fields") ? s.list("Tooltips", "Tooltip content fields") : ["value", "category", "timestamp"];
  return {
    enabled,
    onClick: s.bool("Tooltips", "Show on click"),
    fields,
    format,
    template: isTemplate ? raw : undefined,
    crosshair: s.bool("Tooltips", "Enable crosshair"),
    highlight: s.bool("Tooltips", "Enable hover effects") && s.bool("Tooltips", "Highlight on hover"),
  };
}

export type LegendStatInput = { id: string; stat: number | null };

/**
 * Legend percentages share one denominator: the sum of every item's stat,
 * hidden or not. They are withheld for non-additive aggregations,
 * negative stats, or a zero total.
 */
export function legendShares(items: LegendStatInput[], additive: boolean): { shares: Map<string, number | null>; reason?: string } {
  const shares = new Map<string, number | null>();
  const valid = items.filter((i) => i.stat !== null) as { id: string; stat: number }[];
  const total = valid.reduce((a, b) => a + b.stat, 0);
  let reason: string | undefined;
  if (!additive) reason = "Percentages are not shown because averages, minimums and maximums do not add up to a whole.";
  else if (valid.some((i) => i.stat < 0)) reason = "Percentages are not shown because some values are negative.";
  else if (!valid.length || total === 0) reason = "Percentages are not shown because the total is zero.";
  for (const i of items) shares.set(i.id, reason || i.stat === null ? null : i.stat / total);
  return { shares, reason };
}

export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  if (pct < 100 && pct > 99.9) return ">99.9%";
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

export function legendFor(
  ctx: DeriveContext,
  items: (LegendItem & { stat: number | null })[],
  opts: { statLabel: string; additive: boolean; format: NumberFormatter; unavailableReason?: string },
): LegendModel {
  const s = ctx.s;
  const supported = s.has("Legend", "Show legend");
  const enabled = supported && s.bool("Legend", "Show legend", false) && !opts.unavailableReason;
  const positions = legendPositionsFor(ctx.input.visualId) ?? ["Top", "Bottom"];
  const requested = s.str("Legend", "Position") || positions[0];
  const content = s.list("Legend", "Content");
  const showPercentages = content.includes("Show percentages");
  const { shares, reason } = legendShares(items.map((i) => ({ id: i.id, stat: i.stat })), opts.additive);
  const position = (requested.toLowerCase() as LegendModel["position"]) ?? "top";
  return {
    enabled,
    unavailableReason: supported ? opts.unavailableReason : "This asset has no legend.",
    position: ["top", "bottom", "left", "right"].includes(position) ? position : "top",
    requestedPosition: requested,
    showLabels: content.includes("Show labels") || (!content.includes("Show values") && !showPercentages),
    showValues: content.includes("Show values"),
    showPercentages,
    statLabel: opts.statLabel,
    items: items.map(({ stat, ...item }) => {
      const share = shares.get(item.id) ?? null;
      return {
        ...item,
        valueText: stat === null ? "No value" : opts.format.format(stat),
        percentText: showPercentages && share !== null ? formatShare(share) : undefined,
        percentReason: showPercentages && share === null ? reason ?? "No value for this item." : undefined,
      };
    }),
  };
}

export function emptyTable(caption: string): DataTableModel {
  return { caption, columns: [], rows: [], notes: [] };
}

export function stateFromValues(values: (number | null)[], rowCount: number): { state: "ready" | "empty" | "all-null" | "all-zero"; message?: string } {
  if (!rowCount) return { state: "empty", message: "The data source returned no rows." };
  const valid = values.filter((v) => v !== null);
  if (!valid.length) return { state: "all-null", message: "Every value is missing, so there is nothing to plot." };
  if (valid.every((v) => v === 0)) return { state: "all-zero", message: "All values are zero." };
  return { state: "ready" };
}
