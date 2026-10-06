/**
 * Coverage registry generated from the real settings catalog.
 *
 * For every asset × field (and nested palette / flag properties) it records
 * the persisted key, control, values, resolved default, units, conditions,
 * where it is implemented, intended and responsive behavior, scenarios, and
 * a verification status backed by evidence:
 *
 *  - model-effect probe: the field is set to a different valid value (with
 *    its feature master and visibility conditions satisfied) and the derived
 *    chart model changes. Every renderer input lives in the model, so this is
 *    proof that the setting is bound — not visual sign-off.
 *  - behavior rule: an executable rule asserts the field's semantics.
 */

import type { Opt, VisibleWhen } from "../chartModel";
import { visibleWhenConditions } from "../chartModel";
import { fieldsForVisual, FEATURE_TAB_MASTERS } from "../visualSettingsCatalog";
import { defaultFor, isPaletteField, keyOf, sliderScale, type Config } from "../settingsDefaults";
import { asColorMode, DEFAULT_COLOR_MODE, type ColorModeConfig } from "../previewTheme";
import { isColumnCompatible, type ColumnType } from "../mockDataset";
import { CHART_ASSETS, chartAsset } from "./assets";
import { buildChartModel } from "./build";
import { BEHAVIOR_RULES } from "./behavior";
import { FIXTURE_VARIANTS, makeFixture, type FixtureVariant } from "./fixtures";
import type { ChartDataset } from "./data/values";
import type { ChartModel } from "./model";
import { BUILT_IN_SCENARIOS } from "./scenarios";

export type CoverageStatus = "implemented-verified" | "implemented-unverified" | "missing" | "invalid-combination" | "not-applicable";

export type CoverageEntry = {
  id: string;
  visualId: string;
  key: string;
  nested?: string;
  group: string;
  name: string;
  source: string;
  control: string;
  level: string;
  values: string[];
  resolvedDefault: unknown;
  units: string | null;
  required: boolean;
  conditions: VisibleWhen | null;
  dependencies: string[];
  implementation: string;
  intended: string;
  responsive: string;
  scenarios: string[];
  status: CoverageStatus;
  evidence: string[];
  note?: string;
};

const CATALOG_SOURCE = "src/visualSettingsCatalog.ts";

const DERIVER: Record<string, string> = {
  line: "src/charts/derive/cartesian.ts",
  area: "src/charts/derive/cartesian.ts",
  bar: "src/charts/derive/cartesian.ts",
  hbar: "src/charts/derive/cartesian.ts",
  scatter: "src/charts/derive/cartesian.ts",
  range: "src/charts/derive/cartesian.ts",
  donut: "src/charts/derive/radial.ts",
  polar: "src/charts/derive/radial.ts",
  sankey: "src/charts/derive/radial.ts",
};
const SHARED_GROUPS = new Set(["Legend", "Tooltips", "Status badge", "Flags", "KPI Display", "Layout & visibility"]);

const RESPONSIVE: Record<string, string> = {
  Legend: "Reserved outside the plot; side legends move below when the plot would fall under its minimum width; values/percentages drop before the legend collapses to a button; never sliced.",
  "Scaling / axes": "Tick density follows measured label widths; explicit tick count/rotation is kept and requested→effective is reported when collisions reduce it.",
  "Layout & visibility": "Description, insight and data labels follow the family crowding order; dropped text stays in the notes panel, tooltip or data view.",
  "KPI Display": "Headline KPI goes compact below 480px and is hidden before the plot falls below its minimum.",
  "Status badge": "Badge stays inline with the title and truncates with full text in its title attribute.",
  Flags: "Flags collapse into a count below 320px.",
  Tooltips: "Tooltip placement flips and clamps within the viewport at every size.",
  Annotations: "Captions stay inside the plot; off-domain annotations are listed in the notes panel.",
};

