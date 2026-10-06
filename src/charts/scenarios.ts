/**
 * Scenario registry. A scenario is a reproducible recipe: asset, seeded
 * fixture, persisted-format setting overrides (`group::name`), card size and
 * host state. Slider overrides are written as strings so they are physical
 * units (numbers would be stored track percentages).
 */

import { CHART_ASSETS, chartAsset } from "./assets";
import type { ChartInput } from "./build";
import type { ChartDataset } from "./data/values";
import { makeFixture, FIXTURE_VARIANTS, type Fixture, type FixtureVariant } from "./fixtures";
import type { Config } from "./settings";

export const SCENARIO_VERSION = 1;

export type ScenarioFixture = { variant: FixtureVariant; series: number; categories: number; seed: number; stages?: number };

export type Scenario = {
  version: typeof SCENARIO_VERSION;
  id: string;
  name: string;
  visualId: string;
  description: string;
  expected: string;
  tags: string[];
  width: number;
  height: number;
  fixture: ScenarioFixture;
  config: Config;
  title?: string;
  subtitle?: string;
  insight?: string;
  status?: ChartInput["status"];
  statusMessage?: string;
  extensions?: ChartInput["extensions"];
  /** Custom data replaces the generated fixture (JSON import / Data tab). */
  dataset?: ChartDataset | null;
  /** Lab environment, never persisted to an asset. */
  env?: { theme?: "dark" | "light"; dir?: "ltr" | "rtl"; reducedMotion?: boolean };
};

const DEFAULT_SIZE: Record<string, [number, number]> = {
  "kpi-card": [320, 200],
  "legacy-kpi": [320, 200],
  "kpi-grid": [640, 360],
  "progress-bar": [480, 320],
  "gauge-linear": [320, 320],
  "score-indicator": [400, 200],
  "donut-chart": [480, 360],
  "polar-wind-rose": [480, 420],
  availability: [640, 200],
  table: [640, 400],
};

export function defaultFixture(visualId: string): ScenarioFixture {
  const a = chartAsset(visualId);
  return {
    variant: "normal",
    series: a.supportsSeries ? 1 : 1,
    categories: a.categoryCounts?.[1] ?? a.categoryCounts?.[0] ?? 8,
    seed: 7,
    stages: visualId === "sankey-chart" ? 3 : undefined,
  };
}

export function baseScenario(visualId: string, patch: Partial<Scenario> = {}): Scenario {
  const [w, h] = DEFAULT_SIZE[visualId] ?? [640, 360];
  const asset = chartAsset(visualId);
  return {
    version: SCENARIO_VERSION,
    id: `${visualId}:default`,
    name: `${asset.label} — default`,
    visualId,
    description: "Default settings with typical data.",
    expected: "The chart renders with resolved catalog defaults.",
    tags: ["default"],
    width: w,
    height: h,
    fixture: defaultFixture(visualId),
    config: {},
    ...patch,
  };
}

/**
 * Fixtures are deterministic, so identical parameters return the same (read-only)
 * dataset object. Dataset identity is what the model cache keys on, so a resize
 * or env change never regenerates thousands of rows or re-derives the model.
 */
const fixtureCache = new Map<string, Fixture>();
function cachedFixture(visualId: string, f: ScenarioFixture): Fixture {
  const key = JSON.stringify([visualId, f.variant, f.series, f.categories, f.seed, f.stages]);
  let fx = fixtureCache.get(key);
  if (!fx) {
    fx = makeFixture(visualId, f.variant, { series: f.series, categories: f.categories, seed: f.seed, stages: f.stages });
    if (fixtureCache.size >= 48) fixtureCache.delete(fixtureCache.keys().next().value as string);
    fixtureCache.set(key, fx);
  }
  return fx;
}

/** Builds the derivation input for a scenario. Mapping comes from the fixture, then scenario overrides. */
export function scenarioInput(s: Scenario): { input: ChartInput; fixture: Fixture } {
  const fx = cachedFixture(s.visualId, s.fixture);
  const dataset = s.dataset ?? fx.dataset;
  const config: Config = { ...fx.mapping, ...s.config };
  for (const [k, v] of Object.entries(config)) if (v === null) delete config[k];
  return {
    fixture: { ...fx, dataset },
    input: {
      visualId: s.visualId,
      config,
      dataset,
      title: s.title,
      description: s.subtitle,
      insight: s.insight,
      status: s.status,
      statusMessage: s.statusMessage,
      extensions: s.extensions,
    },
  };
}

