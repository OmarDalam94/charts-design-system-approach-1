/**
 * Executable behavior rules. Each rule is documentation (When / Expected /
 * Reason), a link to a reproducing scenario, and a check that runs the real
 * derivation and layout code. The Behavior tab and the unit tests read the
 * same list.
 */

import { buildChartModel } from "./build";
import { evaluateExpression } from "./expr";
import { planFrame } from "./frame";
import { sizeModeFor } from "./layout";
import type { CartesianModel, ChartModel, DonutModel } from "./model";
import { makeFixture } from "./fixtures";
import { planNumericTicks, scatterRadius } from "./scales";
import { numberFormatter } from "./format";
import { scenarioById, scenarioInput, type Scenario } from "./scenarios";

export type RuleResult = { pass: boolean; detail: string };

export type BehaviorRule = {
  id: string;
  area: "Layout" | "Legend" | "Axes" | "Tooltip" | "Data integrity" | "Series" | "Color" | "Asset" | "States" | "Accessibility";
  when: string;
  expected: string;
  reason: string;
  scenarioId: string;
  /** Persisted setting keys whose behavior this rule verifies. */
  covers: string[];
  verify: () => RuleResult;
};

function scenario(id: string): Scenario {
  const s = scenarioById(id);
  if (!s) throw new Error(`Rule references missing scenario ${id}`);
  return s;
}

export function modelFor(id: string, patch: Partial<Scenario> = {}): ChartModel {
  const s = { ...scenario(id), ...patch, config: { ...scenario(id).config, ...(patch.config ?? {}) }, fixture: { ...scenario(id).fixture, ...(patch.fixture ?? {}) } };
  return buildChartModel(scenarioInput(s).input);
}

const ok = (pass: boolean, detail: string): RuleResult => ({ pass, detail });
const cart = (m: ChartModel) => m as CartesianModel;