const INTENDED: Record<string, string> = {
  "Mapping::Aggregation": "None plots every row (line/area/scatter) or uses the first row per category and discloses the rest; other modes aggregate per x/category.",
  "Mapping::Y-axis values (ML only)": "Applies only to ML-prediction sources; ignored (no effect) otherwise.",
  "Line::Chart style": "Line asset: Line or Area. Area asset: filled unless Line is chosen explicitly.",
  "Scaling / axes::Tick label formatter": "A non-Default formatter overrides Format and Number notation for tick labels.",
  "Scaling / axes::Format": "d3-format spec for ticks unless a Tick label formatter is set; invalid specs are reported.",
  "Bar::Top N categories": "Ranks categories by absolute total (ties keep order), shows them in configured order; 0 = fit to width; omitted ones are listed.",
  "Bar gradient::Show grid": "Range: gridlines show only when both this and the shared gridlines setting allow them.",
  "Bar gradient::Y tick count": "Range: overrides the shared Tick count.",
  "Pie / Donut::Inner radius": "Fraction of the radius; 0 is a pie. The catalog default (0.05) is honoured but is a product question.",
  "Legend::Position": "Saved preference; the effective position may differ for space and is reported.",
  "Colors::Gradient type": "Radial applies to Scatter points; elsewhere gradients are linear along the value axis.",
};

/** Explicit non-implemented classifications, with reasons. */
const OVERRIDES: Record<string, { status: CoverageStatus; note: string }> = {
  "*:Colors::Gradient type": { status: "invalid-combination", note: "Radial gradients only render on Scatter; on other assets Linear is the only meaningful value." },
  "scatter-plot:Colors::Gradient type": { status: "implemented-unverified", note: "Radial changes point fill rendering; checked visually, no model-level assertion." },
  "kpi-card:Layout & visibility::Show data labels": { status: "not-applicable", note: "KPI cards draw no marks to label; the headline value is always shown." },
  "legacy-kpi:Layout & visibility::Show data labels": { status: "not-applicable", note: "KPI cards draw no marks to label; the headline value is always shown." },
  "kpi-grid:Layout & visibility::Show data labels": { status: "not-applicable", note: "Each tile shows its value as text; there are no marks to label." },
  "polar-wind-rose:Mapping::Y-axis values (ML only)": { status: "invalid-combination", note: "A wind rose counts observations per direction and speed bin; actual/predicted prediction columns have no observations to bin." },
  "range:Mapping::Y-axis values (ML only)": { status: "invalid-combination", note: "Range draws Low–High intervals; a single actual or predicted measure has no interval." },
  "availability:Mapping::Aggregation": { status: "invalid-combination", note: "Availability buckets categorical states by the worst state in each bucket; numeric aggregation does not apply." },
  "availability:Colors::Palette.style": { status: "invalid-combination", note: "State colours encode Up/Degraded/Down/Unknown; only Per Category overrides keyed by state keep that meaning." },
  "availability:Colors::Palette.color": { status: "invalid-combination", note: "A single colour would make every state look the same." },
  "availability:Colors::Palette.opacity": { status: "invalid-combination", note: "State colours are fixed for contrast; opacity is not applied." },
  "availability:Colors::Palette.colors": { status: "invalid-combination", note: "Gradient/step colour lists encode value, not state." },
  "availability:Colors::Palette.sequentialBasis": { status: "invalid-combination", note: "Sequential palettes encode value, not state." },
  "availability:Colors::Palette.distribution": { status: "invalid-combination", note: "Sequential palettes encode value, not state." },
  "availability:Colors::Palette.gradientReverse": { status: "invalid-combination", note: "Sequential palettes encode value, not state." },
  "availability:Colors::Palette.gradientAxis": { status: "invalid-combination", note: "Sequential palettes encode value, not state." },
  "availability:Colors::Palette.stops": { status: "invalid-combination", note: "Sequential palettes encode value, not state." },
  "availability:Colors::Palette.categoryField": { status: "invalid-combination", note: "Categories are always the availability states." },
  "availability:Mapping::Y-axis values (ML only)": { status: "invalid-combination", note: "Availability draws categorical states; ML actual/predicted columns are numeric measures." },
};

