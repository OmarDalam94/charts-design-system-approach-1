/**
 * Typed registry of the 17 chart-category assets the chart system renders.
 * `visualId` is the persisted asset identity; `chartId` is the legacy renderer
 * key and is not unique across categories (maps reuse several).
 */

import { visualTypeById } from "../visualCatalog";
import { fieldsForVisual, notionTypeForVisual } from "../visualSettingsCatalog";

export type ChartFamily =
  | "line"
  | "area"
  | "bar"
  | "hbar"
  | "scatter"
  | "range"
  | "donut"
  | "polar"
  | "sankey"
  | "progress"
  | "gauge"
  | "score"
  | "kpi"
  | "kpi-grid"
  | "legacy-kpi"
  | "availability"
  | "table";

export type ChartAssetDef = {
  visualId: string;
  chartId: string;
  label: string;
  family: ChartFamily;
  /** Notion settings type; Legacy KPI shares KPI Card's. */
  settingsType: string;
  cartesian: boolean;
  /** Supports a Series mapping (multiple series). */
  supportsSeries: boolean;
  /** Series counts exercised in the Lab when the asset supports series. */
  seriesCounts: number[];
  /** Category counts exercised in the Lab for category-driven assets. */
  categoryCounts: number[];
  /** Minimum meaningful plot size before the frame switches to a compact summary. */
  minPlot: { width: number; height: number };
  /** Short explanation of this asset's priority order when space runs out. */
  crowdingPriority: string[];
  notes?: string[];
};

const SHARED_CROWDING = [
  "Move side legend below the plot",
  "Collapse legend to one row with a Show all control",
  "Reduce tick density and abbreviate tick labels",
  "Hide colliding optional data labels (values stay in tooltip and data view)",
  "Clamp description and insight to one line",
  "Switch to compact summary with Expand / View data",
];

function def(
  visualId: string,
  family: ChartFamily,
  extra: Partial<Omit<ChartAssetDef, "visualId" | "family" | "label" | "chartId" | "settingsType">> = {},
): ChartAssetDef {
  const visual = visualTypeById(visualId);
  if (!visual) throw new Error(`Unknown visual ${visualId}`);
  return {
    visualId,
    chartId: visual.chartId,
    label: visual.label === "Legacy Kpi" ? "Legacy KPI" : visual.label,
    family,
    settingsType: notionTypeForVisual(visualId) ?? "",
    cartesian: false,
    supportsSeries: false,
    seriesCounts: [1],
    categoryCounts: [],
    minPlot: { width: 160, height: 120 },
    crowdingPriority: SHARED_CROWDING,
    ...extra,
  };
}

export const CHART_ASSETS: ChartAssetDef[] = [
  def("kpi-card", "kpi", { minPlot: { width: 120, height: 56 } }),
  def("kpi-grid", "kpi-grid", {
    categoryCounts: [1, 4, 12, 50],
    minPlot: { width: 140, height: 72 },
    crowdingPriority: ["Reflow tiles to fewer columns", "Scroll the tile region; never drop tiles", "Hide secondary text below 72px tile height"],
  }),
  def("legacy-kpi", "legacy-kpi", {
    minPlot: { width: 120, height: 56 },
    notes: ["Shares the KPI Card settings type; persisted visualId stays legacy-kpi."],
  }),
  def("vertical-bar", "bar", {
    cartesian: true,
    supportsSeries: true,
    seriesCounts: [1, 2, 5, 12],
    categoryCounts: [1, 5, 20, 100],
  }),
  def("horizontal-bar", "hbar", {
    cartesian: true,
    supportsSeries: true,
    seriesCounts: [1, 2, 5, 12],
    categoryCounts: [1, 5, 20, 100],
    crowdingPriority: [
      "Truncate long category labels (full text on focus and in data view)",
      "Scroll rows inside the plot at fixed row height",
      ...SHARED_CROWDING,
    ],
  }),
  def("line-chart", "line", {
    cartesian: true,
    supportsSeries: true,
    seriesCounts: [1, 2, 5, 12, 50],
    minPlot: { width: 160, height: 120 },
  }),
  def("area-chart", "area", {
    cartesian: true,
    supportsSeries: true,
    seriesCounts: [1, 2, 5, 12],
  }),
  def("scatter-plot", "scatter", { cartesian: true, minPlot: { width: 160, height: 140 } }),
  def("donut-chart", "donut", {
    categoryCounts: [1, 2, 5, 12, 30],
    minPlot: { width: 120, height: 120 },
    crowdingPriority: [
      "Move side legend below the ring",
      "Hide slice labels that do not fit their arc (values stay in legend, tooltip and data view)",
      ...SHARED_CROWDING.slice(1),
    ],
  }),
  def("progress-bar", "progress", { minPlot: { width: 140, height: 24 } }),
  def("gauge-linear", "gauge", {
    minPlot: { width: 120, height: 96 },
    notes: ["Vertical and circular are modes of one asset (Gauge type)."],
  }),
  def("score-indicator", "score", { minPlot: { width: 140, height: 32 } }),
  def("polar-wind-rose", "polar", { minPlot: { width: 140, height: 140 } }),
  def("range", "range", { cartesian: true, categoryCounts: [1, 6, 24] }),
  def("availability", "availability", {
    minPlot: { width: 160, height: 24 },
    crowdingPriority: ["Merge adjacent intervals into time buckets that keep any outage visible", "Hide period labels except endpoints", "Scroll rows"],
  }),
  def("sankey-chart", "sankey", {
    minPlot: { width: 260, height: 140 },
    crowdingPriority: ["Shorten node labels (full text on focus)", "Scroll the diagram horizontally at a minimum stage spacing", ...SHARED_CROWDING.slice(4)],
  }),
  def("table", "table", {
    minPlot: { width: 160, height: 96 },
    crowdingPriority: ["Scroll horizontally with a sticky header", "Paginate rows"],
  }),
];

export const CHART_ASSET_BY_ID: Record<string, ChartAssetDef> = Object.fromEntries(
  CHART_ASSETS.map((a) => [a.visualId, a]),
);

export function chartAsset(visualId: string): ChartAssetDef {
  const asset = CHART_ASSET_BY_ID[visualId];
  if (!asset) throw new Error(`Unknown chart asset “${visualId}”.`);
  return asset;
}

export function isChartAsset(visualId: string): boolean {
  return visualId in CHART_ASSET_BY_ID;
}

/** Legend positions the catalog allows for this asset, or null when it has no legend. */
export function legendPositionsFor(visualId: string): string[] | null {
  const field = fieldsForVisual(visualId).find((o) => o.group === "Legend" && o.name === "Position");
  return field ? field.values : null;
}