export const BEHAVIOR_RULES: BehaviorRule[] = [
  {
    id: "layout-modes",
    area: "Layout",
    when: "The card width crosses 320, 480 or 768 px.",
    expected: "Responsive mode changes at exactly micro <320, compact 320–479, regular 480–767, wide ≥768.",
    reason: "Named modes make spacing and density decisions predictable and testable at both sides of each boundary.",
    scenarioId: "line-chart:default",
    covers: [],
    verify: () => {
      const cases: [number, string][] = [[319, "micro"], [320, "compact"], [479, "compact"], [480, "regular"], [767, "regular"], [768, "wide"]];
      const bad = cases.filter(([w, m]) => sizeModeFor(w) !== m);
      return ok(!bad.length, bad.length ? `Wrong mode at ${bad.map((b) => b[0]).join(", ")}` : "All six boundary widths map correctly.");
    },
  },
  {
    id: "layout-compact-summary",
    area: "Layout",
    when: "The card is too short for the title, essentials and a plot of at least the family minimum (160×120 for line).",
    expected: "Optional parts drop in the documented order; if the plot is still too small a compact summary with View data replaces it.",
    reason: "An illegible miniature misleads; a summary keeps the number and an exact data path.",
    scenarioId: "line-chart:compound-compact-kitchen-sink",
    covers: ["KPI Display::KPI value field", "Layout & visibility::Show insight"],
    verify: () => {
      const m = modelFor("line-chart:compound-compact-kitchen-sink");
      const tall = planFrame(m, 360, 300);
      const short = planFrame(m, 360, 170);
      return ok(!tall.compactSummary && short.compactSummary && tall.plot.height >= 120, `300px: plot ${tall.plot.width}×${tall.plot.height}, summary=${tall.compactSummary}; 170px: summary=${short.compactSummary}`);
    },
  },
  {
    id: "legend-side-relocate",
    area: "Legend",
    when: "A side legend leaves too little plot width.",
    expected: "The legend moves below the chart; the saved Left/Right preference is restored when space returns.",
    reason: "Relocation is an effective layout decision, never an edit to the saved setting.",
    scenarioId: "donut-chart:compound-side-legend-narrow",
    covers: ["Legend::Position", "Legend::Show legend"],
    verify: () => {
      const m = modelFor("donut-chart:compound-side-legend-narrow");
      const narrow = planFrame(m, 300, 420);
      const wide = planFrame(m, 720, 420);
      return ok(narrow.legend.position === "bottom" && wide.legend.position === "right" && m.legend.requestedPosition.toLowerCase() === "right", `300px → ${narrow.legend.position}, 720px → ${wide.legend.position}, saved ${m.legend.requestedPosition}`);
    },
  },
  {
    id: "legend-never-sliced",
    area: "Legend",
    when: "There are more legend entries than visible rows (50 series).",
    expected: "Every entry stays in the legend model; the visible rows show a “Show all” control; nothing is sliced.",
    reason: "Silently dropping series hides data and breaks identity.",
    scenarioId: "line-chart:compound-50-legend",
    covers: ["Legend::Show legend", "Mapping::Series"],
    verify: () => {
      const m = modelFor("line-chart:compound-50-legend");
      const plan = planFrame(m, 640, 360);
      return ok(m.legend.items.length === 50 && plan.legend.overflow && plan.legend.visibleRows < plan.legend.rows, `${m.legend.items.length} items, ${plan.legend.visibleRows}/${plan.legend.rows} rows visible, overflow=${plan.legend.overflow}`);
    },
  },
  {
    id: "legend-percent-denominator",
    area: "Legend",
    when: "Legend percentages are requested and aggregation is Average.",
    expected: "Percentages are withheld with a reason, because averages are not parts of a whole.",
    reason: "A meaningful-looking percentage of a non-additive measure is false.",
    scenarioId: "line-chart:series-5",
    covers: ["Legend::Content", "Mapping::Aggregation"],
    verify: () => {
      const m = modelFor("line-chart:series-5", { config: { "Mapping::Aggregation": "Average", "Legend::Content": ["Show labels", "Show values", "Show percentages"] } });
      const withheld = m.legend.items.every((i) => !i.percentText && !!i.percentReason);
      return ok(withheld, withheld ? `Reason: ${m.legend.items[0]?.percentReason}` : "A percentage was shown for an average.");
    },
  },
  {
    id: "donut-zero-total",
    area: "Data integrity",
    when: "Every donut slice is zero.",
    expected: "No 100% ring is drawn; the state explains there is no whole; shares are withheld.",
    reason: "Zero divided by zero has no share.",
    scenarioId: "donut-chart:zero-total",
    covers: ["Mapping::Value", "Mapping::Category"],
    verify: () => {
      const m = modelFor("donut-chart:zero-total") as DonutModel;
      return ok(m.state === "all-zero" && m.slices.every((s) => s.share === null), `state=${m.state}`);
    },
  },
  {
    id: "donut-negative",
    area: "Data integrity",
    when: "A donut slice is negative.",
    expected: "The slice is excluded and disclosed; shares use the sum of non-negative slices.",
    reason: "A negative amount cannot be a part of a whole.",
    scenarioId: "donut-chart:negative-slice",
    covers: [],
    verify: () => {
      const m = modelFor("donut-chart:negative-slice") as DonutModel;
      const neg = m.slices.filter((s) => s.value !== null && s.value < 0);
      const sum = m.slices.reduce((a, s) => a + (s.share ?? 0), 0);
      return ok(neg.length > 0 && neg.every((s) => s.share === null) && Math.abs(sum - 1) < 1e-9 && m.issues.some((i) => i.id === "donut-negative"), `${neg.length} negative slices; drawn shares sum to ${sum.toFixed(6)}`);
    },
  },
  {
    id: "null-not-zero",
    area: "Data integrity",
    when: "A value is missing or text such as “n/a”.",
    expected: "It is a gap (null), never zero; a note counts invalid cells.",
    reason: "Zero is a measurement; missing is not.",
    scenarioId: "line-chart:invalid",
    covers: ["Mapping::Y axis"],
    verify: () => {
      const m = cart(modelFor("line-chart:invalid"));
      const nulls = m.series.flatMap((s) => s.data).filter((d) => d.y === null).length;
      const zeros = m.series.flatMap((s) => s.data).filter((d) => d.y === 0).length;
      return ok(nulls > 0 && zeros === 0 && m.issues.some((i) => i.id === "invalid-y"), `${nulls} gaps kept as null, ${zeros} zeros`);
    },
  },
  {
    id: "time-elapsed",
    area: "Axes",
    when: "Timestamps are unevenly spaced.",
    expected: "X positions use elapsed time (ms), not row index.",
    reason: "Index spacing makes irregular sampling look regular.",
    scenarioId: "line-chart:gaps",
    covers: ["Mapping::X axis"],
    verify: () => {
      const m = cart(modelFor("line-chart:gaps"));
      const xs = m.series[0].data.map((d) => d.x);
      const steps = new Set(xs.slice(1).map((x, i) => x - xs[i]));
      return ok(m.xKind === "time" && steps.size > 1, `xKind=${m.xKind}, ${steps.size} distinct step sizes`);
    },
  },
  {
    id: "formatter-precedence",
    area: "Axes",
    when: "Both Format and a non-Default Tick label formatter are set.",
    expected: "The Tick label formatter wins for ticks; Format applies to other numbers.",
    reason: "Repository rule: a non-default Tick label formatter overrides Format.",
    scenarioId: "line-chart:tick-formatter",
    covers: ["Scaling / axes::Tick label formatter", "Scaling / axes::Format"],
    verify: () => {
      const m = cart(modelFor("line-chart:tick-formatter"));
      return ok(m.yAxis.format.source === "preset", `Y tick formatter source: ${m.yAxis.format.source}`);
    },
  },
  {
    id: "precision-guard",
    area: "Axes",
    when: "A formatter would print a non-zero value as 0.",
    expected: "Precision is raised so the value is never shown as 0.",
    reason: "A tick or tooltip reading 0 for 0.0004 is false.",
    scenarioId: "line-chart:default",
    covers: [],
    verify: () => {
      const f = numberFormatter({ notation: "compact", spec: ".0f" });
      const t = f.format(0.0004);
      return ok(t !== "0" && t !== "-0", `0.0004 → “${t}”`);
    },
  },
  {
    id: "tick-requested-effective",
    area: "Axes",
    when: "Tick count asks for more ticks than fit.",
    expected: "The effective count is reduced and requested vs effective is shown with a reason.",
    reason: "Explicit settings remain represented even when collision handling adjusts them.",
    scenarioId: "line-chart:default",
    covers: ["Scaling / axes::Tick count"],
    verify: () => {
      const p = planNumericTicks([0, 100], 120, { requested: 20, minSpacingPx: 24, endpointsOnly: false });
      return ok(p.requested === 20 && p.effective < 20 && !!p.reason, `requested ${p.requested}, effective ${p.effective}`);
    },
  },
  {
    id: "manual-range-clip",
    area: "Axes",
    when: "A manual range excludes some data.",
    expected: "The range is honoured and the clipped count is disclosed.",
    reason: "Clipping without disclosure hides data.",
    scenarioId: "line-chart:manual-range-clip",
    covers: ["Scaling / axes::Manual range (min/max)"],
    verify: () => {
      const m = cart(modelFor("line-chart:manual-range-clip"));
      return ok(m.yDomain[0] === 0 && m.yDomain[1] === 40 && m.issues.some((i) => i.id.startsWith("domain:")), `domain ${m.yDomain.join("–")}`);
    },
  },
  {
    id: "ols-insufficient",
    area: "Asset",
    when: "Linear trend is requested with fewer than two distinct X values.",
    expected: "No trend line; a note explains why.",
    reason: "A fabricated trend is worse than none.",
    scenarioId: "line-chart:ols-single",
    covers: ["Annotations::Source", "Annotations::Show annotations"],
    verify: () => {
      const m = cart(modelFor("line-chart:ols-single"));
      return ok(!m.annotations.some((a) => a.kind === "trend") && m.issues.some((i) => /two|2 distinct/i.test(i.message)), `${m.annotations.length} annotations`);
    },
  },
  {
    id: "series-identical-no-jitter",
    area: "Series",
    when: "Several series have identical values.",
    expected: "Values are drawn exactly (no jitter); identity uses colour plus dash/marker so overlapping series remain distinguishable in the legend and tooltip.",
    reason: "Jitter changes data; redundant cues keep identity without changing values.",
    scenarioId: "line-chart:compound-12-identical",
    covers: ["Mapping::Series"],
    verify: () => {
      const m = cart(modelFor("line-chart:compound-12-identical"));
      const first = JSON.stringify(m.series[0].data.map((d) => d.y));
      const same = m.series.every((s) => JSON.stringify(s.data.map((d) => d.y)) === first);
      const ids = new Set(m.series.map((s) => `${s.identity.color}|${s.identity.dash}|${s.identity.marker}`));
      return ok(m.series.length === 12 && same && ids.size === 12, `${m.series.length} series, ${ids.size} unique identities, values identical=${same}`);
    },
  },
  {
    id: "series-50-identity",
    area: "Series",
    when: "50 series are shown.",
    expected: "All 50 keep unique colour+dash+marker identities.",
    reason: "A 1-series and a 50-series chart belong to the same system.",
    scenarioId: "line-chart:compound-50-legend",
    covers: [],
    verify: () => {
      const m = cart(modelFor("line-chart:compound-50-legend"));
      const ids = new Set(m.series.map((s) => `${s.identity.color}|${s.identity.dash}|${s.identity.marker}`));
      return ok(ids.size === 50, `${ids.size} unique identities`);
    },
  },
  {
    id: "ml-only",
    area: "Data integrity",
    when: "“Y-axis values (ML only)” is set on a source without ML columns.",
    expected: "The setting does not change the measure.",
    reason: "The option only applies to ML-prediction sources.",
    scenarioId: "line-chart:default",
    covers: ["Mapping::Y-axis values (ML only)"],
    verify: () => {
      const a = cart(modelFor("line-chart:default"));
      const b = cart(modelFor("line-chart:default", { config: { "Mapping::Y-axis values (ML only)": "Actual only" } }));
      const ml = cart(modelFor("line-chart:ml-actual-vs-predicted"));
      return ok(JSON.stringify(a.series[0].data.map((d) => d.y)) === JSON.stringify(b.series[0].data.map((d) => d.y)) && ml.series.length === 2, `non-ML unchanged; ML source shows ${ml.series.length} series`);
    },
  },
  {
    id: "top-n-disclosed",
    area: "Asset",
    when: "Top N limits the categories.",
    expected: "Categories are ranked by absolute total; omitted ones are listed and stay in the data view.",
    reason: "Do not silently aggregate or drop categories.",
    scenarioId: "vertical-bar:top-n-auto",
    covers: ["Bar::Top N categories"],
    verify: () => {
      const m = cart(modelFor("vertical-bar:top-n-auto", { config: { "Bar::Top N categories": "10" } }));
      return ok(m.categories.length === 10 && m.bar.omitted.length === 90 && m.table.rows.length >= 100, `${m.categories.length} shown, ${m.bar.omitted.length} omitted, ${m.table.rows.length} table rows`);
    },
  },
  {
    id: "stack-diverging",
    area: "Asset",
    when: "Stacked bars contain positive and negative values.",
    expected: "Positive parts stack up from zero, negative parts stack down.",
    reason: "Cumulative stacking across signs misplaces every segment after the first negative.",
    scenarioId: "vertical-bar:compound-mixed-stack-labels",
    covers: ["Bar::Stack series"],
    verify: () => {
      const m = cart(modelFor("vertical-bar:compound-mixed-stack-labels"));
      const bad = m.series.flatMap((s) => s.data).filter((d) => d.y !== null && ((d.y >= 0 && (d.y0 ?? 0) < 0) || (d.y < 0 && (d.y0 ?? 0) > 0)));
      return ok(m.stacked && bad.length === 0, `${bad.length} segments cross zero`);
    },
  },
  {
    id: "hbar-stack-legend",
    area: "Legend",
    when: "Horizontal bars stack series.",
    expected: "The legend is unavailable with a stated reason.",
    reason: "Catalog restriction: horizontal category stacks label segments inline.",
    scenarioId: "horizontal-bar:stacked-legend",
    covers: ["Legend::Show legend", "Bar::Stack series"],
    verify: () => {
      const m = modelFor("horizontal-bar:stacked-legend");
      return ok(!m.legend.enabled && !!m.legend.unavailableReason, m.legend.unavailableReason ?? "legend still enabled");
    },
  },
  {
    id: "range-no-swap",
    area: "Data integrity",
    when: "A range has low above high.",
    expected: "Endpoints are not swapped; the interval is flagged invalid.",
    reason: "Swapping hides a data error.",
    scenarioId: "range:inverted",
    covers: ["Mapping::Low value", "Mapping::High value"],
    verify: () => {
      const m = cart(modelFor("range:inverted"));
      const inv = m.series.flatMap((s) => s.data).filter((d) => d.invalid);
      return ok(inv.length > 0 && inv.every((d) => (d.low ?? 0) > (d.high ?? 0)), `${inv.length} inverted intervals kept as given`);
    },
  },
  {
    id: "range-axis-precedence",
    area: "Axes",
    when: "Range has shared gridlines on and local Show grid off, and both tick counts set.",
    expected: "Gridlines show only when both allow them; local Y tick count wins; both are listed as conflicts.",
    reason: "One precedence policy for local vs shared axis settings.",
    scenarioId: "range:compound-axis-conflict",
    covers: ["Bar gradient::Show grid", "Bar gradient::Y tick count", "Scaling / axes::Show ticks / tick labels / gridlines"],
    verify: () => {
      const m = cart(modelFor("range:compound-axis-conflict"));
      return ok(!m.yAxis.showGrid && m.yAxis.tickCount === 3 && m.conflicts.length >= 2, `grid=${m.yAxis.showGrid}, ticks=${m.yAxis.tickCount}, conflicts=${m.conflicts.length}`);
    },
  },
  {
    id: "area-style-line",
    area: "Asset",
    when: "The Area asset has Chart style set to Line.",
    expected: "Only strokes are drawn; any other value keeps the fill.",
    reason: "The catalog default “Line” would otherwise make every new Area asset a line chart.",
    scenarioId: "area-chart:style-line",
    covers: ["Line::Chart style"],
    verify: () => {
      const a = cart(modelFor("area-chart:default"));
      const b = cart(modelFor("area-chart:style-line"));
      return ok(a.areaFill && !b.areaFill, `default fill=${a.areaFill}, explicit Line fill=${b.areaFill}`);
    },
  },
  {
    id: "progress-no-legend",
    area: "Legend",
    when: "The asset is a Progress Bar.",
    expected: "There is no legend option and none is rendered; without Max/Total the scale is 0–100 and disclosed.",
    reason: "Do not create options that do not exist in the catalog.",
    scenarioId: "progress-bar:no-max",
    covers: ["Mapping::Max/Total"],
    verify: () => {
      const m = modelFor("progress-bar:no-max");
      const scale = m.adaptations.find((a) => a.id === "progress-scale");
      return ok(m.legend.items.length === 0 && scale?.effective === "0–100", scale ? `${scale.requested} → ${scale.effective}` : "no scale adaptation");
    },
  },
  {
    id: "gauge-clamp",
    area: "Asset",
    when: "A gauge value is outside its scale.",
    expected: "The marker is clamped and the real value is flagged.",
    reason: "Clamp display geometry only; never the number.",
    scenarioId: "gauge-linear:out-of-range",
    covers: ["Mapping::Value", "Mapping::Max field"],
    verify: () => {
      const m = modelFor("gauge-linear:out-of-range");
      return ok(m.kind === "gauge" && m.outOfRange !== null && m.position !== null && m.position <= 1, m.kind === "gauge" ? `value ${m.value}, ${m.outOfRange}` : "not a gauge");
    },
  },
  {
    id: "sankey-stage-ids",
    area: "Asset",
    when: "The same label appears in two stages.",
    expected: "They are different nodes (stage-aware IDs), so flows cannot form cycles.",
    reason: "Merging same-named nodes across stages creates false cycles.",
    scenarioId: "sankey-chart:compound-8-stage-narrow",
    covers: ["Mapping::Number of stages", "Mapping::Source", "Mapping::Target"],
    verify: () => {
      const m = modelFor("sankey-chart:compound-8-stage-narrow");
      if (m.kind !== "sankey") return ok(false, "not a sankey");
      const ids = new Set(m.nodes.map((n) => n.id));
      const cyc = m.links.some((l) => Number(l.source.split(":")[0]) >= Number(l.target.split(":")[0]));
      return ok(ids.size === m.nodes.length && m.stages.length === 8 && !cyc, `${m.nodes.length} nodes over ${m.stages.length} stages`);
    },
  },
  {
    id: "availability-worst",
    area: "Data integrity",
    when: "More intervals than segments.",
    expected: "Each segment shows the worst state in its bucket; empty buckets are unknown; bucketing is disclosed.",
    reason: "Averaging would hide outages.",
    scenarioId: "availability:compound-dense-unknown",
    covers: ["Bar::Segment count", "Mapping::Value"],
    verify: () => {
      const m = modelFor("availability:compound-dense-unknown");
      if (m.kind !== "availability") return ok(false, "not availability");
      return ok(m.segments.length === 120 && m.adaptations.some((a) => /worst/i.test(a.reason)) && m.segments.some((s) => s.state === "unknown"), `${m.segments.length} segments`);
    },
  },
  {
    id: "kpi-grid-no-cap",
    area: "Asset",
    when: "There are 50 KPI tiles.",
    expected: "All 50 tiles render in reading order.",
    reason: "No four-tile preview cap.",
    scenarioId: "kpi-grid:compound-50-tiles",
    covers: ["Mapping::Metric label"],
    verify: () => {
      const m = modelFor("kpi-grid:compound-50-tiles");
      return ok(m.kind === "kpi-grid" && m.tiles.length === 50, m.kind === "kpi-grid" ? `${m.tiles.length} tiles` : "");
    },
  },
  {
    id: "table-no-cap",
    area: "Asset",
    when: "A table has 120 rows.",
    expected: "All 120 rows are in the model; the view pages 50 at a time.",
    reason: "No silent preview row cap.",
    scenarioId: "table:many-rows",
    covers: ["Mapping::Visible columns"],
    verify: () => {
      const m = modelFor("table:many-rows");
      return ok(m.kind === "table" && m.rows.length === 120, m.kind === "table" ? `${m.rows.length} rows` : "");
    },
  },
  {
    id: "missing-mapping",
    area: "States",
    when: "Required fields are unmapped.",
    expected: "A missing-mapping state names the fields; no mock values are drawn.",
    reason: "Never silently substitute mock values.",
    scenarioId: "line-chart:state-missing-mapping",
    covers: [],
    verify: () => {
      const m = modelFor("line-chart:state-missing-mapping");
      return ok(m.state === "missing-mapping" && !!m.stateMessage, m.stateMessage ?? m.state);
    },
  },
  {
    id: "host-states",
    area: "States",
    when: "The host reports loading, error or stale.",
    expected: "Loading and error replace the plot; stale draws with a notice.",
    reason: "Lifecycle state is distinct from data state.",
    scenarioId: "line-chart:state-error",
    covers: [],
    verify: () => {
      const e = modelFor("line-chart:state-error");
      const s = modelFor("line-chart:state-stale");
      return ok(e.state === "error" && s.state === "ready" && s.issues.some((i) => i.id === "host:stale"), `error=${e.state}, stale=${s.state}`);
    },
  },
  {
    id: "polar-convention-binning",
    area: "Asset",
    when: "A wind rose bins direction rows.",
    expected: "8 sectors when every label is a cardinal/intercardinal, otherwise 16; the meteorological convention and sector size are stated; every row with a direction is counted exactly once.",
    reason: "Wind roses are read in two opposite conventions; binning must not lose or double-count rows.",
    scenarioId: "polar-wind-rose:default",
    covers: ["Mapping::Direction", "Mapping::Wind speed"],
    verify: () => {
      const m = modelFor("polar-wind-rose:default");
      if (m.kind !== "polar") return ok(false, "not polar");
      const rows = makeFixture("polar-wind-rose", "normal").dataset.rows.length;
      const counted = m.bins.reduce((a, b) => a + b.total, 0);
      const stated = m.table.notes.some((n) => /clockwise from north/.test(n)) && m.table.notes.some((n) => /sectors of/.test(n));
      return ok((m.bins.length === 8 || m.bins.length === 16) && stated && Math.abs(counted - rows) < 1e-9, `${m.bins.length} sectors, ${counted}/${rows} rows counted, convention stated=${stated}`);
    },
  },
  {
    id: "score-headline",
    area: "Asset",
    when: "A score indicator has a value.",
    expected: "The header shows the value with “/ max” and the range; the marker is clamped while the number is not.",
    reason: "A bar without its number and scale is not readable on its own.",
    scenarioId: "score-indicator:default",
    covers: ["KPI Display::KPI value field"],
    verify: () => {
      const m = modelFor("score-indicator:default");
      if (m.kind !== "score") return ok(false, "not score");
      const k = m.header.kpi;
      return ok(!!k && k.value === m.value && !!k.maxText && !!k.rangeText, k ? `${k.text} ${k.maxText ?? ""} (${k.rangeText ?? "no range"})` : "no headline");
    },
  },
  {
    id: "kpi-comparison-basis",
    area: "Asset",
    when: "Show comparison is on and a comparison value is mapped.",
    expected: "The delta sign matches the direction arrow, and the basis names the comparison column.",
    reason: "An arrow without its basis (vs what?) cannot be interpreted.",
    scenarioId: "kpi-card:default",
    covers: ["Mapping::Comparison value", "KPI card::Show comparison vs last period"],
    verify: () => {
      const m = modelFor("kpi-card:default");
      const c = m.header.kpi?.comparison ?? (m.kind === "kpi" ? m.kpi.comparison : null);
      if (!c) return ok(false, "no comparison");
      const dirOk = c.delta > 0 ? c.direction === "up" : c.delta < 0 ? c.direction === "down" : c.direction === "flat";
      return ok(dirOk && /^vs /.test(c.basis), `${c.text} ${c.direction} ${c.basis}`);
    },
  },
  {
    id: "scatter-size-area",
    area: "Data integrity",
    when: "Point size is mapped.",
    expected: "Mark area, not radius, grows linearly with the size value above a minimum legible area; missing sizes use the minimum.",
    reason: "Readers compare area; radius scaling exaggerates large values quadratically.",
    scenarioId: "scatter-plot:default",
    covers: ["Mapping::Point size"],
    verify: () => {
      const m = cart(modelFor("scatter-plot:default"));
      const { minR, maxR, sizeDomain } = m.scatter;
      const area = (v: number | null) => Math.PI * scatterRadius(v, sizeDomain, minR, maxR) ** 2;
      const base = area(0);
      const d1 = area(sizeDomain ? sizeDomain[1] / 4 : 0) - base;
      const d2 = area(sizeDomain ? sizeDomain[1] / 2 : 0) - base;
      const linear = sizeDomain !== null && Math.abs(d2 / d1 - 2) < 1e-6;
      return ok(linear && scatterRadius(null, sizeDomain, minR, maxR) === minR, `area(½max)−area(0) = ${(d2 / d1).toFixed(3)}× area(¼max)−area(0)`);
    },
  },
  {
    id: "progress-over-max",
    area: "Data integrity",
    when: "A progress value exceeds its maximum.",
    expected: "The bar is full, the label and data view keep the real share (e.g. 140%), and a note says the maximum was exceeded.",
    reason: "Clamp the drawing, never the number.",
    scenarioId: "progress-bar:default",
    covers: ["Mapping::X value", "Mapping::Max/Total"],
    verify: () => {
      const fx = makeFixture("progress-bar", "normal");
      const rows = fx.dataset.rows.map((r, i) => (i === 0 ? { ...r, value: Number(r.total) * 1.4 } : r));
      const m = buildChartModel({ visualId: "progress-bar", dataset: { ...fx.dataset, rows }, config: fx.mapping });
      if (m.kind !== "progress") return ok(false, "not progress");
      const share = m.rows[0].share ?? 0;
      return ok(Math.abs(share - 1.4) < 1e-9 && m.issues.some((i) => i.id === "progress-over") && m.table.rows[0].share.text === "140.0%", `share ${share}, table ${m.table.rows[0].share.text}`);
    },
  },
  {
    id: "range-annotation-stats",
    area: "Data integrity",
    when: "A Range chart shows an Average, Maximum or Minimum annotation.",
    expected: "Average is the mean of interval midpoints; Maximum is the highest High; Minimum is the lowest Low.",
    reason: "Range points have no single y value; the statistic must say which bound it uses.",
    scenarioId: "range:default",
    covers: ["Annotations::Show annotations", "Annotations::Source"],
    verify: () => {
      const stat = (source: string) => cart(modelFor("range:default", { config: { "Annotations::Show annotations": true, "Annotations::Source": source } }));
      const m = stat("Average");
      const pts = m.series.flatMap((s) => s.data).filter((d) => d.low != null && d.high != null);
      const mid = pts.reduce((a, d) => a + ((d.low as number) + (d.high as number)) / 2, 0) / pts.length;
      const hi = Math.max(...pts.map((d) => Math.max(d.low as number, d.high as number)));
      const lo = Math.min(...pts.map((d) => Math.min(d.low as number, d.high as number)));
      const got = [m.annotations[0]?.value, stat("Maximum").annotations[0]?.value, stat("Minimum").annotations[0]?.value];
      const close = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;
      return ok(close(got[0], mid) && close(got[1], hi) && close(got[2], lo), `avg ${got[0]?.toFixed(2)}, max ${got[1]}, min ${got[2]}`);
    },
  },
  {
    id: "flag-expression",
    area: "Asset",
    when: "A flag condition uses expression mode.",
    expected: "The expression is evaluated by the safe Llumen evaluator against the asset context; unknown names or syntax errors hide the flag and raise an issue instead of throwing or guessing.",
    reason: "Expressions are user input; they must never execute code or silently pass.",
    scenarioId: "kpi-card:default",
    covers: [],
    verify: () => {
      const good = evaluateExpression("value * 2 > 100", { value: 60 });
      const unknown = evaluateExpression("missing_name > 1", { value: 60 });
      const bad = evaluateExpression("value >", { value: 60 });
      const code = evaluateExpression("constructor.constructor('return 1')()", {});
      return ok(good.ok && good.value === true && !unknown.ok && !bad.ok && !code.ok, `good=${good.ok && good.value}, unknown=${unknown.ok}, syntax=${bad.ok}, code=${code.ok}`);
    },
  },
];

export function runBehaviorRules(): (BehaviorRule & { result: RuleResult })[] {
  return BEHAVIOR_RULES.map((r) => {
    try {
      return { ...r, result: r.verify() };
    } catch (e) {
      return { ...r, result: { pass: false, detail: `Threw: ${(e as Error).message}` } };
    }
  });
}
