import { aggregate, cellText, columnOf, parseNumber, parseTime, type AggregationMode } from "../data/values";
import { formatExact } from "../format";
import { assignIdentities, seriesColors, CATEGORICAL } from "../identity";
import { colorAtValue, stopsForDomain } from "../color";
import { withOpacity } from "../../previewTheme";
import type {
  AvailabilityModel,
  AvailabilitySegment,
  DataTableModel,
  GaugeModel,
  KpiCardModel,
  KpiGridModel,
  KpiTile,
  ProgressModel,
  ScoreModel,
  TableCell,
  TableModel,
} from "../model";
import {
  cardKpi,
  evaluateFlags,
  headerFor,
  insightText,
  legendFor,
  statusBadge,
  storyKpi,
  toneForText,
  tooltipConfig,
  type DeriveContext,
} from "./common";

function base(ctx: DeriveContext, primary: string, opts: { statusColumn?: string; kpi?: boolean } = {}) {
  const kpi = opts.kpi === false ? null : storyKpi(ctx, primary);
  const badge = statusBadge(ctx, { valueText: kpi?.text, statusColumn: opts.statusColumn });
  const flags = evaluateFlags(ctx);
  return {
    visualId: ctx.input.visualId,
    family: ctx.asset.family,
    header: headerFor(ctx, { kpi, badge, flags }),
    insight: insightText(ctx),
    flags,
    tooltip: tooltipConfig(ctx),
    showDataLabels: ctx.s.bool("Layout & visibility", "Show data labels"),
    cardOutline: ctx.s.bool("Layout & visibility", "Show card outline"),
    legend: legendFor(ctx, [], { statLabel: "", additive: true, format: ctx.formatter() }),
  };
}

function stateFor(ctx: DeriveContext, missing: string[], hasValue: boolean, allNullMsg = "Every value is missing, so there is nothing to show.") {
  if (missing.length) return { state: "missing-mapping" as const, stateMessage: `Map ${missing.join(" and ")} to show this asset.` };
  if (!ctx.rows.length) return { state: "empty" as const, stateMessage: "The data source returned no rows." };
  if (!hasValue) return { state: "all-null" as const, stateMessage: allNullMsg };
  return { state: "ready" as const, stateMessage: undefined };
}

function envelopeTail(ctx: DeriveContext) {
  return { issues: ctx.issues, adaptations: ctx.adaptations, conflicts: ctx.conflicts, reads: [...ctx.s.reads] };
}

/** One value for single-value assets: raw uses the latest row, others aggregate all rows. */
function singleValue(ctx: DeriveContext, col: string, mode: AggregationMode): { value: number | null; rowIndex: number } {
  const vals = ctx.rows.map((r) => parseNumber(r[col]).value);
  if (mode === "raw") {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) {
      if (ctx.rows.length > 1) ctx.adapt({ id: "single-latest", setting: "Mapping::Aggregation", requested: "None (raw value)", effective: `Row ${i + 1} of ${ctx.rows.length}`, reason: "A single-value asset shows the latest row with a value when Aggregation is None." });
      return { value: vals[i], rowIndex: i };
    }
    return { value: null, rowIndex: -1 };
  }
  return { value: aggregate(vals, mode, ctx.rows.length), rowIndex: -1 };
}

function measureColumn(ctx: DeriveContext, name: string): string {
  return ctx.measure(name);
}

/* ---------------- Progress ---------------- */