/* ---------------- serialisation ---------------- */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** URLs carry only small recipes; custom datasets go through JSON files. */
export const URL_LIMIT = 1800;

export function encodeScenarioForUrl(s: Scenario): { ok: true; value: string } | { ok: false; reason: string } {
  if (s.dataset) return { ok: false, reason: "Scenarios with custom data are shared as a JSON file, not a URL." };
  const builtIn = BUILT_IN_SCENARIOS.find((b) => b.id === s.id);
  const value = builtIn && JSON.stringify(stripForCompare(builtIn)) === JSON.stringify(stripForCompare(s)) ? `id:${s.id}` : toBase64Url(JSON.stringify(s));
  if (value.length > URL_LIMIT) return { ok: false, reason: `This configuration is ${value.length} characters encoded; export it as JSON instead.` };
  return { ok: true, value };
}

function stripForCompare(s: Scenario) {
  return { ...s, env: undefined };
}

export type ParseResult = { ok: true; scenario: Scenario; notes: string[] } | { ok: false; error: string };

export function decodeScenarioFromUrl(value: string): ParseResult {
  if (value.startsWith("id:")) {
    const s = BUILT_IN_SCENARIOS.find((b) => b.id === value.slice(3));
    return s ? { ok: true, scenario: s, notes: [] } : { ok: false, error: `No built-in scenario “${value.slice(3)}”.` };
  }
  try {
    return parseScenario(JSON.parse(fromBase64Url(value)));
  } catch {
    return { ok: false, error: "The scenario link is damaged or incomplete." };
  }
}

export function parseScenario(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Expected a JSON object." };
  const o = raw as Record<string, unknown>;
  const notes: string[] = [];
  if (o.version !== SCENARIO_VERSION) {
    if (typeof o.version !== "number") return { ok: false, error: "Missing scenario version." };
    if (o.version > SCENARIO_VERSION) return { ok: false, error: `Scenario version ${o.version} is newer than this Lab (${SCENARIO_VERSION}).` };
  }
  if (typeof o.visualId !== "string" || !CHART_ASSETS.some((a) => a.visualId === o.visualId)) return { ok: false, error: `Unknown asset “${String(o.visualId)}”.` };
  const base = baseScenario(o.visualId);
  const fx = (o.fixture ?? {}) as Partial<ScenarioFixture>;
  const variant = FIXTURE_VARIANTS.some((v) => v.id === fx.variant) ? (fx.variant as FixtureVariant) : base.fixture.variant;
  if (fx.variant && variant !== fx.variant) notes.push(`Unknown fixture “${fx.variant}”; using ${variant}.`);
  const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  if (o.config !== undefined && (typeof o.config !== "object" || o.config === null || Array.isArray(o.config))) return { ok: false, error: "config must be an object of group::name settings." };
  const config = (o.config ?? {}) as Config;
  const badKeys = Object.keys(config).filter((k) => !k.includes("::"));
  if (badKeys.length) return { ok: false, error: `Settings keys must use group::name form: ${badKeys.slice(0, 3).join(", ")}` };
  let dataset: ChartDataset | null = null;
  if (o.dataset) {
    const d = o.dataset as Partial<ChartDataset>;
    if (!Array.isArray(d.columns) || !Array.isArray(d.rows)) return { ok: false, error: "dataset needs columns and rows arrays." };
    dataset = { id: String(d.id ?? "custom"), name: String(d.name ?? "Custom data"), columns: d.columns, rows: d.rows, ml: d.ml };
  }
  const scenario: Scenario = {
    ...base,
    id: typeof o.id === "string" ? o.id : `custom:${Date.now()}`,
    name: typeof o.name === "string" ? o.name : "Imported scenario",
    description: typeof o.description === "string" ? o.description : "",
    expected: typeof o.expected === "string" ? o.expected : "",
    tags: Array.isArray(o.tags) ? o.tags.map(String) : ["imported"],
    width: clampInt(o.width, 120, 2400, base.width),
    height: clampInt(o.height, 100, 1600, base.height),
    fixture: {
      variant,
      series: clampInt(fx.series, 1, 200, base.fixture.series),
      categories: clampInt(fx.categories, 1, 2000, base.fixture.categories),
      seed: clampInt(fx.seed, 0, 2 ** 31, base.fixture.seed),
      stages: fx.stages === undefined ? base.fixture.stages : clampInt(fx.stages, 2, 8, 3),
    },
    config,
    title: typeof o.title === "string" ? o.title : undefined,
    subtitle: typeof o.subtitle === "string" ? o.subtitle : undefined,
    insight: typeof o.insight === "string" ? o.insight : undefined,
    status: ["ready", "loading", "error", "stale", "partial"].includes(String(o.status)) ? (o.status as Scenario["status"]) : undefined,
    statusMessage: typeof o.statusMessage === "string" ? o.statusMessage : undefined,
    extensions: o.extensions && typeof o.extensions === "object" ? (o.extensions as Scenario["extensions"]) : undefined,
    dataset,
    env: o.env && typeof o.env === "object" ? (o.env as Scenario["env"]) : undefined,
  };
  return { ok: true, scenario, notes };
}

