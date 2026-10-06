/**
 * Seeded fixtures. Every fixture is deterministic for (asset, variant,
 * counts, seed) and comes with the explicit mapping the Lab uses for that
 * asset. Mappings are never inferred inside the chart system.
 */

import { chartAsset } from "./assets";
import type { ChartDataset, DatasetColumn, RawCell, RawRow } from "./data/values";
import type { Config } from "./settings";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FixtureVariant =
  | "normal"
  | "empty"
  | "all-null"
  | "all-zero"
  | "single"
  | "constant"
  | "mixed-sign"
  | "extreme"
  | "long-text"
  | "dense"
  | "high-cardinality"
  | "gaps"
  | "identical"
  | "invalid"
  | "unknown-intervals"
  | "wide"
  | "ml-forecast"
  | "duplicates";

export const FIXTURE_VARIANTS: { id: FixtureVariant; label: string; description: string }[] = [
  { id: "normal", label: "Normal", description: "Typical values with mild variation." },
  { id: "empty", label: "No data", description: "The query returned zero rows." },
  { id: "all-null", label: "All null", description: "Rows exist but every measure is missing." },
  { id: "all-zero", label: "All zero", description: "Every measure is exactly zero." },
  { id: "single", label: "One observation", description: "A single row." },
  { id: "constant", label: "Constant", description: "Every measure has the same value." },
  { id: "mixed-sign", label: "Negative / mixed", description: "Positive and negative values." },
  { id: "extreme", label: "Extreme magnitudes", description: "Values from 0.0004 to 9.8 billion." },
  { id: "long-text", label: "Long text", description: "Long category, series and status labels." },
  { id: "dense", label: "Dense", description: "Many observations (thousands of points)." },
  { id: "high-cardinality", label: "High cardinality", description: "Many categories or series." },
  { id: "gaps", label: "Gaps & irregular time", description: "Missing values and uneven time spacing." },
  { id: "identical", label: "Identical series", description: "Every series has exactly the same values." },
  { id: "invalid", label: "Invalid values", description: "Some measures are text such as “n/a”." },
  { id: "unknown-intervals", label: "Unknown intervals", description: "Status values are often missing." },
  { id: "wide", label: "Wide", description: "Many columns with long values." },
  { id: "ml-forecast", label: "ML forecast source", description: "An ML-prediction source with actual and predicted columns." },
  { id: "duplicates", label: "Repeated rows", description: "Every row appears twice with a different measure, so Aggregation has something to combine." },
];

export type FixtureOptions = { series?: number; categories?: number; seed?: number; stages?: number };

export type Fixture = { dataset: ChartDataset; mapping: Config; note?: string };

const REGIONS = ["North", "South", "East", "West", "Central", "Harbor", "Airport", "Marina", "Downtown", "Old Town", "Hills", "Lakeside"];
const LONG = [
  "Northern Coastal Operations District (Phase II)",
  "Southern Industrial Free Zone — Logistics Cluster",
  "Eastern Residential Communities & Mixed Use",
  "Western Desert Utilities Corridor Expansion",
  "Central Business District Transit Interchange",
  "Harbor Front Cruise Terminal Redevelopment",
];
const STATUSES = ["On track", "Watch", "At risk"];
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function names(count: number, variant: FixtureVariant, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (variant === "long-text") return LONG[i % LONG.length] + (i >= LONG.length ? ` ${Math.floor(i / LONG.length) + 1}` : "");
    if (count <= REGIONS.length) return REGIONS[i];
    return `${prefix} ${String(i + 1).padStart(2, "0")}`;
  });
}

function col(name: string, label: string, type: DatasetColumn["type"]): DatasetColumn {
  return { name, label, type };
}

function monthIso(start: number, k: number): string {
  const d = new Date(Date.UTC(2024, start + k, 1));
  return d.toISOString().slice(0, 7);
}