function overrideFor(visualId: string, key: string) {
  return OVERRIDES[`${visualId}:${key}`] ?? (OVERRIDES[`*:${key}`] && !(visualId === "scatter-plot" && key === "Colors::Gradient type") ? OVERRIDES[`*:${key}`] : undefined);
}

function units(o: Opt): string | null {
  if (o.type !== "slider") return null;
  const s = sliderScale(o);
  return `${s.lo}–${s.hi}${s.unit ? ` ${s.unit}` : ""} (stored as 0–100 track %)`;
}

function fingerprint(m: ChartModel): string {
  return JSON.stringify(m, (k, v) => {
    if (k === "reads") return undefined;
    if (v instanceof Map) return [...v.entries()];
    if (v instanceof Set) return [...v];
    if (v && typeof v === "object" && typeof (v as { format?: unknown }).format === "function") {
      const f = v as { format: (n: number) => string; source?: string };
      return { source: f.source, samples: [0.4567, 12.345, 98765.4321, -3.2].map((n) => f.format(n)) };
    }
    return v;
  });
}

const PROBE_VARIANT: Record<string, FixtureVariant> = {
  "Mapping::Y-axis values (ML only)": "ml-forecast",
  "Mapping::Number notation": "extreme",
  "Mapping::Aggregation": "duplicates",
};

type ProbeData = { numeric: string[]; text: string[]; labels: string[] };

function probeData(ds: ChartDataset): ProbeData {
  const labels = new Set<string>(["value", "Available", "Degraded", "Unavailable", "Unknown"]);
  for (const r of ds.rows.slice(0, 400)) {
    for (const c of ds.columns) if (c.type === "string" && typeof r[c.name] === "string" && labels.size < 120) labels.add(r[c.name] as string);
  }
  return {
    numeric: ds.columns.filter((c) => c.type === "number").map((c) => c.name),
    text: ds.columns.filter((c) => c.type === "string").map((c) => c.name),
    labels: [...labels],
  };
}

const BADGE_MANUAL: Config = { "Status badge::Text source": "Manual text", "Status badge::Fallback": "Probe" };
const ALL_RANGE = [{ min: "-1e12", max: "1e12", color: "#f87171", label: "All" }];

/** Sibling settings a probe needs before the field can have an effect; null unsets a key. */
const PROBE_EXTRAS: Record<string, (d: ProbeData) => Config> = {
  "Annotations::Axis (manual only)": () => ({ "Annotations::X position / Y value (manual)": "50" }),
  "KPI Display::Show max value": (d) => ({ "KPI Display::KPI value calculation": "Last row", "KPI Display::KPI max value field": d.numeric[d.numeric.length - 1] ?? "" }),
  "KPI Display::KPI min value field": (d) => ({ "KPI Display::KPI max value field": d.numeric[d.numeric.length - 1] ?? "" }),
  "KPI Display::KPI max value field": (d) => ({ "KPI Display::KPI min value field": d.numeric[0] ?? "" }),
  "KPI Display::Min": () => ({ "KPI Display::Value": "42", "KPI Display::Max": "100" }),
  "KPI Display::Max": () => ({ "KPI Display::Value": "42", "KPI Display::Min": "0" }),
  "KPI Display::Unit": () => ({ "KPI Display::Value": "42" }),
  "Status badge::Color thresholds": (d) => ({ ...BADGE_MANUAL, "Status badge::Color Source": d.numeric[0] ?? "" }),
  "Status badge::Color Source": () => ({ ...BADGE_MANUAL, "Status badge::Color thresholds": ALL_RANGE }),
  "Mapping::Min": () => ({ "Mapping::Min field": null }),
  "Mapping::Aggregation": (d) => ({ "Mapping::Frequency": d.numeric[d.numeric.length - 1] ?? "" }),
  "Mapping::Max": () => ({ "Mapping::Max field": null }),
};

/** Column types a field probe should try first when the editor accepts any column. */
const PROBE_FIELD_TYPES: Record<string, ColumnType> = {
  "Status badge::Color Source": "number",
  "KPI Display::KPI unit field": "string",
};