export function deriveProgress(ctx: DeriveContext): ProgressModel {
  const s = ctx.s;
  const valCol = measureColumn(ctx, "X value");
  const catCol = ctx.col("Y category");
  const maxCol = ctx.col("Max/Total");
  const missing = ctx.missingRequired((o) => ctx.aggregation === "count" && o.name === "X value");
  const mode = ctx.aggregation;
  const groups = new Map<string, number[]>();
  ctx.rows.forEach((r, i) => {
    const k = catCol ? cellText(r[catCol]).trim() || "(No value)" : "__all";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  });
  let dup = 0;
  const palette = s.palette();
  const keys = [...groups.keys()];
  const colors = seriesColors(palette, keys).colors;
  const rows = missing.length
    ? []
    : keys.map((k, gi) => {
        const idx = groups.get(k)!;
        const vals = idx.map((i) => (mode === "count" ? 1 : parseNumber(ctx.rows[i][valCol]).value));
        const maxes = idx.map((i) => (maxCol ? parseNumber(ctx.rows[i][maxCol]).value : null));
        if (mode === "raw" && idx.length > 1) dup += idx.length - 1;
        const value = mode === "raw" ? vals.find((v) => v !== null) ?? null : aggregate(vals, mode, idx.length);
        const max = maxCol ? (mode === "raw" ? maxes.find((v) => v !== null) ?? null : aggregate(maxes, mode === "count" ? "sum" : mode)) : 100;
        const share = value !== null && max !== null && max > 0 ? value / max : null;
        return { label: k === "__all" ? (valCol ? ctx.label(valCol) : "Progress") : k, value, max, share, color: colors[gi] ?? CATEGORICAL[0] };
      });
  if (dup) ctx.issue("raw-duplicates", "warning", `Aggregation is None, but several rows share a bar; each bar shows its first row and ${dup} row${dup === 1 ? " is" : "s are"} not counted. Choose an aggregation${catCol ? "" : " or map Y category"}.`, ["Mapping::Aggregation", "Mapping::Y category"]);
  if (!maxCol && rows.length) ctx.adapt({ id: "progress-scale", setting: "Mapping::Max/Total", requested: "Unmapped", effective: "0–100", reason: "Without Max/Total, values are read as percentages of 100." });
  const over = rows.filter((r) => r.share !== null && r.share > 1).length;
  if (over) ctx.issue("progress-over", "info", `${over} bar${over === 1 ? " exceeds" : "s exceed"} ${over === 1 ? "its" : "their"} maximum; the bar is full and the label shows the real value.`);
  const badMax = rows.filter((r) => r.max !== null && r.max <= 0).length;
  if (badMax) ctx.issue("progress-max", "warning", `${badMax} bar${badMax === 1 ? " has" : "s have"} a maximum of zero or less, so no progress can be shown.`);
  const st = stateFor(ctx, missing, rows.some((r) => r.value !== null));
  const fmt = ctx.formatter();
  const kpiMode = (s.str("Bar", "KPI number mode") || "Percentage").startsWith("Value") ? "value" : "percentage";
  const table: DataTableModel = {
    caption: `${ctx.input.title || ctx.asset.label} data`,
    columns: [
      { key: "label", label: catCol ? ctx.label(catCol) : "Bar" },
      { key: "value", label: valCol ? ctx.label(valCol) : "Value", numeric: true },
      { key: "max", label: maxCol ? ctx.label(maxCol) : "Maximum", numeric: true },
      { key: "share", label: "Progress", numeric: true },
    ],
    rows: rows.map((r, i) => ({
      label: { text: r.label, sort: i },
      value: { text: formatExact(r.value), sort: r.value },
      max: { text: formatExact(r.max), sort: r.max },
      share: { text: r.share === null ? "—" : `${(r.share * 100).toFixed(1)}%`, sort: r.share },
    })),
    notes: [],
  };
  const b = base(ctx, valCol);
  b.legend = { ...b.legend, enabled: false, unavailableReason: "Progress Bar has no legend; each bar is labelled directly." };
  return {
    kind: "progress",
    ...b,
    ...st,
    ...envelopeTail(ctx),
    table,
    summary: st.state === "ready" ? rows.map((r) => `${r.label}: ${r.share === null ? "no value" : `${Math.round(r.share * 100)}%`}`).join("; ") + "." : st.stateMessage ?? "",
    rows,
    mode: kpiMode,
    showValues: s.bool("Layout & visibility", "Show data labels"),
    valuePosition: (s.str("Bar", "Value label position") || "Inline").startsWith("Above") ? "above" : "inline",
    separators: s.bool("Bar", "Show segment separators", true),
    track: (s.str("Bar", "Background track style") || "None").toLowerCase() as ProgressModel["track"],
    format: fmt,
    omitted: 0,
  };
}

/* ---------------- Gauge ---------------- */