function shapeValue(variant: FixtureVariant, base: number, rand: () => number, i: number): RawCell {
  switch (variant) {
    case "all-null":
      return null;
    case "all-zero":
      return 0;
    case "constant":
      return 42;
    case "mixed-sign":
      return Math.round((base - 50 + (rand() - 0.5) * 60) * 10) / 10;
    case "extreme": {
      const mags = [0.0004, 0.37, 12, 4800, 2.1e6, 9.8e9];
      return mags[i % mags.length] * (0.8 + rand() * 0.4);
    }
    case "invalid":
      return i % 5 === 3 ? "n/a" : Math.round(base + (rand() - 0.5) * 20);
    case "gaps":
      return i % 4 === 2 ? null : Math.round(base + (rand() - 0.5) * 20);
    default:
      return Math.round((base + (rand() - 0.5) * 20) * 10) / 10;
  }
}

function finish(id: string, label: string, columns: DatasetColumn[], rows: RawRow[], variant: FixtureVariant, extra?: Partial<ChartDataset>): ChartDataset {
  if (variant === "ml-forecast" && !extra?.ml && columns.some((c) => c.name === "value" && c.type === "number")) {
    columns = [...columns, { name: "predicted", label: "Predicted", type: "number" }];
    rows = rows.map((r, i) => {
      const v = typeof r.value === "number" ? r.value : Number(r.value);
      return { ...r, predicted: Number.isFinite(v) ? Math.round(v * (1 + ((i % 7) - 3) / 40) * 100) / 100 : null };
    });
    extra = { ...extra, ml: { actual: "value", predicted: "predicted" }, name: `${label} (ML)` };
  }
  return { id: `${id}:${variant}`, name: label, columns, rows: variant === "empty" ? [] : variant === "single" ? rows.slice(0, 1) : rows, ...extra };
}

/* ---------- shapes ---------- */

function timeSeries(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const seriesCount = variant === "high-cardinality" ? Math.max(o.series, 50) : o.series;
  const steps = variant === "dense" ? 720 : 24;
  const seriesNames = names(seriesCount, variant, "Region");
  const rows: RawRow[] = [];
  const bases = seriesNames.map((_, i) => 40 + ((i * 37) % 60) + rand() * 10);
  let k = 0;
  for (let t = 0; t < steps; t++) {
    // Gaps fixture skips months 5–7 so spacing must follow elapsed time.
    if (variant === "gaps" && t >= 5 && t <= 7) continue;
    const ts = variant === "dense" ? new Date(Date.UTC(2024, 0, 1) + t * 3600_000 * 12).toISOString().slice(0, 16) + ":00Z" : monthIso(0, t);
    seriesNames.forEach((name, si) => {
      const trend = variant === "identical" ? 0 : Math.sin((t + si) / 4) * 8 + t * 0.6;
      const v = variant === "identical" ? 50 + Math.sin(t / 3) * 10 : shapeValue(variant, bases[si] + trend, rand, k);
      const value = typeof v === "number" ? Math.round(v * 100) / 100 : v;
      rows.push({
        timestamp: ts,
        series: name,
        value,
        predicted: typeof value === "number" ? Math.round(value * (0.94 + rand() * 0.12) * 100) / 100 : null,
        reference: 60,
        low: typeof value === "number" ? Math.round((value - 6 - rand() * 4) * 10) / 10 : null,
        high: typeof value === "number" ? Math.round((value + 6 + rand() * 4) * 10) / 10 : null,
        status: variant === "long-text" ? "Requires escalation review by the operations committee" : STATUSES[(t + si) % 3],
        insight: t === steps - 1 ? (variant === "long-text" ? "Registrations in the northern coastal operations district rose for the third consecutive month, driven by the phase II handover." : "Registrations are up 8% on the previous quarter.") : "",
      });
      k++;
    });
  }
  return finish(
    "time",
    "Monthly registrations",
    [
      col("timestamp", "Month", "datetime"),
      col("series", "Region", "string"),
      col("value", "Registrations", "number"),
      col("predicted", "Predicted", "number"),
      col("reference", "Target", "number"),
      col("low", "Low", "number"),
      col("high", "High", "number"),
      col("status", "Status", "string"),
      col("insight", "Insight", "string"),
    ],
    rows,
    variant,
    variant === "ml-forecast" ? { ml: { actual: "value", predicted: "predicted" }, name: "Registrations forecast (ML)" } : undefined,
  );
}