/* ---------------- built-in scenarios ---------------- */

const LONG_TITLE = "Average incident response time across all metropolitan districts, last 30 days";
const ALL_AXES = ["Show Ticks", "Show Tick Labels", "Show Grid Lines"];

function sc(visualId: string, id: string, name: string, description: string, expected: string, patch: Partial<Scenario> & { fx?: Partial<ScenarioFixture> } = {}): Scenario {
  const { fx, ...rest } = patch;
  const base = baseScenario(visualId);
  return {
    ...base,
    id: `${visualId}:${id}`,
    name,
    description,
    expected,
    tags: rest.tags ?? ["behavior"],
    ...rest,
    fixture: { ...base.fixture, ...fx },
  };
}

export const COMPOUND_SCENARIOS: Scenario[] = [
  sc("line-chart", "compound-compact-kitchen-sink", "Compact card with everything on", "A 360×300 card with a long title, headline KPI, status badge, legend, axis titles and an insight.", "The header wraps then truncates to one line, the KPI goes compact, legend values drop to labels; the plot stays at least 160×120 or a compact summary appears. No part overlaps another.", {
    tags: ["compound", "responsive"],
    width: 360,
    height: 300,
    title: LONG_TITLE,
    insight: "Response times improved 12% after the new dispatch rota; the North district remains the slowest.",
    fx: { series: 3 },
    config: {
      "KPI Display::KPI value field": "value",
      "KPI Display::KPI value calculation": "Last row",
      "Status badge::Text source": "Manual text",
      "Status badge::Fallback": "Elevated",
      "Legend::Show legend": true,
      "Scaling / axes::Show Axes Labels": true,
      "Scaling / axes::X axis label": "Date (UTC)",
      "Scaling / axes::Y axis label": "Minutes",
    },
  }),
  sc("line-chart", "compound-12-identical", "12 identical series with a shared tooltip", "Twelve series with exactly the same values overlap perfectly.", "No jitter is applied. The shared tooltip lists all 12 series and notes they have the same value; Up/Down selects each series; the legend can isolate any one.", {
    tags: ["compound", "series"],
    fx: { series: 12, variant: "identical" },
    config: { "Legend::Show legend": true },
  }),
  sc("line-chart", "compound-50-legend", "50 series with legend overflow", "Fifty series with the legend on at a regular width.", "The legend shows a few rows plus “Show all 50”; nothing is sliced. Use Only then hide the last series: the “All series are hidden” state offers Show all series.", {
    tags: ["compound", "series", "legend"],
    fx: { series: 50 },
    config: { "Legend::Show legend": true },
  }),
  sc("donut-chart", "compound-side-legend-narrow", "Donut with a long side legend in a narrow card", "Right legend with long labels at 300px wide.", "The legend moves below the donut (effective Bottom, saved Right) and comes back to the right when the card is widened past the minimum plot width.", {
    tags: ["compound", "legend", "responsive"],
    width: 300,
    height: 420,
    fx: { variant: "long-text", categories: 9 },
    config: { "Legend::Show legend": true, "Legend::Position": "Right" },
  }),
  sc("vertical-bar", "compound-mixed-stack-labels", "Mixed-sign stacked bars with data labels", "Three series with positive and negative values, stacked, value labels on.", "Positive parts stack up from zero and negative parts stack down; the zero line is drawn; stacked segment labels are replaced by the tooltip stack total.", {
    tags: ["compound", "stacking"],
    fx: { series: 3, variant: "mixed-sign", categories: 8 },
    config: { "Bar::Stack series": true, "Bar::Show values on bars": true, "Legend::Show legend": true },
  }),
  sc("sankey-chart", "compound-8-stage-narrow", "8-stage Sankey in a narrow card", "Eight stages at 320px wide.", "Nodes narrow and gaps shrink with requested→effective notes; labels truncate with full names in the tooltip and data view; flows keep truthful widths.", {
    tags: ["compound", "responsive"],
    width: 320,
    height: 420,
    fx: { stages: 8, categories: 4 },
  }),
  sc("range", "compound-axis-conflict", "Range: local and shared axis conflicts", "Shared gridlines on with the local Show grid off; shared Tick count 8 with local Y tick count 3.", "Gridlines are hidden (both must allow them) and the Y axis uses 3 ticks (local wins); both resolutions are listed under Setting conflicts.", {
    tags: ["compound", "conflict"],
    config: {
      "Scaling / axes::Show ticks / tick labels / gridlines": ALL_AXES,
      "Bar gradient::Show grid": false,
      "Scaling / axes::Tick count": "8",
      "Bar gradient::Y tick count": 3,
    },
  }),
  sc("kpi-grid", "compound-50-tiles", "50 KPI tiles", "Fifty tiles in a 640×360 card.", "All 50 tiles are reachable by scrolling inside the card in a stable reading order; arrow keys move between tiles; no four-tile cap.", {
    tags: ["compound", "cardinality"],
    fx: { categories: 50 },
  }),
  sc("availability", "compound-dense-unknown", "Dense availability with unknown intervals", "Hundreds of intervals with many missing states, bucketed into 120 segments.", "Each segment shows the worst state in its bucket; unknown stays grey (never “up” or zero); outages inside a bucket are kept and the bucketing is disclosed.", {
    tags: ["compound", "data-integrity"],
    fx: { variant: "unknown-intervals", categories: 480 },
    config: { "Bar::Segment count": 120 },
  }),
  sc("table", "compound-wide-small", "Wide table on a small viewport", "Many long columns in a 320×320 card.", "The table scrolls horizontally inside the card with a sticky header and first column; nothing overflows the page.", {
    tags: ["compound", "responsive"],
    width: 320,
    height: 320,
    fx: { variant: "wide" },
  }),
];