export function deriveGauge(ctx: DeriveContext): GaugeModel {
  const s = ctx.s;
  const valCol = measureColumn(ctx, "Value");
  const missing = ctx.missingRequired((o) => ctx.aggregation === "count" && o.name === "Value");
  const { value, rowIndex } = missing.length ? { value: null, rowIndex: -1 } : ctx.aggregation === "count" ? { value: ctx.rows.length, rowIndex: -1 } : singleValue(ctx, valCol, ctx.aggregation);
  const row = rowIndex >= 0 ? ctx.rows[rowIndex] : ctx.latestRow()?.row;
  const minField = ctx.col("Min field");
  const maxField = ctx.col("Max field");
  const pick = (col: string, fallback: number | null) => {
    if (!col || !row) return fallback;
    const v = parseNumber(row[col]).value;
    return v ?? fallback;
  };
  let min = pick(minField, s.num("Mapping", "Min") ?? 0) ?? 0;
  let max = pick(maxField, s.num("Mapping", "Max") ?? 100) ?? 100;
  let invalidScale = false;
  if (!(max > min)) {
    ctx.issue("gauge-scale", "warning", `Gauge maximum (${max}) must be greater than minimum (${min}); the scale falls back to 0–100.`, ["Mapping::Min", "Mapping::Max"]);
    min = 0;
    max = 100;
    invalidScale = true;
  }
  const raw = value === null ? null : (value - min) / (max - min);
  const outOfRange = raw === null ? null : raw < 0 ? "below" : raw > 1 ? "above" : null;
  if (outOfRange) ctx.issue("gauge-range", "info", `The value ${formatExact(value)} is ${outOfRange} the gauge range ${min}–${max}; the needle stops at the edge and the label shows the real value.`);
  const unitCol = ctx.col("Unit");
  const statusCol = ctx.col("Status");
  const palette = s.palette();
  let color = withOpacity(palette.color, palette.opacity);
  if ((palette.style === "Gradient" || palette.style === "Steps") && value !== null) {
    color = colorAtValue(stopsForDomain(palette, [min, max]).stops, value, palette.style === "Steps");
  } else if (palette.style === "Per Category") {
    color = seriesColors(palette, ["value"]).colors[0];
  }
  const st = stateFor(ctx, missing, value !== null);
  const fmt = ctx.formatter();
  const b = base(ctx, valCol, { statusColumn: statusCol, kpi: false });
  const unit = unitCol && row ? cellText(row[unitCol]) : "";
  return {
    kind: "gauge",
    ...b,
    ...st,
    ...envelopeTail(ctx),
    table: {
      caption: `${ctx.input.title || ctx.asset.label} data`,
      columns: [
        { key: "measure", label: "Measure" },
        { key: "value", label: "Value", numeric: true },
      ],
      rows: [
        { measure: { text: valCol ? ctx.label(valCol) : "Value", sort: 0 }, value: { text: formatExact(value), sort: value } },
        { measure: { text: "Minimum", sort: 1 }, value: { text: formatExact(min), sort: min } },
        { measure: { text: "Maximum", sort: 2 }, value: { text: formatExact(max), sort: max } },
      ],
      notes: invalidScale ? ["The configured scale was invalid; 0–100 is used."] : [],
    },
    summary: st.state === "ready" ? `Gauge at ${fmt.format(value)}${unit ? ` ${unit}` : ""} on a ${min}–${max} scale${outOfRange ? `, ${outOfRange} range` : ""}.` : st.stateMessage ?? "",
    type: (s.str("Meter & Labels", "Gauge type") || "Vertical gauge").startsWith("Circular") ? "circular" : "vertical",
    value,
    min,
    max,
    position: raw === null ? null : Math.max(0, Math.min(1, raw)),
    outOfRange,
    movement: (s.str("Meter & Labels", "Movement state") || "Rising") as GaugeModel["movement"],
    showCenter: s.bool("Meter & Labels", "Show center value", true),
    subdivisions: Math.round(s.slider("Meter & Labels", "Tick subdivisions", 66)),
    unit,
    status: statusCol && row ? cellText(row[statusCol]) : "",
    color,
    format: fmt,
  };
}

/* ---------------- Score ---------------- */