function categorical(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const catCount = variant === "high-cardinality" ? Math.max(o.categories, 100) : variant === "dense" ? 60 : o.categories;
  const cats = names(catCount, variant, "District");
  const seriesNames = o.series === 1 ? ["All"] : names(o.series, variant === "long-text" ? "long-text" : "normal", "Series");
  const rows: RawRow[] = [];
  let k = 0;
  cats.forEach((cat, ci) => {
    seriesNames.forEach((sn, si) => {
      const base = 30 + ((ci * 53 + si * 17) % 70);
      const v = shapeValue(variant, base, rand, k);
      const value = typeof v === "number" ? Math.round(v * 100) / 100 : v;
      const total = typeof value === "number" ? Math.round(Math.abs(value) * 1.4 + 10) : 100;
      let low = typeof value === "number" ? Math.round((value - 14 - rand() * 16) * 10) / 10 : null;
      let high = typeof value === "number" ? Math.round((value + 8 + rand() * 16) * 10) / 10 : null;
      // Invalid data includes inverted intervals (low above high) that must not be swapped.
      if (variant === "invalid" && ci % 4 === 1 && low !== null && high !== null) [low, high] = [high, low];
      rows.push({
        district: cat,
        series: sn,
        value,
        total,
        low,
        high,
        reference: 55,
        status: variant === "long-text" ? "Requires escalation review by the operations committee" : STATUSES[(ci + si) % 3],
        unit: "%",
        context: variant === "long-text" ? "Compared with the same period last year across all reporting units" : `${(ci % 4) + 1} sites`,
        note: `Updated ${monthIso(0, (ci % 12))}`,
      });
      k++;
    });
  });
  return finish(
    "cat",
    "District performance",
    [
      col("district", "District", "string"),
      col("series", "Segment", "string"),
      col("value", "Completion", "number"),
      col("total", "Target", "number"),
      col("low", "Low", "number"),
      col("high", "High", "number"),
      col("reference", "Benchmark", "number"),
      col("status", "Status", "string"),
      col("unit", "Unit", "string"),
      col("context", "Context", "string"),
      col("note", "Note", "string"),
    ],
    rows,
    variant,
  );
}

function scatter(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const n = variant === "dense" ? 5000 : variant === "high-cardinality" ? 400 : 60;
  const groups = names(variant === "high-cardinality" ? Math.max(o.series, 20) : Math.max(o.series, 1), variant, "Group");
  const rows: RawRow[] = Array.from({ length: n }, (_, i) => {
    const g = i % groups.length;
    const x = variant === "constant" ? 5 : variant === "extreme" ? Math.pow(10, rand() * 9) : Math.round((rand() * 100 + g * 5) * 10) / 10;
    const yv = shapeValue(variant, x * 0.6 + 10 + g * 4, rand, i);
    return { x, y: typeof yv === "number" ? Math.round(yv * 100) / 100 : yv, size: Math.round(rand() * 900 + 100), group: groups[g] };
  });
  return finish("scatter", "Site efficiency", [col("x", "Spend (k AED)", "number"), col("y", "Output", "number"), col("size", "Staff", "number"), col("group", "Group", "string")], rows, variant);
}

function polar(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const n = variant === "dense" ? 4000 : 240;
  const rows: RawRow[] = Array.from({ length: n }, (_, i) => {
    const prevailing = rand() < 0.45 ? 10 + Math.floor(rand() * 3) : Math.floor(rand() * 16);
    const speed = shapeValue(variant, 4 + rand() * 14, rand, i);
    return {
      direction: variant === "invalid" && i % 9 === 0 ? "Variable" : i % 7 === 0 ? prevailing * 22.5 : COMPASS[prevailing],
      wind_speed: typeof speed === "number" ? Math.max(0, Math.round(speed * 10) / 10) : speed,
      band: variant === "long-text" ? ["Light breeze (Beaufort 1–2)", "Moderate breeze (Beaufort 3–4)", "Strong breeze (Beaufort 5–6)"][i % 3] : undefined,
      frequency: variant === "all-zero" ? 0 : 1,
    };
  });
  return finish("polar", "Wind observations", [col("direction", "Direction", "string"), col("wind_speed", "Wind speed (m/s)", "number"), col("band", "Band", "string"), col("frequency", "Frequency", "number")], rows, variant);
}