function probeFixtureVariant(key: string): FixtureVariant {
  return PROBE_VARIANT[key] ?? "normal";
}

function conditionConfig(o: Opt, fields: Opt[]): Config {
  const out: Config = {};
  const master = FEATURE_TAB_MASTERS[o.group];
  if (master && master !== o.name && fields.some((f) => f.group === o.group && f.name === master)) out[`${o.group}::${master}`] = true;
  for (const c of visibleWhenConditions(o.visibleWhen)) {
    const key = `${c.group}::${c.name}`;
    const f = fields.find((x) => keyOf(x) === key);
    if ("is" in c) {
      const v = Array.isArray(c.is) ? c.is[0] : c.is;
      out[key] = v === "true" ? true : v === "false" ? false : v;
    } else {
      const not = Array.isArray(c.isNot) ? c.isNot : [c.isNot];
      const alt = f?.values.find((v) => !not.includes(v)) ?? "probe";
      out[key] = alt;
    }
    if (f) Object.assign(out, conditionConfig(f, fields));
  }
  return out;
}

function altValue(o: Opt, current: unknown, columns: string[]): unknown {
  switch (o.type) {
    case "toggle":
      return !(current === true || current === "true");
    case "segmented":
    case "dropdown": {
      const cur = String(current ?? "");
      return o.values.find((v) => v !== cur) ?? cur;
    }
    case "slider": {
      const n = typeof current === "number" ? current : 50;
      return n < 50 ? 85 : 15;
    }
    case "number":
      if (/range/i.test(o.name)) return "5 / 40";
      return (Number(current) || 0) + 3;
    case "text":
      if (/format/i.test(o.name)) return ".3f";
      if (/template/i.test(o.name)) return "{value} probe";
      if (/range|min\/max/i.test(o.name)) return "5 / 40";
      if (/header label/i.test(o.name)) return `${columns[0] ?? "value"}=Probe header`;
      if (/position|value \(manual\)/i.test(o.name)) return "50";
      if (/^(Value|Min|Max)$/.test(o.name)) return "42";
      return "Probe text";
    case "color":
      if (isPaletteField(o)) return { ...asColorMode(current), style: asColorMode(current).style === "Single" ? "Per Category" : "Single", color: "#c2410c" };
      return "#c2410c";
    case "multi": {
      const arr = Array.isArray(current) ? (current as string[]) : [];
      return arr.length ? arr.slice(0, -1) : o.values.slice(0, 2);
    }
    case "field": {
      const cur = String(current ?? "");
      return columns.find((c) => c !== cur) ?? "";
    }
    case "gradient":
      return [
        { color: "#ef4444", at: 0 },
        { color: "#3b82f6", at: 100 },
      ];
    case "repeatable":
      return [{ min: "0", max: "1000000", color: "#c2410c", label: "Probe" }];
    case "colorPair":
      return { stroke: "#c2410c", fill: "#0ea5e9" };
    case "colorList":
      return { a: "#c2410c" };
    default:
      return undefined;
  }
}

type Probe = { read: boolean; effect: boolean; detail: string };