export function deriveScore(ctx: DeriveContext): ScoreModel {
  const s = ctx.s;
  let kpi = storyKpi(ctx, "");
  const manual = s.bool("KPI Display", "Manual override");
  const fieldCol = ctx.mlColumn(ctx.colIn("KPI Display", "KPI value field"));
  if (kpi && !manual && fieldCol && ctx.aggregation !== "raw") {
    const v = aggregate(ctx.rows.map((r) => parseNumber(r[fieldCol]).value), ctx.aggregation, ctx.rows.length);
    kpi = { ...kpi, value: v, text: ctx.formatter().format(v), source: `${s.str("Mapping", "Aggregation")} of ${ctx.label(fieldCol)}` };
    ctx.conflicts.push({ settings: ["Mapping::Aggregation", "KPI Display::KPI value calculation"], resolution: `Aggregation (${s.str("Mapping", "Aggregation")}) combines every row, so KPI value calculation is not used.` });
  }
  let min = 0;
  let max = 100;
  let scaleSource = "default";
  if (manual) {
    const mn = parseNumber(s.str("KPI Display", "Min")).value;
    const mx = parseNumber(s.str("KPI Display", "Max")).value;
    if (mn !== null) min = mn;
    if (mx !== null) max = mx;
    scaleSource = mn !== null || mx !== null ? "manual" : "default";
  } else {
    const minCol = ctx.colIn("KPI Display", "KPI min value field");
    const maxCol = ctx.colIn("KPI Display", "KPI max value field");
    const last = ctx.latestRow()?.row;
    if (minCol && last) {
      const v = parseNumber(last[minCol]).value;
      if (v !== null) {
        min = v;
        scaleSource = "mapped";
      }
    }
    if (maxCol && last) {
      const v = parseNumber(last[maxCol]).value;
      if (v !== null) {
        max = v;
        scaleSource = "mapped";
      }
    }
  }
  if (scaleSource === "default") ctx.adapt({ id: "score-scale", setting: "KPI Display::KPI min value field", requested: "Unmapped", effective: "0–100", reason: "No minimum or maximum is mapped, so the score uses a 0–100 scale." });
  if (!(max > min)) {
    ctx.issue("score-scale", "warning", `Score maximum (${max}) must be greater than minimum (${min}); the scale falls back to 0–100.`);
    min = 0;
    max = 100;
  }
  const value = kpi?.value ?? null;
  const missing: string[] = [];
  if (!manual && !fieldCol) missing.push("KPI Display › KPI value field");
  if (!manual && kpiHidden(s.str("KPI Display", "KPI value calculation"))) ctx.issue("score-hidden-calc", "warning", "KPI value calculation is “Hidden unless manual value is set”, so the score has no value until Manual override is on.", ["KPI Display::KPI value calculation"]);
  const raw = value === null ? null : (value - min) / (max - min);
  const outOfRange = raw === null ? null : raw < 0 ? "below" : raw > 1 ? "above" : null;
  if (outOfRange) ctx.issue("score-range", "info", `The score ${formatExact(value)} is ${outOfRange} the ${min}–${max} scale; the marker stops at the edge.`);
  const st = missing.length
    ? { state: "missing-mapping" as const, stateMessage: `Map ${missing.join(" and ")} (or use Manual override) to show a score.` }
    : stateFor(ctx, [], value !== null, "The score value is missing.");
  const fmt = ctx.formatter();
  const badge = statusBadge(ctx, { valueText: kpi?.text });
  const flags = evaluateFlags(ctx);
  return {
    kind: "score",
    visualId: ctx.input.visualId,
    family: ctx.asset.family,
    header: headerFor(ctx, { kpi, badge, flags }),
    insight: insightText(ctx),
    flags,
    tooltip: tooltipConfig(ctx),
    showDataLabels: s.bool("Layout & visibility", "Show data labels"),
    cardOutline: s.bool("Layout & visibility", "Show card outline"),
    legend: legendFor(ctx, [], { statLabel: "", additive: true, format: fmt }),
    ...st,
    ...envelopeTail(ctx),
    table: {
      caption: `${ctx.input.title || ctx.asset.label} data`,
      columns: [
        { key: "measure", label: "Measure" },
        { key: "value", label: "Value", numeric: true },
      ],
      rows: [
        { measure: { text: "Score", sort: 0 }, value: { text: formatExact(value), sort: value } },
        { measure: { text: "Scale minimum", sort: 1 }, value: { text: formatExact(min), sort: min } },
        { measure: { text: "Scale maximum", sort: 2 }, value: { text: formatExact(max), sort: max } },
      ],
      notes: kpi ? [`Score source: ${kpi.source}.`] : [],
    },
    summary: st.state === "ready" ? `Score ${fmt.format(value)} on a ${min}–${max} scale (${Math.round((raw ?? 0) * 100)}% of the way).` : st.stateMessage ?? "",
    value,
    min,
    max,
    position: raw === null ? null : Math.max(0, Math.min(1, raw)),
    outOfRange,
    style: {
      showMarker: s.bool("Track & marker styling", "Show marker", true),
      fillToMarker: s.bool("Track & marker styling", "Fill track to marker"),
      trackMin: s.num("Track & marker styling", "Track min height") ?? 16,
      trackMax: s.num("Track & marker styling", "Track max height") ?? 20,
      heightRatio: s.slider("Track & marker styling", "Track height ratio", 1),
      yRatio: s.slider("Track & marker styling", "Track Y ratio", 0),
      yMax: s.num("Track & marker styling", "Track Y max") ?? 8,
      showScale: s.bool("Track & marker styling", "Show scale labels"),
      emptyFill: s.explicitColor("Track & marker styling", "Empty track fill"),
      emptyStroke: s.explicitColor("Track & marker styling", "Empty track stroke"),
      emptyStrokeWidth: s.slider("Track & marker styling", "Empty track stroke width", 1),
    },
    colors: ["#e85868", "#f0a830", "#59c96a"],
    format: fmt,
  };
}