function sankey(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const width = variant === "high-cardinality" ? 14 : 4;
  const label = (stage: number, i: number) => (variant === "long-text" ? `${LONG[i % LONG.length].split(" ")[0]} ${["intake", "screening", "review", "approval", "funding", "build", "handover", "operations"][stage]} desk` : `${["Lead", "Qualify", "Review", "Approve", "Fund", "Build", "Handover", "Operate"][stage]} ${String.fromCharCode(65 + i)}`);
  const n = variant === "dense" ? 2000 : 80;
  const rows: RawRow[] = Array.from({ length: n }, (_, r) => {
    const row: RawRow = {};
    const stages = ["origin", "stage_2", "stage_3", "stage_4", "stage_5", "stage_6", "stage_7", "destination"];
    stages.forEach((s, k) => {
      row[s] = label(k, Math.floor(rand() * width));
    });
    const v = shapeValue(variant, 20 + rand() * 40, rand, r);
    row.value = typeof v === "number" ? Math.abs(variant === "mixed-sign" ? v : v) * (variant === "mixed-sign" && r % 6 === 0 ? -1 : 1) : v;
    return row;
  });
  return finish(
    "sankey",
    "Application pipeline",
    [
      col("origin", "Source", "string"),
      col("stage_2", "Stage 2", "string"),
      col("stage_3", "Stage 3", "string"),
      col("stage_4", "Stage 4", "string"),
      col("stage_5", "Stage 5", "string"),
      col("stage_6", "Stage 6", "string"),
      col("stage_7", "Stage 7", "string"),
      col("destination", "Target", "string"),
      col("value", "Applications", "number"),
    ],
    rows,
    variant,
  );
}

function metricSeries(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const rows: RawRow[] = Array.from({ length: 12 }, (_, t) => {
    const v = shapeValue(variant, 62 + t * 1.5, rand, t);
    return {
      timestamp: monthIso(0, t),
      value: typeof v === "number" ? Math.round(v * 10) / 10 : v,
      previous: typeof v === "number" ? Math.round((v - 3 + rand() * 2) * 10) / 10 : null,
      min: 0,
      max: variant === "extreme" ? 1e10 : 100,
      unit: variant === "long-text" ? "registrations per thousand residents" : "%",
      status: variant === "long-text" ? "Requires escalation review by the operations committee" : STATUSES[t % 3],
      insight: t === 11 ? "Completion improved for the fourth month in a row." : "",
    };
  });
  return finish(
    "metric",
    "Completion rate",
    [
      col("timestamp", "Month", "datetime"),
      col("value", "Completion rate", "number"),
      col("previous", "Previous period", "number"),
      col("min", "Minimum", "number"),
      col("max", "Maximum", "number"),
      col("unit", "Unit", "string"),
      col("status", "Status", "string"),
      col("insight", "Insight", "string"),
    ],
    rows,
    variant,
  );
}

function kpiTiles(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const count = variant === "high-cardinality" ? Math.max(o.categories, 50) : o.categories;
  const labels = names(count, variant, "Metric");
  const rows: RawRow[] = labels.map((label, i) => {
    const v = shapeValue(variant, 40 + rand() * 60, rand, i);
    return {
      metric: label,
      value: typeof v === "number" ? Math.round(v * 10) / 10 : v,
      unit: "%",
      status: variant === "long-text" ? "Requires escalation review by the operations committee" : STATUSES[i % 3],
      context: variant === "long-text" ? "Compared with the same period last year across all reporting units" : `${(i % 5) + 2} sites`,
      tip: `Last refreshed ${monthIso(0, i % 12)}`,
    };
  });
  return finish("kpi-grid", "Service KPIs", [col("metric", "Metric", "string"), col("value", "Value", "number"), col("unit", "Unit", "string"), col("status", "Status", "string"), col("context", "Context", "string"), col("tip", "Tooltip", "string")], rows, variant);
}