function probeField(visualId: string, o: Opt, fields: Opt[], mutate?: (cur: unknown, data: ProbeData) => unknown, label?: string): Probe {
  const asset = chartAsset(visualId);
  const key = keyOf(o);
  const fx = makeFixture(visualId, probeFixtureVariant(key), { series: asset.supportsSeries ? 3 : 1, seed: 7, stages: visualId === "sankey-chart" ? 3 : undefined });
  const data = probeData(fx.dataset);
  const extraFn = PROBE_EXTRAS[key];
  const extras = Object.fromEntries(
    Object.entries(extraFn ? extraFn(data) : {}).filter(
      ([k, v]) => fields.some((f) => keyOf(f) === k) && (typeof v !== "string" || !v || fx.dataset.columns.some((c) => c.name === v) || !/field|Source/.test(k)),
    ),
  );
  const base: Config = { ...fx.mapping, ...conditionConfig(o, fields), ...extras };
  for (const [k, v] of Object.entries(base)) if (v === null) delete base[k];
  if (o.group === "Flags") base[key] = { label: "Probe", conditions: [] };
  const a = buildChartModel({ visualId, config: base, dataset: fx.dataset, title: "Probe", insight: "Probe insight" });
  const current = base[key] ?? defaultFor(o, visualId);
  const preferred = PROBE_FIELD_TYPES[key];
  const compatible = fx.dataset.columns
    .filter((c) => (preferred ? c.type === preferred : isColumnCompatible(o.name, c.type as ColumnType)))
    .map((c) => c.name);
  const columns = [...compatible, ...fx.dataset.columns.map((c) => c.name).filter((c) => !compatible.includes(c))];
  const next = mutate ? mutate(current, data) : o.group === "Flags" ? undefined : altValue(o, current, columns);
  if (next === undefined && o.group !== "Flags") return { read: a.reads.includes(key), effect: false, detail: "No alternative value could be generated." };
  const cfgB = { ...base };
  if (next === undefined) delete cfgB[key];
  else cfgB[key] = next;
  const b = buildChartModel({ visualId, config: cfgB, dataset: fx.dataset, title: "Probe", insight: "Probe insight" });
  const read = a.reads.includes(key) || b.reads.includes(key);
  const effect = fingerprint(a) !== fingerprint(b);
  const show = (v: unknown) => (typeof v === "object" ? JSON.stringify(v)?.slice(0, 48) : JSON.stringify(v));
  return { read, effect, detail: `${label ?? key}: ${show(current)} → ${show(next)} ${effect ? "changed" : "did not change"} the model` };
}

const NESTED_PALETTE: { prop: keyof ColorModeConfig; mutate: (c: ColorModeConfig, d: ProbeData) => Partial<ColorModeConfig>; note?: string }[] = [
  { prop: "style", mutate: (c) => ({ style: c.style === "Gradient" ? "Steps" : "Gradient" }) },
  { prop: "color", mutate: () => ({ style: "Single", color: "#c2410c" }) },
  { prop: "opacity", mutate: () => ({ opacity: 40 }) },
  { prop: "colors", mutate: () => ({ style: "Per Category", colors: ["#c2410c", "#0ea5e9", "#16a34a"] }) },
  { prop: "categoryColors", mutate: (_c, d) => ({ style: "Per Category", categoryColors: Object.fromEntries(d.labels.map((l) => [l, "#c2410c"])) }) },
  { prop: "sequentialBasis", mutate: () => ({ style: "Gradient", sequentialBasis: "Category" }) },
  { prop: "distribution", mutate: () => ({ style: "Gradient", distribution: "Quantile" }) },
  { prop: "gradientReverse", mutate: () => ({ style: "Gradient", gradientReverse: true }) },
  { prop: "gradientAxis", mutate: () => ({ style: "Gradient", gradientAxis: "X" }) },
  { prop: "stops", mutate: () => ({ style: "Gradient", stops: [{ value: 0, color: "#c2410c", opacity: 100 }, { value: 50, color: "#0ea5e9", opacity: 60 }] }) },
  { prop: "categoryField", mutate: () => ({ style: "Per Category", categoryField: "status" }) },
];

const NESTED_FLAG: { prop: string; value: Record<string, unknown> }[] = [
  { prop: "label", value: { label: "Probe label", conditions: [] } },
  { prop: "tooltipInsight", value: { label: "Probe", tooltipInsight: "Probe tip", conditions: [] } },
  { prop: "conditions", value: { label: "Probe", conditions: [{ property: "status", operator: "equals", value: "never" }] } },
  { prop: "conditionJoin", value: { label: "Probe", conditionJoin: "OR", conditions: [{ property: "status", operator: "equals", value: "never" }, { property: "status", operator: "equals", value: "never2" }] } },
];