function kpiHidden(label: string) {
  return label.toLowerCase().startsWith("hidden");
}

/* ---------------- KPI card / Legacy KPI ---------------- */

export function deriveKpiCard(ctx: DeriveContext): KpiCardModel {
  const missing = ctx.missingRequired();
  const { kpi, label } = cardKpi(ctx);
  const st = stateFor(ctx, missing, kpi.value !== null);
  const flags = evaluateFlags(ctx);
  const badge = statusBadge(ctx, { valueText: kpi.text });
  return {
    kind: ctx.input.visualId === "legacy-kpi" ? "legacy-kpi" : "kpi",
    visualId: ctx.input.visualId,
    family: ctx.asset.family,
    header: headerFor(ctx, { kpi: null, badge, flags }),
    insight: insightText(ctx),
    flags,
    tooltip: tooltipConfig(ctx),
    showDataLabels: false,
    cardOutline: ctx.s.bool("Layout & visibility", "Show card outline"),
    legend: legendFor(ctx, [], { statLabel: "", additive: true, format: ctx.formatter() }),
    ...st,
    ...envelopeTail(ctx),
    table: {
      caption: `${ctx.input.title || ctx.asset.label} data`,
      columns: [
        { key: "measure", label: "Measure" },
        { key: "value", label: "Value" },
      ],
      rows: [
        { measure: { text: label, sort: 0 }, value: { text: `${kpi.text}${kpi.unit ? ` ${kpi.unit}` : ""}`, sort: kpi.value } },
        ...(kpi.maxText ? [{ measure: { text: "Maximum", sort: 1 }, value: { text: kpi.maxText.replace("/ ", ""), sort: null } }] : []),
        ...(kpi.comparison ? [{ measure: { text: `Change ${kpi.comparison.basis}`, sort: 2 }, value: { text: kpi.comparison.text, sort: kpi.comparison.delta } }] : []),
      ],
      notes: [`Value: ${kpi.source}.`],
    },
    summary: st.state === "ready" ? `${label}: ${kpi.text}${kpi.unit ? ` ${kpi.unit}` : ""}${kpi.comparison ? `, ${kpi.comparison.text} ${kpi.comparison.basis}` : ""}.` : st.stateMessage ?? "",
    kpi,
    label,
  };
}

/* ---------------- KPI grid ---------------- */