function availability(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const rand = mulberry32(o.seed);
  const n = variant === "dense" ? 2000 : Math.max(96, o.categories);
  const rows: RawRow[] = Array.from({ length: n }, (_, i) => {
    const r = rand();
    let state: RawCell = r < 0.86 ? "Up" : r < 0.94 ? "Degraded" : "Down";
    if (variant === "unknown-intervals" && (i % 7 === 0 || (i > 40 && i < 52))) state = null;
    if (variant === "all-null") state = null;
    if (variant === "all-zero") state = 0;
    if (variant === "invalid" && i % 6 === 0) state = "???";
    if (variant === "long-text") state = r < 0.9 ? "Operational — all regional services responding" : "Partial outage in the northern coastal cluster";
    const uptime = state === null || state === 0 ? null : state === "Down" ? Math.round(rand() * 400) / 10 : state === "Degraded" ? 90 + Math.round(rand() * 80) / 10 : 99 + Math.round(rand() * 10) / 10;
    return { timestamp: new Date(Date.UTC(2024, 5, 1) + i * 3600_000).toISOString().slice(0, 16) + ":00Z", state, uptime };
  });
  return finish("availability", "Service availability", [col("timestamp", "Hour", "datetime"), col("state", "State", "string"), col("uptime", "Uptime (%)", "number")], rows, variant);
}

function wideTable(variant: FixtureVariant, o: Required<FixtureOptions>): ChartDataset {
  const base = categorical(variant === "wide" ? "long-text" : variant === "dense" ? "normal" : variant, { ...o, series: 1, categories: variant === "high-cardinality" ? 120 : variant === "dense" ? 400 : Math.max(o.categories, 12) });
  if (variant !== "wide") return base;
  const extra = ["owner", "program", "phase", "budget", "spent", "forecast", "variance", "updated"];
  const rand = mulberry32(o.seed + 7);
  return {
    ...base,
    columns: [
      ...base.columns,
      col("owner", "Programme owner", "string"),
      col("program", "Programme", "string"),
      col("phase", "Phase", "string"),
      col("budget", "Budget (AED)", "number"),
      col("spent", "Spent (AED)", "number"),
      col("forecast", "Forecast (AED)", "number"),
      col("variance", "Variance (AED)", "number"),
      col("updated", "Last updated", "datetime"),
    ],
    rows: base.rows.map((r, i) => {
      const budget = Math.round(1e6 + rand() * 9e6);
      const spent = Math.round(budget * rand());
      return {
        ...r,
        [extra[0]]: ["Fatima Al Mansoori", "Rashid Al Hammadi", "Mariam Al Suwaidi", "Omar Al Shamsi"][i % 4],
        program: "Integrated Urban Mobility and Public Realm Enhancement Programme",
        phase: ["Concept", "Design", "Tender", "Construction"][i % 4],
        budget,
        spent,
        forecast: Math.round(spent * 1.3),
        variance: Math.round(budget - spent * 1.3),
        updated: monthIso(0, i % 12),
      };
    }),
  };
}

/* ---------- registry ---------- */