const ASSET_SCENARIOS: Scenario[] = [
  // Line
  sc("line-chart", "series-5", "Five series", "Five series with distinct identities.", "Each series has its own colour; with legend on, every series is listed and toggleable.", { fx: { series: 5 }, config: { "Legend::Show legend": true } }),
  sc("line-chart", "gaps", "Gaps and uneven time", "Missing values and irregular timestamps.", "Gaps stay gaps (no zero, no interpolation); isolated points are drawn as markers; spacing follows elapsed time.", { fx: { variant: "gaps" }, tags: ["data-integrity"] }),
  sc("line-chart", "invalid", "Invalid values", "Some values are text such as “n/a”.", "Invalid cells are gaps, never zero; a data note counts them.", { fx: { variant: "invalid" }, tags: ["data-integrity"] }),
  sc("line-chart", "ml-actual-vs-predicted", "Actual vs predicted (ML source)", "An ML-prediction source with both columns.", "Two series: Actual (solid) and Predicted (dashed).", { fx: { variant: "ml-forecast" }, config: { "Mapping::Y-axis values (ML only)": "Actual vs predicted", "Legend::Show legend": true } }),
  sc("line-chart", "ols-single", "Trend with one observation", "Linear trend annotation on a single row.", "No trend line is drawn; a data note explains OLS needs two distinct X values.", { fx: { variant: "single" }, config: { "Annotations::Show annotations": true, "Annotations::Source": "Linear trend (OLS)" } }),
  sc("line-chart", "step-points", "Step interpolation with points", "Step after curve with points on.", "Steps change at each observation; points use the configured radius and colours.", { config: { "Line::Curve interpolation": "Step after", "Line::Show data points": true } }),
  sc("line-chart", "dense", "Dense data", "Thousands of points.", "Ticks thin automatically (requested vs effective in the readout); hovering finds the nearest observation.", { fx: { variant: "dense" }, tags: ["performance"] }),
  sc("line-chart", "tick-formatter", "Tick label formatter beats Format", "Format .2f with Tick label formatter Compact number.", "Y tick labels use the compact formatter; tooltips still use the tooltip format.", { config: { "Scaling / axes::Format": ".2f", "Scaling / axes::Tick label formatter": "Compact number" } }),
  sc("line-chart", "manual-range-clip", "Manual range clips data", "Manual range 0 / 40 on data that exceeds it.", "Values outside the range are clipped and a note discloses how many.", { config: { "Scaling / axes::Manual range (min/max)": "0 / 40" } }),
  // Area
  sc("area-chart", "overlap", "Overlapping fills", "Three series overlay with translucent fills.", "Fills overlay in legend order with strokes on top; nothing is stacked unless the extension is on.", { fx: { series: 3 }, config: { "Legend::Show legend": true } }),
  sc("area-chart", "negative", "Negative values", "Mixed-sign data.", "The fill runs to the zero baseline; the zero line is drawn.", { fx: { variant: "mixed-sign" } }),
  sc("area-chart", "style-line", "Chart style Line", "Area asset with Chart style set to Line.", "Only strokes are drawn (the Area asset is filled unless Line is chosen explicitly).", { config: { "Line::Chart style": "Line" } }),
  sc("area-chart", "extension-stacked", "Stacked area (extension)", "Lab extension: stacked areas.", "Areas stack with correct totals; missing values contribute nothing and are flagged. Labelled as an extension.", { fx: { series: 3 }, extensions: { stackedArea: true }, tags: ["extension"] }),
  // Vertical bar
  sc("vertical-bar", "top-n-auto", "Top N automatic with 100 categories", "Top N 0 (auto) with 100 categories.", "As many bars as fit are shown, ranked by absolute value; the omitted count is disclosed and every category is in the data view.", { fx: { variant: "high-cardinality", categories: 100 }, config: { "Bar::Top N categories": "0" } }),
  sc("vertical-bar", "tracks-total", "Segmented track with Max/Total", "Segmented background tracks and per-category totals.", "Each bar shows its total outline; tracks are segmented.", { config: { "Bar::Background track style": "Segmented", "Mapping::Max/Total": "total" } }),
  sc("vertical-bar", "sorted-ties", "Sorted with ties", "Sort by value, descending, constant data.", "Ties keep their original order.", { fx: { variant: "constant" }, config: { "Bar::Sort by value": true } }),
  sc("vertical-bar", "grouped", "Grouped series", "Five series side by side.", "Bars group within each category in legend order.", { fx: { series: 5 }, config: { "Legend::Show legend": true } }),
  // Horizontal bar
  sc("horizontal-bar", "inline-many", "Inline layout with many rows", "40 rows at 320px tall.", "Rows keep a fixed height and scroll inside the card.", { height: 320, fx: { variant: "high-cardinality", categories: 40 } }),
  sc("horizontal-bar", "cartesian-long", "Cartesian layout with long labels", "Long category names, a value unit suffix and value labels.", "Left labels get up to 40% of the width and truncate with full text in the tooltip; end values have reserved room.", { fx: { variant: "long-text" }, config: { "Bar::Layout": "Cartesian", "Bar::Value label unit": "min", "Bar::Show values on bars": true } }),
  sc("horizontal-bar", "stacked-legend", "Stacked categories legend restriction", "Stacked series with the legend on.", "The legend is unavailable for stacked horizontal bars, with the reason shown.", { fx: { series: 3 }, config: { "Bar::Stack series": true, "Legend::Show legend": true } }),
  // Scatter
  sc("scatter-plot", "groups", "Categories", "Three point groups.", "Each group has its own colour; points are translucent so overlaps stay visible.", { fx: { series: 3 }, config: { "Legend::Show legend": true } }),
  sc("scatter-plot", "dense", "Thousands of points", "Dense scatter.", "All points draw; hover picks the nearest point within 28px.", { fx: { variant: "dense" }, tags: ["performance"] }),
  sc("scatter-plot", "triangles-radial", "Triangles with radial gradient", "Point shape Triangle and Gradient type Radial.", "Points draw as triangles.", { config: { "Scatter::Point shape": "Triangle", "Colors::Gradient type": "Radial" } }),
  // Donut
  sc("donut-chart", "pie", "Pie (inner radius 0)", "Inner radius 0.", "A full pie with no centre total.", { config: { "Pie / Donut::Inner radius": "0" } }),
  sc("donut-chart", "thick-center", "Donut with centre total", "Inner radius 0.6.", "The centre shows the total.", { config: { "Pie / Donut::Inner radius": "0.6", "Pie / Donut::Label format": "Both" } }),
  sc("donut-chart", "zero-total", "Zero total", "Every slice is zero.", "No false 100% ring; the state says there is no whole to divide; legend percentages are withheld.", { fx: { variant: "all-zero" }, config: { "Legend::Show legend": true }, tags: ["data-integrity"] }),
  sc("donut-chart", "negative-slice", "Negative slices", "Mixed-sign values.", "Negative slices are excluded and disclosed; shares use the sum of non-negative slices.", { fx: { variant: "mixed-sign" }, config: { "Legend::Show legend": true }, tags: ["data-integrity"] }),
  // Progress
  sc("progress-bar", "no-max", "Progress without Max/Total", "Max/Total unmapped.", "The scale falls back to 0–100 and the adaptation is disclosed.", { config: { "Mapping::Max/Total": "" } }),
  sc("progress-bar", "value-mode", "Value of total", "KPI number mode Value of total.", "Rows show value / total instead of a percentage.", { config: { "Bar::KPI number mode": "Value of total" } }),
  // Gauge
  sc("gauge-linear", "circular", "Circular gauge", "Gauge type Circular.", "A 270° arc with centre value and movement text.", { config: { "Meter & Labels::Gauge type": "Circular gauge" } }),
  sc("gauge-linear", "out-of-range", "Out-of-range value", "Extreme values on a manual 0–100 scale.", "The marker is held at the end and the real value is shown with a warning.", { fx: { variant: "extreme" }, config: { "Mapping::Min field": "", "Mapping::Max field": "", "Mapping::Min": 0, "Mapping::Max": 100 } }),
  sc("gauge-linear", "invalid-scale", "Inverted bounds", "Min 100, Max 0, unmapped min/max fields.", "The invalid scale falls back to 0–100 with a note.", { config: { "Mapping::Min field": "", "Mapping::Max field": "", "Mapping::Min": 100, "Mapping::Max": 0 } }),
  // Score
  sc("score-indicator", "fill-marker", "Fill to marker", "Fill track to marker on with scale labels.", "The track fills up to the marker; min and max are labelled.", { config: { "Track & marker styling::Fill track to marker": true, "Track & marker styling::Show scale labels": true } }),
  sc("score-indicator", "hidden-marker", "Hidden marker", "Show marker off.", "No marker; the value remains in the tooltip and summary.", { config: { "Track & marker styling::Show marker": false } }),
  // Polar
  sc("polar-wind-rose", "bands", "Speed bands", "Long band labels in the legend.", "Each band keeps its own colour and stacking order in every sector.", { fx: { variant: "long-text" }, config: { "Legend::Show legend": true } }),
  sc("polar-wind-rose", "small", "Small card", "A 260×260 card.", "Compass labels thin to the 8 main directions.", { width: 260, height: 260, tags: ["responsive"] }),
  // Range
  sc("range", "inverted", "Low above high", "Invalid values include inverted intervals.", "Inverted intervals are outlined in red and never swapped.", { fx: { variant: "invalid" }, tags: ["data-integrity"] }),
  sc("range", "labels-ref", "Value labels and reference", "Value labels on with a reference value.", "Low and high labels sit at each end; the reference line is labelled.", { config: { "Bar gradient::Show value labels": true, "Mapping::Reference value": "reference" } }),
  // Availability
  sc("availability", "all-down", "Mixed states", "Normal intervals.", "States read up/degraded/down/unknown with distinct colours.", {}),
  // Sankey
  sc("sankey-chart", "negative", "Invalid weights", "Some flows are negative or text.", "Non-positive flows are dropped and counted in a note.", { fx: { variant: "invalid" }, tags: ["data-integrity"] }),
  // KPI
  sc("kpi-card", "huge", "Huge values", "Extreme magnitudes.", "The value abbreviates with compact notation; exact value is in the data view.", { fx: { variant: "extreme" } }),
  sc("kpi-card", "currency", "Currency format", "Value format Currency (USD).", "The value shows as USD.", { config: { "KPI card::Value format": "Currency (USD)" } }),
  sc("legacy-kpi", "long", "Long labels", "Long unit and label.", "Text wraps without overlapping.", { fx: { variant: "long-text" } }),
  sc("kpi-grid", "four", "Four tiles", "Four tiles.", "Tiles reflow to the card width.", { fx: { categories: 4 } }),
  sc("table", "many-rows", "120 rows", "A 120-row table.", "Rows page 50 at a time; nothing is capped.", { fx: { categories: 120 } }),
];