export function coverageForAsset(visualId: string): CoverageEntry[] {
  const fields = fieldsForVisual(visualId);
  const asset = chartAsset(visualId);
  const out: CoverageEntry[] = [];
  const ruleCovers = (key: string) => BEHAVIOR_RULES.filter((r) => r.covers.includes(key) && r.scenarioId.startsWith(`${visualId}:`));
  const scenariosFor = (key: string) => [
    ...new Set([
      ...BUILT_IN_SCENARIOS.filter((s) => s.visualId === visualId && key in s.config).map((s) => s.id),
      ...ruleCovers(key).map((r) => r.scenarioId),
    ]),
  ];
  for (const o of fields) {
    const key = keyOf(o);
    const deps = [
      ...(FEATURE_TAB_MASTERS[o.group] && FEATURE_TAB_MASTERS[o.group] !== o.name ? [`${o.group}::${FEATURE_TAB_MASTERS[o.group]}`] : []),
      ...visibleWhenConditions(o.visibleWhen).map((c) => `${c.group}::${c.name}`),
    ];
    const common = {
      visualId,
      group: o.group,
      name: o.name,
      source: CATALOG_SOURCE,
      control: o.type,
      level: o.level,
      values: o.values,
      units: units(o),
      required: o.level === "required",
      conditions: o.visibleWhen ?? null,
      dependencies: deps,
      implementation: SHARED_GROUPS.has(o.group) ? "src/charts/derive/common.ts" : DERIVER[asset.family] ?? "src/charts/derive/metric.ts",
      responsive: RESPONSIVE[o.group] ?? "Not size-dependent; renderer scales geometry to the measured plot.",
    };
    const probe = probeField(visualId, o, fields);
    const rules = ruleCovers(key);
    const ov = overrideFor(visualId, key);
    let status: CoverageStatus;
    if (ov) status = ov.status;
    else if (!probe.read) status = "missing";
    else if (probe.effect || rules.length) status = "implemented-verified";
    else status = "implemented-unverified";
    out.push({
      ...common,
      id: `${visualId}:${key}`,
      key,
      resolvedDefault: defaultFor(o, visualId),
      intended: INTENDED[key] ?? (o.desc || o.name),
      scenarios: scenariosFor(key),
      status,
      evidence: [...(probe.effect ? [`model-effect probe — ${probe.detail}`] : []), ...rules.map((r) => `behavior rule ${r.id}`), ...(!probe.effect && probe.read ? [`read by derivation; probe: ${probe.detail}`] : [])],
      note: ov?.note ?? (!probe.read ? "Not read by the chart derivation." : undefined),
    });

    if (isPaletteField(o)) {
      for (const n of NESTED_PALETTE) {
        const p = probeField(visualId, o, fields, (cur, d) => ({ ...asColorMode(cur ?? DEFAULT_COLOR_MODE), ...n.mutate(asColorMode(cur ?? DEFAULT_COLOR_MODE), d) }), `${key}.${String(n.prop)}`);
        out.push({
          ...common,
          id: `${visualId}:${key}.${String(n.prop)}`,
          key,
          nested: String(n.prop),
          control: "palette property",
          values: [],
          resolvedDefault: (asColorMode(defaultFor(o, visualId)) as Record<string, unknown>)[n.prop],
          units: n.prop === "opacity" ? "0–100 %" : null,
          intended: n.prop === "stops" ? "Stops are data-unit values; out-of-range stops are rescaled with a disclosed adaptation." : `Palette ${String(n.prop)}.`,
          scenarios: [],
          status: OVERRIDES[`${visualId}:${key}.${String(n.prop)}`]?.status ?? (p.effect ? "implemented-verified" : "implemented-unverified"),
          evidence: p.effect ? [`model-effect probe — ${p.detail}`] : [`probe: ${p.detail}`],
          note: OVERRIDES[`${visualId}:${key}.${String(n.prop)}`]?.note ?? (p.effect ? undefined : "No model change under the probe; may only apply to specific palette styles or data."),
        });
      }
    }
    if (o.group === "Flags") {
      for (const n of NESTED_FLAG) {
        const p = probeField(visualId, o, fields, () => n.value, `${key}.${n.prop}`);
        out.push({
          ...common,
          id: `${visualId}:${key}.${n.prop}`,
          key,
          nested: n.prop,
          control: "flag property",
          values: [],
          resolvedDefault: null,
          units: null,
          intended: n.prop === "conditions" ? "Conditions are evaluated against the asset context record; missing properties hide the flag with a reason." : `Flag ${n.prop}.`,
          scenarios: [],
          status: p.effect ? "implemented-verified" : "implemented-unverified",
          evidence: [`probe: ${p.detail}`],
        });
      }
      const ex = probeFlagExpression(visualId, o.name);
      out.push({ ...common, id: `${visualId}:${key}.expression`, key, nested: "expression conditions", control: "flag property", values: [], resolvedDefault: null, units: null, intended: "Expression-mode property/value conditions, evaluated by src/charts/expr.ts against the asset context.", scenarios: [], status: ex ? "implemented-verified" : "implemented-unverified", evidence: [ex ? "model-effect probe — flag shown for value 95, hidden for value 10 with “value * 2 > 100”" : "probe: no visible flag change"], note: ex ? undefined : "Expression probe did not change the visible flags." });
    }
  }
  return out;
}