export function deriveKpiGrid(ctx: DeriveContext): KpiGridModel {
  const s = ctx.s;
  const valCol = measureColumn(ctx, "Value");
  const labelCol = ctx.col("Metric label");
  const unitCol = ctx.col("Unit");
  const statusCol = ctx.col("Status");
  const secCol = ctx.col("Secondary label/context");
  const tipCol = ctx.col("Hover tooltip field");
  const missing = ctx.missingRequired((o) => ctx.aggregation === "count" && o.name === "Value");
  const groups = new Map<string, number[]>();
  if (!missing.length)
    ctx.rows.forEach((r, i) => {
      const k = cellText(r[labelCol]).trim() || "(No value)";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(i);
    });
  const accents = s.rows("Status", "Status → tile accent color");
  const fmt = ctx.formatter();
  let dup = 0;
  const tiles: KpiTile[] = [...groups.entries()].map(([label, idx]) => {
    const vals = idx.map((i) => (ctx.aggregation === "count" ? 1 : parseNumber(ctx.rows[i][valCol]).value));
    if (ctx.aggregation === "raw" && idx.length > 1) dup += idx.length - 1;
    const value = ctx.aggregation === "raw" ? vals.find((v) => v !== null) ?? null : aggregate(vals, ctx.aggregation, idx.length);
    const first = ctx.rows[idx[0]];
    const status = statusCol ? cellText(first[statusCol]) : undefined;
    const accent = status ? accents.find((a) => (a.label ?? "").toLowerCase() === status.toLowerCase())?.color ?? null : null;
    const unit = unitCol ? cellText(first[unitCol]) : "";
    return {
      id: `tile:${label}`,
      label,
      value,
      valueText: `${fmt.format(value)}${unit ? (/^[%°]/.test(unit) ? unit : ` ${unit}`) : ""}`,
      secondary: secCol ? cellText(first[secCol]) || undefined : undefined,
      status,
      accent,
      critical: status ? toneForText(status) === "negative" : false,
      tooltip: tipCol ? cellText(first[tipCol]) || undefined : undefined,
    };
  });
  if (dup) ctx.issue("raw-duplicates", "warning", `Aggregation is None, but several rows share a metric label; each tile shows its first row and ${dup} row${dup === 1 ? " is" : "s are"} not counted. Choose an aggregation.`, ["Mapping::Aggregation"]);
  if (statusCol && accents.length && tiles.some((t) => t.status && !t.accent)) ctx.issue("kpi-grid-accent", "info", "Some statuses have no accent color in Status → tile accent color and use the neutral accent.", ["Status::Status → tile accent color"]);
  const showHover = s.bool("KPI Grid", "Show hover tooltip");
  if (showHover && !tipCol) ctx.issue("kpi-grid-hover", "info", "Show hover tooltip is on, but Hover tooltip field is not mapped.", ["Mapping::Hover tooltip field"]);
  const st = stateFor(ctx, missing, tiles.some((t) => t.value !== null));
  const flags = evaluateFlags(ctx);
  return {
    kind: "kpi-grid",
    visualId: ctx.input.visualId,
    family: ctx.asset.family,
    header: headerFor(ctx, { kpi: null, badge: null, flags }),
    insight: insightText(ctx),
    flags,
    tooltip: tooltipConfig(ctx),
    showDataLabels: false,
    cardOutline: s.bool("Layout & visibility", "Show card outline"),
    legend: legendFor(ctx, [], { statLabel: "", additive: true, format: fmt }),
    ...st,
    ...envelopeTail(ctx),
    table: {
      caption: `${ctx.input.title || ctx.asset.label} data`,
      columns: [
        { key: "label", label: labelCol ? ctx.label(labelCol) : "Metric" },
        { key: "value", label: valCol ? ctx.label(valCol) : "Value", numeric: true },
        ...(statusCol ? [{ key: "status", label: ctx.label(statusCol) }] : []),
        ...(secCol ? [{ key: "secondary", label: ctx.label(secCol) }] : []),
      ],
      rows: tiles.map((t, i) => ({
        label: { text: t.label, sort: i },
        value: { text: formatExact(t.value), sort: t.value },
        ...(statusCol ? { status: { text: t.status ?? "", sort: t.status ?? "" } } : {}),
        ...(secCol ? { secondary: { text: t.secondary ?? "", sort: t.secondary ?? "" } } : {}),
      })),
      notes: [],
    },
    summary: st.state === "ready" ? `${tiles.length} KPI tiles. ${tiles.filter((t) => t.critical).length} critical.` : st.stateMessage ?? "",
    tiles,
    showStatus: s.bool("KPI Grid", "Show status pill", true),
    glow: s.bool("KPI Grid", "Highlight critical tiles (glow)"),
    showValue: s.bool("KPI Grid", "Show value / secondary text", true),
    showHover: showHover && !!tipCol,
  };
}

/* ---------------- Availability ---------------- */

const STATE_COLORS: Record<AvailabilitySegment["state"], string> = {
  up: "#59c96a",
  degraded: "#f0a830",
  down: "#e85868",
  unknown: "#5b6470",
};
const STATE_LABEL: Record<AvailabilitySegment["state"], string> = { up: "Available", degraded: "Degraded", down: "Unavailable", unknown: "Unknown" };
const STATE_RANK: Record<AvailabilitySegment["state"], number> = { down: 3, degraded: 2, unknown: 1, up: 0 };

export function availabilityState(raw: unknown): { state: AvailabilitySegment["state"]; value: number | null } {
  if (raw === null || raw === undefined || raw === "") return { state: "unknown", value: null };
  if (typeof raw === "boolean") return { state: raw ? "up" : "down", value: raw ? 1 : 0 };
  const p = parseNumber(raw as string | number);
  if (p.status === "ok") {
    const ratio = p.value > 1 ? p.value / 100 : p.value;
    if (ratio >= 0.99) return { state: "up", value: p.value };
    if (ratio <= 0) return { state: "down", value: p.value };
    return { state: "degraded", value: p.value };
  }
  const t = String(raw).toLowerCase();
  if (/\b(true|up|ok|on track|available|online|healthy|operational|active)\b/.test(t)) return { state: "up", value: null };
  if (/\b(false|down|offline|outage|unavailable|at risk|critical|fail)/.test(t)) return { state: "down", value: null };
  if (/\b(degraded|partial|watch|warning|slow)/.test(t)) return { state: "degraded", value: null };
  return { state: "unknown", value: null };
}