const STATE_PATCHES: { id: string; name: string; patch: Partial<Scenario> & { fx?: Partial<ScenarioFixture> }; expected: string }[] = [
  { id: "state-loading", name: "Loading", patch: { status: "loading" }, expected: "A skeleton replaces the plot; the header stays." },
  { id: "state-error", name: "Error with retry", patch: { status: "error", statusMessage: "The query timed out." }, expected: "An error message replaces the plot with a Retry action." },
  { id: "state-stale", name: "Stale data", patch: { status: "stale" }, expected: "The chart draws with a visible “may be out of date” notice." },
  { id: "state-empty", name: "No data", patch: { fx: { variant: "empty" } }, expected: "“No data” replaces the plot; nothing is drawn." },
  { id: "state-all-null", name: "All null", patch: { fx: { variant: "all-null" } }, expected: "“No values” — distinct from all zero." },
  { id: "state-all-zero", name: "All zero", patch: { fx: { variant: "all-zero" } }, expected: "Zeros are drawn as zeros (or explained where a share is undefined)." },
];

function stateScenarios(): Scenario[] {
  return CHART_ASSETS.flatMap((a) =>
    STATE_PATCHES.map((p) => sc(a.visualId, p.id, p.name, `${a.label} in the ${p.name.toLowerCase()} state.`, p.expected, { ...p.patch, tags: ["state"] })),
  );
}

function missingMappingScenarios(): Scenario[] {
  return CHART_ASSETS.map((a) => {
    const fx = makeFixture(a.visualId, "normal", {});
    const cleared = Object.fromEntries(Object.keys(fx.mapping).filter((k) => k.startsWith("Mapping::") && typeof fx.mapping[k] === "string" && !/calculation|stages/i.test(k)).map((k) => [k, ""]));
    return sc(a.visualId, "state-missing-mapping", "Missing mapping", `${a.label} with its fields unmapped.`, "The required fields are named; no mock values are substituted.", { config: cleared, tags: ["state"] });
  });
}

export const BUILT_IN_SCENARIOS: Scenario[] = [
  ...CHART_ASSETS.map((a) => baseScenario(a.visualId)),
  ...COMPOUND_SCENARIOS,
  ...ASSET_SCENARIOS,
  ...stateScenarios(),
  ...missingMappingScenarios(),
];

export function scenariosFor(visualId: string): Scenario[] {
  return BUILT_IN_SCENARIOS.filter((s) => s.visualId === visualId);
}

export function scenarioById(id: string): Scenario | undefined {
  return BUILT_IN_SCENARIOS.find((s) => s.id === id);
}