/** An expression condition must show the flag for one context and hide it for another. */
function probeFlagExpression(visualId: string, flagName: string): boolean {
  const fx = makeFixture(visualId, "normal");
  const flag = { label: "Probe", conditionJoin: "AND", conditions: [{ propertyMode: "expression", property: "value * 2 > 100", operator: "is true", valueMode: "string", value: "" }], tooltipMode: "string", tooltipInsight: "" };
  const build = (value: number) =>
    buildChartModel({ visualId, dataset: fx.dataset, config: { ...fx.mapping, [`Flags::${flagName}`]: flag }, assetContext: { value } }).header.flags.length;
  return build(95) > build(10);
}

/* ---------------- Lab controls and extensions (not asset properties) ---------------- */

export const LAB_CONTROLS = [
  { id: "lab.width", name: "Container width", values: "120–2400 px; presets 240/320/375/480/640/768/1024/1440", purpose: "Real container width for the card under test." },
  { id: "lab.height", name: "Container height", values: "100–1600 px; presets 160/240/320/480/640", purpose: "Real container height." },
  { id: "lab.theme", name: "Theme", values: "Dark / Light", purpose: "Switches html[data-theme]." },
  { id: "lab.fixture", name: "Fixture", values: `${FIXTURE_VARIANTS.length} seeded variants`, purpose: "Deterministic data shape." },
  { id: "lab.series", name: "Series count", values: "1/2/5/12/50 where supported", purpose: "Exercises identity and legend scale." },
  { id: "lab.categories", name: "Category count", values: "Per asset", purpose: "Exercises density and Top N." },
  { id: "lab.status", name: "Host status", values: "ready/loading/error/stale/partial", purpose: "Simulates host lifecycle state." },
  { id: "lab.compare", name: "Compare", values: "320 / 640 / 1024 px", purpose: "Live side-by-side renders." },
  { id: "lab.dir", name: "Direction", values: "LTR / RTL", purpose: "Mirrors UI chrome; data axes stay left-to-right." },
  { id: "lab.motion", name: "Reduced motion", values: "On / Off", purpose: "Disables transitions in the preview." },
];

export const EXTENSIONS = [
  { id: "extensions.stackedArea", name: "Stacked area", appliesTo: ["area-chart"], default: false, compatibility: "Requires 2+ series; missing values contribute 0 to the stack and are flagged; not a catalog property." },
  { id: "extensions.tableSort", name: "Table sorting and pagination", appliesTo: ["table"], default: true, compatibility: "View-only; sorts by underlying values; not persisted." },
  { id: "extensions.dataView", name: "View data", appliesTo: CHART_ASSETS.map((a) => a.visualId), default: true, compatibility: "View-only data alternative; not persisted." },
];

export function summarize(entries: CoverageEntry[]) {
  const by: Record<CoverageStatus, number> = { "implemented-verified": 0, "implemented-unverified": 0, missing: 0, "invalid-combination": 0, "not-applicable": 0 };
  for (const e of entries) by[e.status]++;
  return by;
}