export function deriveAvailability(ctx: DeriveContext): AvailabilityModel {
  const s = ctx.s;
  const valCol = ctx.col("Value");
  const missing = ctx.missingRequired();
  const ds = ctx.input.dataset;
  const timeCol = ds.columns.find((c) => c.type === "datetime")?.name;
  let order = ctx.rows.map((_, i) => i);
  let axis: AvailabilityModel["axis"] = "order";
  if (timeCol) {
    const times = ctx.rows.map((r) => parseTime(r[timeCol]));
    if (times.every((t) => t !== null)) {
      order = [...order].sort((a, b) => (times[a] as number) - (times[b] as number) || a - b);
      axis = "time";
      ctx.adapt({ id: "availability-order", reason: `Segments are ordered by ${ctx.label(timeCol)}, the data source's time column.` });
    }
  }
  const requested = Math.max(1, Math.round(s.num("Bar", "Segment count") ?? 48));
  const states = order.map((i) => ({ i, ...availabilityState(missing.length ? null : ctx.rows[i][valCol]) }));
  const segCount = states.length ? requested : 0;
  const segments: AvailabilitySegment[] = [];
  if (states.length) {
    if (states.length > requested) {
      ctx.adapt({ id: "availability-bucket", setting: "Bar::Segment count", requested: String(requested), effective: `${requested} segments × ~${Math.ceil(states.length / requested)} rows`, reason: "There are more rows than segments; each segment shows the worst state among its rows." });
    } else if (states.length < requested) {
      ctx.adapt({ id: "availability-unknown", setting: "Bar::Segment count", requested: String(requested), effective: `${states.length} with data`, reason: `${requested - states.length} segments have no rows and show as unknown, not available.` });
    }
    const per = states.length / requested;
    for (let k = 0; k < requested; k++) {
      const from = Math.floor(k * per);
      const to = Math.max(from + 1, Math.floor((k + 1) * per));
      const bucket = states.length >= requested ? states.slice(from, to) : k < states.length ? [states[k]] : [];
      const worst = bucket.reduce<(typeof states)[number] | null>((a, b) => (!a || STATE_RANK[b.state] > STATE_RANK[a.state] ? b : a), null);
      const state = worst?.state ?? "unknown";
      const t0 = timeCol && bucket.length ? parseTime(ctx.rows[bucket[0].i][timeCol]) : null;
      const t1 = timeCol && bucket.length ? parseTime(ctx.rows[bucket[bucket.length - 1].i][timeCol]) : null;
      segments.push({
        index: k,
        start: t0,
        end: t1,
        label: bucket.length ? (timeCol ? cellText(ctx.rows[bucket[0].i][timeCol]) + (bucket.length > 1 ? ` – ${cellText(ctx.rows[bucket[bucket.length - 1].i][timeCol])}` : "") : `Row ${bucket[0].i + 1}${bucket.length > 1 ? `–${bucket[bucket.length - 1].i + 1}` : ""}`) : "No data",
        state,
        value: worst?.value ?? null,
        color: STATE_COLORS[state],
        rowIndexes: bucket.map((b) => b.i),
      });
    }
  }
  const palette = s.palette();
  if (palette.style === "Per Category") {
    for (const seg of segments) {
      const c = palette.categoryColors[STATE_LABEL[seg.state]];
      if (c) seg.color = c;
    }
  }
  const keys = (["up", "degraded", "down", "unknown"] as const).filter((k) => segments.some((sg) => sg.state === k));
  const cats = assignIdentities(keys.map((k) => STATE_LABEL[k]), null, keys.map((k) => segments.find((sg) => sg.state === k)!.color));
  const known = states.filter((x) => x.state !== "unknown").length;
  const up = states.filter((x) => x.state === "up").length;
  const fmt = ctx.formatter();
  const legend = legendFor(
    ctx,
    cats.map((c) => ({ id: c.id, label: c.label, color: c.color, stat: states.filter((x) => STATE_LABEL[x.state] === c.label).length })),
    { statLabel: "Rows", additive: true, format: fmt },
  );
  const st = stateFor(ctx, missing, states.some((x) => x.state !== "unknown"), "No row has a readable availability value; every segment is unknown.");
  return {
    kind: "availability",
    ...base(ctx, valCol, { kpi: false }),
    legend,
    ...st,
    ...envelopeTail(ctx),
    table: {
      caption: `${ctx.input.title || ctx.asset.label} data`,
      columns: [
        { key: "seg", label: "Segment", numeric: true },
        { key: "when", label: axis === "time" ? ctx.label(timeCol!) : "Rows" },
        { key: "state", label: "State" },
        { key: "rows", label: "Rows", numeric: true },
      ],
      rows: segments.map((sg) => ({
        seg: { text: String(sg.index + 1), sort: sg.index },
        when: { text: sg.label, sort: sg.start ?? sg.index },
        state: { text: STATE_LABEL[sg.state], sort: STATE_RANK[sg.state] },
        rows: { text: String(sg.rowIndexes.length), sort: sg.rowIndexes.length },
      })),
      notes: ["Unknown means no readable value; it is never shown as available.", "A segment that covers several rows shows the worst state among them."],
    },
    summary: st.state === "ready" ? `Availability over ${segCount} segments: ${known ? `${Math.round((up / known) * 1000) / 10}% of rows with a known state are available` : "no known states"}; ${states.length - known} unknown.` : st.stateMessage ?? "",
    segments,
    categories: cats,
    style: {
      segmentCount: requested,
      radius: s.slider("Bar", "Corner radius", 24),
      gap: s.slider("Bar", "Segment gap", 3),
      width: s.slider("Bar", "Segment width", 3),
    },
    axis,
    uptime: { share: known ? up / known : null, known, total: states.length },
  };
}