export function makeFixture(visualId: string, variant: FixtureVariant, opts: FixtureOptions = {}): Fixture {
  if (variant === "duplicates") {
    const base = makeFixture(visualId, "normal", opts);
    const numeric = base.dataset.columns.filter((c) => c.type === "number").map((c) => c.name);
    const rows = base.dataset.rows.flatMap((r) => [r, { ...r, ...Object.fromEntries(numeric.map((n) => [n, typeof r[n] === "number" ? Math.round((r[n] as number) * 0.6 * 10) / 10 : r[n]])) }]);
    return { ...base, dataset: { ...base.dataset, id: `${base.dataset.id}-dup`, name: `${base.dataset.name} (repeated rows)`, rows } };
  }
  const asset = chartAsset(visualId);
  const o: Required<FixtureOptions> = {
    series: opts.series ?? 1,
    categories: opts.categories ?? (asset.family === "kpi-grid" ? 4 : 6),
    seed: opts.seed ?? 7,
    stages: opts.stages ?? 3,
  };
  const multi = o.series > 1 || variant === "high-cardinality" || variant === "identical";
  switch (asset.family) {
    case "line":
    case "area": {
      const dataset = timeSeries(variant, { ...o, series: variant === "identical" ? Math.max(o.series, 12) : o.series });
      return { dataset, mapping: { "Mapping::X axis": "timestamp", "Mapping::Y axis": "value", ...(multi ? { "Mapping::Series": "series" } : {}) } };
    }
    case "range": {
      const dataset = categorical(variant, { ...o, series: 1 });
      return { dataset, mapping: { "Mapping::X axis": "district", "Mapping::Low value": "low", "Mapping::High value": "high" } };
    }
    case "bar":
      return { dataset: categorical(variant, o), mapping: { "Mapping::X axis": "district", "Mapping::Y axis": "value", ...(o.series > 1 ? { "Mapping::Series": "series" } : {}) } };
    case "hbar":
      return { dataset: categorical(variant, o), mapping: { "Mapping::Y category": "district", "Mapping::X value": "value", ...(o.series > 1 ? { "Mapping::Series": "series" } : {}) } };
    case "progress":
      return { dataset: categorical(variant, { ...o, series: 1, categories: Math.min(o.categories, variant === "high-cardinality" ? 40 : 6) }), mapping: { "Mapping::Y category": "district", "Mapping::X value": "value", "Mapping::Max/Total": "total" } };
    case "donut":
      return { dataset: categorical(variant, { ...o, series: 1 }), mapping: { "Mapping::Category": "district", "Mapping::Value": "value" } };
    case "scatter":
      return { dataset: scatter(variant, o), mapping: { "Mapping::X value": "x", "Mapping::Y value": "y", "Mapping::Point size": "size", ...(multi ? { "Mapping::Color/Category": "group" } : {}) } };
    case "polar":
      return { dataset: polar(variant, o), mapping: { "Mapping::Direction": "direction", "Mapping::Wind speed": "wind_speed", ...(variant === "long-text" ? { "Mapping::Band": "band" } : {}) } };
    case "sankey": {
      const stages = Math.max(2, Math.min(8, o.stages));
      const mid = ["stage_2", "stage_3", "stage_4", "stage_5", "stage_6", "stage_7"].slice(0, stages - 2);
      return {
        dataset: sankey(variant, o),
        mapping: {
          "Mapping::Number of stages": String(stages),
          "Mapping::Source": "origin",
          ...Object.fromEntries(mid.map((c, i) => [`Mapping::Stage ${i + 2}`, c])),
          "Mapping::Target": "destination",
          "Mapping::Value": "value",
        },
      };
    }
    case "gauge":
      return { dataset: metricSeries(variant, o), mapping: { "Mapping::Value": "value", "Mapping::Unit": "unit", "Mapping::Status": "status", "Mapping::Min field": "min", "Mapping::Max field": "max" } };
    case "score":
      return { dataset: metricSeries(variant, o), mapping: { "KPI Display::KPI value field": "value", "KPI Display::KPI value calculation": "Last row", "KPI Display::KPI min value field": "min", "KPI Display::KPI max value field": "max" } };
    case "kpi":
    case "legacy-kpi":
      return { dataset: metricSeries(variant, o), mapping: { "Mapping::Value": "value", "Mapping::Value calculation": "Last row", "Mapping::Unit": "unit", "Mapping::Max value": "max", "Mapping::Comparison value": "previous" } };
    case "kpi-grid":
      return { dataset: kpiTiles(variant, o), mapping: { "Mapping::Metric label": "metric", "Mapping::Value": "value", "Mapping::Unit": "unit", "Mapping::Status": "status", "Mapping::Secondary label/context": "context", "Mapping::Hover tooltip field": "tip" } };
    case "availability":
      return { dataset: availability(variant, o), mapping: { "Mapping::Value": "state" } };
    case "table":
    default: {
      const dataset = wideTable(variant, o);
      return { dataset, mapping: { "Mapping::Visible columns": dataset.columns.map((c) => c.name) } };
    }
  }
}