/* ---------------- Table ---------------- */

function headerLabels(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(/[\n,;]+/)) {
    const m = part.match(/^\s*([^=:]+?)\s*[=:]\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function deriveTable(ctx: DeriveContext): TableModel {
  const s = ctx.s;
  const ds = ctx.input.dataset;
  const visible = s.list("Mapping", "Visible columns");
  const missing = ctx.missingRequired();
  const known = visible.filter((c) => columnOf(ds, c));
  const unknown = visible.filter((c) => !columnOf(ds, c));
  if (unknown.length) ctx.issue("table-unknown", "warning", `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in the data source and ${unknown.length === 1 ? "is" : "are"} not shown.`, ["Mapping::Visible columns"]);
  const labels = headerLabels(s.str("Mapping", "Header label per column"));
  const columns = known.map((c) => ({ key: c, label: labels[c] || c, numeric: columnOf(ds, c)?.type === "number" }));
  const rows = ctx.rows.map((r) =>
    Object.fromEntries(
      known.map((c) => {
        const col = columnOf(ds, c)!;
        const v = r[c];
        let cell: TableCell;
        if (col.type === "number") {
          const p = parseNumber(v);
          cell = p.status === "ok" ? { text: formatExact(p.value), sort: p.value } : p.status === "missing" ? { text: "—", sort: null, note: "No value" } : { text: String(v), sort: null, note: "Not a number" };
        } else if (col.type === "datetime") {
          const t = parseTime(v);
          cell = { text: cellText(v) || "—", sort: t };
        } else cell = { text: cellText(v) || "—", sort: cellText(v) || null };
        return [c, cell];
      }),
    ),
  );
  const st = missing.length
    ? { state: "missing-mapping" as const, stateMessage: "Choose at least one visible column." }
    : !ctx.rows.length
      ? { state: "empty" as const, stateMessage: "The data source returned no rows." }
      : { state: "ready" as const, stateMessage: undefined };
  const flags = evaluateFlags(ctx);
  return {
    kind: "table",
    visualId: ctx.input.visualId,
    family: ctx.asset.family,
    header: headerFor(ctx, { kpi: null, badge: null, flags }),
    insight: undefined,
    flags,
    tooltip: tooltipConfig(ctx),
    showDataLabels: false,
    cardOutline: false,
    legend: legendFor(ctx, [], { statLabel: "", additive: true, format: ctx.formatter() }),
    ...st,
    ...envelopeTail(ctx),
    table: { caption: `${ctx.input.title || ctx.asset.label}`, columns, rows, notes: [] },
    summary: st.state === "ready" ? `Table with ${rows.length} rows and ${columns.length} columns.` : st.stateMessage ?? "",
    columns,
    rows,
  };
}