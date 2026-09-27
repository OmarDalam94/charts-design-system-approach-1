/**
 * Visual settings catalog remapped from Notion
 * "Visualization Configuration Fields".
 * Configurable = Yes fields are the default controls.
 * Configurable = No fields are marked `advanced` and shown when the
 * modal-level Cmd+Ctrl+O shortcut is active.
 * Alias / collision rows and mapping fields that already exist as
 * Configurable = Yes are omitted.
 * Nav groups are Notion Sub Categories, filtered by the selected visual type.
 */

import type { ControlType, Opt } from "./chartModel";

export type NotionVisualType =
  | "All Charts & KPIs"
  | "All Data Tables"
  | "All Map Layers"
  | "Vertical Bar"
  | "Horizontal Bar"
  | "Progress Bar"
  | "Line"
  | "Area"
  | "Scatter"
  | "Pie/Donut"
  | "Gauge"
  | "Score Indicator"
  | "Polar"
  | "Range"
  | "Availability"
  | "Sankey"
  | "KPI Card"
  | "KPI Grid"
  | "Data Table"
  | "Points"
  | "Wind"
  | "Fences"
  | "Pillars"
  | "Areas"
  | "Heatmap"
  | "Discs"
  | "Arcs";

export const NOTION_TYPE_BY_VISUAL_ID: Record<string, NotionVisualType> = {
  "vertical-bar": "Vertical Bar",
  "horizontal-bar": "Horizontal Bar",
  "progress-bar": "Progress Bar",
  "line-chart": "Line",
  "area-chart": "Area",
  "scatter-plot": "Scatter",
  "donut-chart": "Pie/Donut",
  "gauge-linear": "Gauge",
  "gauge-circular": "Gauge",
  "score-indicator": "Score Indicator",
  "polar-wind-rose": "Polar",
  range: "Range",
  availability: "Availability",
  "sankey-chart": "Sankey",
  "kpi-card": "KPI Card",
  "kpi-grid": "KPI Grid",
  "legacy-kpi": "KPI Card",
  table: "Data Table",
  points: "Points",
  wind: "Wind",
  fences: "Fences",
  pillars: "Pillars",
  "map-area": "Areas",
  heatmap: "Heatmap",
  discs: "Discs",
  arcs: "Arcs",
};

const ALL_CHARTS_KPIS: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Gauge",
  "Score Indicator",
  "Polar",
  "Range",
  "Availability",
  "Sankey",
  "KPI Card",
  "KPI Grid",
];

const ALL_MAP_LAYERS: NotionVisualType[] = [
  "Arcs",
  "Discs",
  "Fences",
  "Heatmap",
  "Wind",
  "Points",
  "Areas",
  "Pillars",
];

const AXIS_CHARTS: NotionVisualType[] = ["Vertical Bar", "Horizontal Bar", "Line", "Area", "Scatter", "Range"];
const STORY_KPI: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Score Indicator",
  "Range",
  "Sankey",
];
const COLOR_MODE: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Gauge",
  "Polar",
  "Availability",
  "Sankey",
];
const LEGEND: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Range",
  "Availability",
  "Sankey",
];
const BADGE: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Gauge",
  "Score Indicator",
  "Polar",
  "Range",
  "Availability",
  "Sankey",
  "KPI Card",
];
const TOOLTIPS: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Gauge",
  "Score Indicator",
  "Polar",
  "Range",
  "Sankey",
];
const BARS: NotionVisualType[] = ["Vertical Bar", "Horizontal Bar"];
const LINE_AREA: NotionVisualType[] = ["Line", "Area"];
const MAP_COLOR: NotionVisualType[] = ["Arcs", "Discs", "Fences", "Heatmap", "Wind", "Points", "Areas"];
const MAP_TOOLTIPS: NotionVisualType[] = ["Arcs", "Discs", "Fences", "Heatmap", "Pillars", "Points", "Areas"];

export const SUBCATEGORY_ORDER = [
  "Mapping",
  "KPI Display",
  "Colors",
  "Color",
  "Layout & visibility",
  "Legend",
  "Status badge",
  "Sankey",
  "Bar",
  "Line",
  "Scatter",
  "Pie / Donut",
  "Meter & Labels",
  "Track & marker styling",
  "Bar gradient",
  "KPI card",
  "KPI Grid",
  "Status",
  "Scaling / axes",
  "Tooltips",
  "Annotations",
  "Line Customization",
  "Height",
  "Size",
  "Disc Scaling",
  "Disc ring",
  "Ground disc",
  "Marker Shape",
  "Marker appearance",
  "Heatmap Style",
  "Bin & extrusion",
  "Contour Terrain",
  "Extrusion",
  "Animation",
  "Zoom Scaling",
  "Advanced",
  "Map Legend",
  "Flags",
] as const;

type VisibleWhen = { group: string; name: string; is: string | string[] };

type FieldDef = {
  name: string;
  desc?: string;
  control: ControlType;
  values?: string[];
  valuesByType?: Partial<Record<NotionVisualType, string[]>>;
  subCategory: string;
  types: NotionVisualType[];
  required?: boolean;
  advanced?: boolean;
  def?: boolean;
  defaultValue?: unknown;
  editableValue?: boolean;
  visibleWhen?: VisibleWhen;
};

const f = (
  name: string,
  control: ControlType,
  subCategory: string,
  types: NotionVisualType[],
  extra: Omit<FieldDef, "name" | "control" | "subCategory" | "types"> = {},
): FieldDef => ({ name, control, subCategory, types, ...extra });

const FIELDS: FieldDef[] = [
  /* ---- Mapping (shared + per type) ---- */
  f("X axis", "field", "Mapping", ["Vertical Bar", "Line", "Area", "Range"], {
    desc: "Categorical, datetime or numeric column.",
    required: true,
  }),
  f("Y axis", "field", "Mapping", ["Vertical Bar", "Line", "Area"], {
    desc: "Numeric column. Skipped when aggregation is Count.",
    required: true,
  }),
  f("Series", "field", "Mapping", ["Vertical Bar", "Horizontal Bar", "Line", "Area"], {
    desc: "Categorical column, ≤50 unique values.",
  }),
  f("Max/Total", "field", "Mapping", BARS.concat(["Progress Bar"]), {
    desc: "Numeric column used as each bar’s maximum / total. The preview fills value against this ceiling.",
  }),
  f("Reference value", "field", "Mapping", ["Line", "Area", "Range"], {
    desc: "Draws a reference line.",
  }),
  f("X value", "field", "Mapping", ["Horizontal Bar", "Progress Bar", "Scatter"], {
    desc: "Numeric column.",
    required: true,
  }),
  f("Y category", "field", "Mapping", ["Horizontal Bar", "Progress Bar"], {
    desc: "Used when stacked or aggregation is Count.",
  }),
  f("Y value", "field", "Mapping", ["Scatter"], {
    desc: "Skipped when aggregation is Count.",
    required: true,
  }),
  f("Point size", "field", "Mapping", ["Scatter"]),
  f("Color/Category", "field", "Mapping", ["Scatter"]),
  f("Category", "field", "Mapping", ["Pie/Donut"], { required: true }),
  f("Value", "field", "Mapping", ["Pie/Donut", "Gauge", "Availability", "KPI Card", "KPI Grid"], {
    required: true,
  }),
  f("Number of stages", "dropdown", "Mapping", ["Sankey"], {
    desc: "Choose between 2 and 8 Sankey stages.",
    values: ["2", "3", "4", "5", "6", "7", "8"],
    defaultValue: "2",
  }),
  f("Source", "field", "Mapping", ["Sankey"], { required: true }),
  f("Stage 2", "field", "Mapping", ["Sankey"], {
    required: true,
    visibleWhen: { group: "Mapping", name: "Number of stages", is: ["3", "4", "5", "6", "7", "8"] },
  }),
  f("Stage 3", "field", "Mapping", ["Sankey"], {
    required: true,
    visibleWhen: { group: "Mapping", name: "Number of stages", is: ["4", "5", "6", "7", "8"] },
  }),
  f("Stage 4", "field", "Mapping", ["Sankey"], {
    required: true,
    visibleWhen: { group: "Mapping", name: "Number of stages", is: ["5", "6", "7", "8"] },
  }),
  f("Stage 5", "field", "Mapping", ["Sankey"], {
    required: true,
    visibleWhen: { group: "Mapping", name: "Number of stages", is: ["6", "7", "8"] },
  }),
  f("Stage 6", "field", "Mapping", ["Sankey"], {
    required: true,
    visibleWhen: { group: "Mapping", name: "Number of stages", is: ["7", "8"] },
  }),
  f("Stage 7", "field", "Mapping", ["Sankey"], {
    required: true,
    visibleWhen: { group: "Mapping", name: "Number of stages", is: "8" },
  }),
  f("Target", "field", "Mapping", ["Sankey"], { required: true }),
  f("Value", "field", "Mapping", ["Sankey"], { required: true }),
  f("Unit", "field", "Mapping", ["Gauge", "KPI Card", "KPI Grid"]),
  f("Status", "field", "Mapping", ["Gauge", "KPI Grid"]),
  f("Min field", "field", "Mapping", ["Gauge"], {
    desc: "Numeric column for the gauge minimum. Empty uses the Min fallback.",
  }),
  f("Max field", "field", "Mapping", ["Gauge"], {
    desc: "Numeric column for the gauge maximum. Empty uses the Max fallback.",
  }),
  f("Min", "number", "Mapping", ["Gauge"], {
    desc: "Fallback minimum when Min field is empty.",
    defaultValue: "0",
  }),
  f("Max", "number", "Mapping", ["Gauge"], {
    desc: "Fallback maximum when Max field is empty.",
    defaultValue: "100",
  }),
  f("Value calculation", "dropdown", "Mapping", ["KPI Card"], {
    values: ["First row", "Last row", "Maximum", "Minimum", "Sum"],
    defaultValue: "First row",
  }),
  f("Max value", "field", "Mapping", ["KPI Card"]),
  f("Comparison value", "field", "Mapping", ["KPI Card"]),
  f("Metric label", "field", "Mapping", ["KPI Grid"], { required: true }),
  f("Secondary label/context", "field", "Mapping", ["KPI Grid"]),
  f("Low value", "field", "Mapping", ["Range"], { required: true }),
  f("High value", "field", "Mapping", ["Range"], { required: true }),
  f("Direction", "field", "Mapping", ["Polar"], { required: true }),
  f("Wind speed", "field", "Mapping", ["Polar"], { required: true }),
  f("Band", "field", "Mapping", ["Polar"], {
    desc: "Optional speed-band or category column.",
  }),
  f("Frequency", "field", "Mapping", ["Polar"], {
    desc: "Unmapped — each row counts as 1.",
  }),
  f("Visible columns", "multi", "Mapping", ["Data Table"], {
    desc: "Multi-select with Select all / Clear.",
    required: true,
    values: [
      "district",
      "region",
      "category",
      "timestamp",
      "value",
      "amount",
      "incidents",
      "completion_rate",
      "status",
      "unit",
      "series",
      "predicted",
      "actual",
      "name",
      "type",
      "direction",
      "wind_speed",
      "origin",
      "destination",
    ],
  }),
  f("Header label per column", "text", "Mapping", ["Data Table"], {
    desc: "Blank uses the raw column name.",
  }),
  f("Origin", "field", "Mapping", ["Arcs"], { required: true }),
  f("Destination", "field", "Mapping", ["Arcs"], { required: true }),
  f("Geometry Column", "field", "Mapping", ["Arcs"]),
  f("Location field", "field", "Mapping", ["Discs", "Points"], { required: true }),
  f("Coordinates (Geometry)", "field", "Mapping", ["Fences"], { required: true }),
  f("Location", "field", "Mapping", ["Pillars"], { required: true }),
  f("Value", "field", "Mapping", ["Pillars", "Areas"]),
  f("Geometry", "field", "Mapping", ["Areas"], { required: true }),
  f("Name", "field", "Mapping", ["Areas"]),
  f("Type", "field", "Mapping", ["Areas"]),
  f("Coordinates", "field", "Mapping", ["Heatmap", "Wind"], { required: true }),
  f("Intensity Value Field", "field", "Mapping", ["Heatmap"]),
  f("U Component (Eastward)", "field", "Mapping", ["Wind"]),
  f("V Component (Northward)", "field", "Mapping", ["Wind"]),
  f("Aggregation", "dropdown", "Mapping", ["All Charts & KPIs"], {
    desc: "How to combine rows: None (raw), Sum, Average, Min, Max, Count.",
    values: ["None (raw value)", "Sum", "Average", "Min", "Max", "Count"],
    defaultValue: "None (raw value)",
  }),
  f(
    "Number notation",
    "dropdown",
    "Mapping",
    ALL_CHARTS_KPIS.concat(ALL_MAP_LAYERS),
    {
      desc: "How numerical values are displayed throughout the visual asset.",
      values: [
        "Compact (5.7M)",
        "Full number (5,700,000)",
      ],
      defaultValue: "Compact (5.7M)",
    },
  ),
  f("Y-axis values (ML only)", "segmented", "Mapping", ALL_CHARTS_KPIS.filter((type) => type !== "Sankey"), {
    desc: "For ML-prediction sources: Predicted only / Actual only / Actual vs predicted.",
    values: ["Predicted only", "Actual only", "Actual vs predicted"],
  }),

  /* ---- KPI Display ---- */
  f("KPI value field", "field", "KPI Display", STORY_KPI, {
    desc: "Numeric column for the headline number.",
  }),
  f("KPI value calculation", "dropdown", "KPI Display", STORY_KPI, {
    values: ["Hidden unless manual value is set", "Last row", "First row", "Maximum", "Minimum", "Sum"],
    defaultValue: "Sum",
  }),
  f("KPI unit field", "field", "KPI Display", STORY_KPI),
  f("KPI min value field", "field", "KPI Display", STORY_KPI, {
    desc: "Column for the range minimum. On Score Indicator this also sets the gradient bar's low end.",
  }),
  f("KPI max value field", "field", "KPI Display", STORY_KPI, {
    desc: "Column for the range maximum. On Score Indicator this also sets the gradient bar's high end.",
  }),
  f("Manual override", "toggle", "KPI Display", STORY_KPI, {
    desc: "Replace mapped KPI value, range, and unit with static values.",
    def: false,
  }),
  f("Value", "text", "KPI Display", STORY_KPI, {
    desc: "Headline number shown on the story card.",
    visibleWhen: { group: "KPI Display", name: "Manual override", is: "true" },
  }),
  f("Min", "text", "KPI Display", STORY_KPI, {
    desc: "Manual minimum for range context and score scale.",
    visibleWhen: { group: "KPI Display", name: "Manual override", is: "true" },
  }),
  f("Max", "text", "KPI Display", STORY_KPI, {
    desc: "Manual maximum for range context and score scale.",
    visibleWhen: { group: "KPI Display", name: "Manual override", is: "true" },
  }),
  f("Unit", "text", "KPI Display", STORY_KPI, {
    desc: "Unit label, e.g. % or M AED.",
    visibleWhen: { group: "KPI Display", name: "Manual override", is: "true" },
  }),

  /* ---- Colors ---- */
  f("Palette", "color", "Colors", COLOR_MODE, {
    desc: "Pick a palette, then apply it as a single color, a gradient, or discrete steps.",
  }),

  /* ---- Layout & visibility ---- */
  f("Show insight", "toggle", "Layout & visibility", ["All Charts & KPIs"], {
    desc: "Footer caption from the mapped Insight column, or the Insight field in General Info as fallback.",
  }),
  f("Show data labels", "toggle", "Layout & visibility", ["All Charts & KPIs"], {
    desc: "Value labels on marks (also drives values on bars).",
    def: false,
  }),

  /* ---- Legend ---- */
  f("Show legend", "toggle", "Legend", LEGEND, {
    desc: "Hidden entirely for Progress Bar and horizontal category-stack bars.",
    def: false,
  }),
  f("Position", "segmented", "Legend", LEGEND, {
    values: ["Top", "Bottom"],
    valuesByType: { "Pie/Donut": ["Left", "Right"] },
    visibleWhen: { group: "Legend", name: "Show legend", is: "true" },
  }),
  f("Content", "multi", "Legend", LEGEND, {
    desc: "Show labels · Show values · Show percentages.",
    values: ["Show labels", "Show values", "Show percentages"],
    visibleWhen: { group: "Legend", name: "Show legend", is: "true" },
  }),

  /* ---- Status badge ---- */
  f("Show status badge", "toggle", "Status badge", BADGE, {
    desc: "One toggle fans out to the renderer and KPI-card paths.",
  }),
  f("Text source", "dropdown", "Status badge", BADGE, {
    values: ["Specific column", "Manual text", "Template"],
    defaultValue: "Specific column",
    visibleWhen: { group: "Status badge", name: "Show status badge", is: "true" },
  }),
  f("Column", "field", "Status badge", BADGE, {
    desc: "Column that supplies the badge text.",
    visibleWhen: { group: "Status badge", name: "Text source", is: "Specific column" },
  }),
  f("Color Source", "field", "Status badge", BADGE, {
    desc: "Numeric column → thresholds, text column → value map.",
    visibleWhen: { group: "Status badge", name: "Show status badge", is: "true" },
  }),
  f("Color thresholds", "repeatable", "Status badge", BADGE, {
    desc: "min/max → color, first match wins, inclusive bounds.",
    visibleWhen: { group: "Status badge", name: "Show status badge", is: "true" },
  }),
  f("Template", "text", "Status badge", BADGE, {
    desc: "Supports tokens like {status}, {value}, {columnName}.",
    defaultValue: "{status} · {value}",
    visibleWhen: { group: "Status badge", name: "Text source", is: "Template" },
  }),
  f("Fallback", "text", "Status badge", BADGE, {
    desc: "Constant badge text used when Text source is Manual text.",
    visibleWhen: { group: "Status badge", name: "Text source", is: "Manual text" },
  }),

  /* ---- Sankey ---- */
  f("Node width", "slider", "Sankey", ["Sankey"], {
    desc: "6–30 px. Default 14.",
    advanced: true,
  }),
  f("Node gap", "slider", "Sankey", ["Sankey"], {
    desc: "4–32 px. Default 12.",
    advanced: true,
  }),
  f("Link opacity", "slider", "Sankey", ["Sankey"], {
    desc: "10–100%. Default 55.",
  }),
  f("Link curvature", "slider", "Sankey", ["Sankey"], {
    desc: "0–100%. Default 55.",
    advanced: true,
  }),
  f("Show node labels", "toggle", "Sankey", ["Sankey"]),

  /* ---- Bar ---- */
  f("Show values on bars", "toggle", "Bar", BARS, { def: false }),
  f("Sort by value", "toggle", "Bar", BARS, { def: false }),
  f("Sort order", "segmented", "Bar", BARS, {
    values: ["Ascending", "Descending"],
    defaultValue: "Descending",
    visibleWhen: { group: "Bar", name: "Sort by value", is: "true" },
  }),
  f("Stack series", "toggle", "Bar", BARS, { def: false }),
  f("Top N categories", "slider", "Bar", BARS, {
    desc: "0–100 (0 = auto by card height).",
  }),
  f("Background track style", "segmented", "Bar", BARS, {
    values: ["None", "Full", "Segmented"],
    defaultValue: "None",
  }),
  f("Layout", "segmented", "Bar", ["Horizontal Bar"], {
    values: ["Inline", "Cartesian"],
  }),
  f("KPI number mode", "segmented", "Bar", ["Progress Bar"], {
    values: ["Percentage", "Value of total"],
  }),

  /* ---- Line / Area / Scatter / Pie ---- */
  f("Chart style", "segmented", "Line", LINE_AREA, {
    values: ["Line", "Area"],
  }),
  f("Show data points", "toggle", "Line", LINE_AREA, { def: false }),
  f("Curve interpolation", "dropdown", "Line", LINE_AREA, {
    values: ["Smooth", "Linear", "Step", "Step before", "Step after", "Natural"],
    defaultValue: "Smooth",
  }),
  f("Line + Area colors", "colorPair", "Colors", ["Area"], {
    desc: "Stroke and fill.",
    advanced: true,
  }),
  f("Fill opacity", "slider", "Colors", ["Area"], {
    desc: "0–100%.",
    advanced: true,
  }),
  f("Min bubble radius", "slider", "Scatter", ["Scatter"], {
    desc: "1–20 px. Default 4.",
  }),
  f("Max bubble radius", "slider", "Scatter", ["Scatter"], {
    desc: "10–100 px. Default 18.",
  }),
  f("Label format", "segmented", "Pie / Donut", ["Pie/Donut"], {
    values: ["Percentage", "Value", "Both"],
  }),

  /* ---- Gauge / Score / Polar / Range ---- */
  f("Gauge type", "dropdown", "Meter & Labels", ["Gauge"], {
    values: ["Vertical gauge", "Circular gauge"],
    defaultValue: "Vertical gauge",
  }),
  f("Movement state", "dropdown", "Meter & Labels", ["Gauge"], {
    values: ["Rising", "Falling", "Stabilizing"],
    defaultValue: "Rising",
  }),
  f("Show center value", "toggle", "Meter & Labels", ["Gauge"]),
  f("Tick subdivisions", "slider", "Meter & Labels", ["Gauge"], {
    desc: "12–120.",
  }),
  f("Show marker", "toggle", "Track & marker styling", ["Score Indicator"]),
  f("Fill track to marker", "toggle", "Track & marker styling", ["Score Indicator"], { def: false }),
  f("Bar gradient", "gradient", "Bar gradient", ["Range"], {
    desc: "Value-mapped gradient editor.",
  }),

  /* ---- KPI card / grid ---- */
  f("Value format", "dropdown", "KPI card", ["KPI Card"], {
    values: ["Number", "Currency (USD)", "Percentage", "Duration (minutes)"],
  }),
  f("Show unit", "toggle", "KPI card", ["KPI Card"]),
  f("Show comparison vs last period", "toggle", "KPI card", ["KPI Card"], {
    desc: "Uses mapped comparison value.",
  }),
  f("Show status pill", "toggle", "KPI Grid", ["KPI Grid"]),
  f("Highlight critical tiles (glow)", "toggle", "KPI Grid", ["KPI Grid"], { def: false }),
  f("Status → tile accent color", "repeatable", "Status", ["KPI Grid"], {
    desc: "Map each status string to a tile accent color.",
  }),

  /* ---- Scaling / axes ---- */
  f("Manual range (min/max)", "number", "Scaling / axes", AXIS_CHARTS, {
    desc: "Hard-set the domain; blank = auto.",
  }),
  f("Show Axes Labels", "toggle", "Scaling / axes", AXIS_CHARTS, { def: false }),
  f("X axis label", "text", "Scaling / axes", AXIS_CHARTS, {
    desc: "Caption under the X axis. Empty uses the mapped field name.",
    visibleWhen: { group: "Scaling / axes", name: "Show Axes Labels", is: "true" },
  }),
  f("Y axis label", "text", "Scaling / axes", AXIS_CHARTS, {
    desc: "Caption along the Y axis. Empty uses the mapped field name.",
    visibleWhen: { group: "Scaling / axes", name: "Show Axes Labels", is: "true" },
  }),
  f("Format", "text", "Scaling / axes", AXIS_CHARTS, {
    desc: "D3 number format for ticks (e.g. .2f, $,.0f, %).",
  }),
  f("Tick mode", "segmented", "Scaling / axes", AXIS_CHARTS, {
    values: ["Standard", "Endpoints Only"],
    defaultValue: "Standard",
  }),
  f("Show ticks / tick labels / gridlines", "multi", "Scaling / axes", AXIS_CHARTS, {
    desc: "Three independent toggles.",
    values: ["Show Ticks", "Show Tick Labels", "Show Grid Lines"],
  }),

  /* ---- Tooltips / Annotations ---- */
  f("Show tooltips", "toggle", "Tooltips", TOOLTIPS.concat(MAP_TOOLTIPS)),
  f("Tooltip format", "text", "Tooltips", ["Vertical Bar", "Horizontal Bar", "Line", "Area", "Scatter", "Pie/Donut"], {
    desc: "D3 number format for the value (e.g. .0f), or a template with {value}, {category}, {timestamp}, {unit}, {status}.",
    defaultValue: ".0f",
    visibleWhen: { group: "Tooltips", name: "Show tooltips", is: "true" },
  }),
  f("Tooltip content fields", "multi", "Tooltips", TOOLTIPS, {
    desc: "Hover shows these mock-data columns: value, category, timestamp, unit, status.",
    values: ["value", "category", "timestamp", "unit", "status"],
    defaultValue: ["value", "category", "timestamp"],
    visibleWhen: { group: "Tooltips", name: "Show tooltips", is: "true" },
  }),
  f("Show annotations", "toggle", "Annotations", AXIS_CHARTS, {
    desc: "Reference lines and captions on the plot.",
    def: false,
  }),
  f("Source", "dropdown", "Annotations", AXIS_CHARTS, {
    values: ["Average", "Maximum", "Minimum", "Linear trend (OLS)", "Manual position"],
    defaultValue: "Average",
    visibleWhen: { group: "Annotations", name: "Show annotations", is: "true" },
  }),
  f("Axis (manual only)", "dropdown", "Annotations", AXIS_CHARTS, {
    values: ["X only (vertical)", "Y only (horizontal)", "X and Y (cross)"],
    defaultValue: "Y only (horizontal)",
    visibleWhen: { group: "Annotations", name: "Source", is: "Manual position" },
  }),
  f("X position / Y value (manual)", "text", "Annotations", AXIS_CHARTS, {
    desc: "X: band/category key · Y: number.",
    visibleWhen: { group: "Annotations", name: "Source", is: "Manual position" },
  }),
  f("Line shape (avg/max/min)", "dropdown", "Annotations", AXIS_CHARTS, {
    values: ["Straight (full width)", "Follow categories (line)"],
    defaultValue: "Straight (full width)",
    visibleWhen: { group: "Annotations", name: "Show annotations", is: "true" },
  }),
  f("Label", "text", "Annotations", AXIS_CHARTS, {
    desc: "Caption text.",
    visibleWhen: { group: "Annotations", name: "Show annotations", is: "true" },
  }),
  f("Unit", "text", "Annotations", AXIS_CHARTS, {
    desc: "Appended after the value.",
    visibleWhen: { group: "Annotations", name: "Show annotations", is: "true" },
  }),
  f("Show caption on chart", "toggle", "Annotations", AXIS_CHARTS, {
    visibleWhen: { group: "Annotations", name: "Show annotations", is: "true" },
  }),

  /* ---- Map: Color ---- */
  f("Color Source", "dropdown", "Color", MAP_COLOR, {
    values: ["Value", "Type"],
    defaultValue: "Value",
  }),
  f("Palette", "color", "Color", MAP_COLOR, {
    desc: "Pick a palette, then apply it as a single color, a gradient, or discrete steps.",
    visibleWhen: { group: "Color", name: "Color Source", is: "Value" },
  }),
  f("Categorical color stops + Other", "colorList", "Color", MAP_COLOR, {
    visibleWhen: { group: "Color", name: "Color Source", is: "Type" },
  }),
  f("Color by category field", "field", "Color", ["Points"]),
  f("Marker color", "color", "Color", ["Points"]),
  f("Normalize values", "toggle", "Color", ["Pillars"]),
  f("Border Thickness", "slider", "Color", ["Arcs"], { desc: "0–10 px." }),

  /* ---- Map type-specific ---- */
  f("Source → Destination Indicator", "toggle", "Line Customization", ["Arcs"], {
    desc: "Play a shimmer along each arc from source to destination.",
    def: false,
  }),
  f("Height Exaggeration", "toggle", "Height", ["Fences"], { def: false }),
  f("Fence height", "slider", "Height", ["Fences"], {
    desc: "0–5000.",
    visibleWhen: { group: "Height", name: "Height Exaggeration", is: "true" },
  }),
  f("Max Height", "slider", "Size", ["Pillars"], { desc: "0–8000. Default 3000." }),
  f("Disc radius multiplier", "slider", "Disc Scaling", ["Discs"], { desc: "0.2–4. Default 1.2." }),
  f("Show endpoint discs", "toggle", "Disc ring", ["Arcs"], { def: false }),
  f("Endpoint disc scaling", "slider", "Disc ring", ["Arcs"], {
    desc: "0.2–4. Default 1.2.",
    visibleWhen: { group: "Disc ring", name: "Show endpoint discs", is: "true" },
  }),
  f("Show ground disc", "toggle", "Ground disc", ["Points"]),
  f("Fill style", "segmented", "Ground disc", ["Points"], { values: ["None", "Solid"] }),
  f("Disc color", "color", "Ground disc", ["Points"]),
  f("Disc radius multiplier", "slider", "Ground disc", ["Points"], { desc: "0.2–4. Default 1.2." }),
  f("Disc fill opacity", "slider", "Ground disc", ["Points"], { desc: "0–1. Default 0.18." }),
  f("Ground disc scaling", "repeatable", "Ground disc", ["Points"]),
  f("Marker type", "segmented", "Marker Shape", ["Points"], { values: ["2D", "3D"] }),
  f("2D shape", "dropdown", "Marker Shape", ["Points"], { values: ["Circle", "Square", "Diamond"] }),
  f("3D shape", "dropdown", "Marker Shape", ["Points"], { values: ["Sphere", "Cube", "Cone"] }),
  f("Empty filled shape (no icon)", "toggle", "Marker Shape", ["Points"], { def: false }),
  f("Icon mode", "segmented", "Marker Shape", ["Points"], {
    values: ["Static", "By category"],
    visibleWhen: { group: "Marker Shape", name: "Empty filled shape (no icon)", is: "true" },
  }),
  f("Icons", "dropdown", "Marker Shape", ["Points"], {
    values: ["MapPin", "Circle", "Warning", "Flag"],
    defaultValue: "MapPin",
    visibleWhen: { group: "Marker Shape", name: "Empty filled shape (no icon)", is: "true" },
  }),
  f("Icon category field + mapping", "colorList", "Marker Shape", ["Points"], {
    visibleWhen: { group: "Marker Shape", name: "Empty filled shape (no icon)", is: "true" },
  }),
  f("Point Size", "slider", "Marker appearance", ["Points"], { desc: "0.2–8. Default 1.2." }),
  f("Marker size by data", "repeatable", "Marker appearance", ["Points"]),
  f("Style", "segmented", "Heatmap Style", ["Heatmap"], {
    values: ["Pond", "Grid", "Contour"],
    defaultValue: "Pond",
  }),
  f("Gradient fill", "toggle", "Bin & extrusion", ["Heatmap"], { def: false }),
  f("3D extrusion", "toggle", "Bin & extrusion", ["Heatmap"]),
  f("Elevation Scale", "slider", "Bin & extrusion", ["Heatmap"], { desc: "Default 500." }),
  f("Color Aggregation", "dropdown", "Bin & extrusion", ["Heatmap"], {
    values: ["SUM", "MEAN", "MAX", "MIN", "COUNT"],
    defaultValue: "SUM",
  }),
  f("Elevation Aggregation", "dropdown", "Bin & extrusion", ["Heatmap"], {
    values: ["SUM", "MEAN", "MAX", "MIN", "COUNT"],
    defaultValue: "SUM",
  }),
  f("Coverage", "slider", "Bin & extrusion", ["Heatmap"], { desc: "0–1. Default 0.95." }),
  f("Cell size", "slider", "Bin & extrusion", ["Heatmap"], { desc: "Default 1000." }),
  f("Band width", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 0.06." }),
  f("Contour aggregation", "dropdown", "Contour Terrain", ["Heatmap"], {
    values: ["SUM", "MEAN", "MAX", "MIN", "COUNT"],
    defaultValue: "SUM",
  }),
  f("Cell Size (m)", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 1000." }),
  f("Max Height", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 500." }),
  f("Band count", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 8." }),
  f("Extrusion mode", "segmented", "Extrusion", ["Areas"], {
    values: ["None", "Fixed height", "Data"],
  }),
  f("Extrusion scaling", "slider", "Extrusion", ["Areas"], {
    desc: "0–100 m. Default 50.",
    editableValue: true,
    visibleWhen: { group: "Extrusion", name: "Extrusion mode", is: ["Fixed height", "Height"] },
  }),
  f("Data range", "repeatable", "Extrusion", ["Areas"], {
    visibleWhen: { group: "Extrusion", name: "Extrusion mode", is: "Data" },
  }),
  f("Particle Density", "slider", "Animation", ["Wind"], { desc: "Default 16384." }),
  f("Trail Length", "slider", "Animation", ["Wind"], { desc: "Default 0.996." }),
  f("Animation Speed", "slider", "Animation", ["Wind"], { desc: "Default 0.20." }),
  f("Highlight borders", "toggle", "Advanced", ["Areas"], { def: false }),
  f("Level of distance (zoom visibility)", "slider", "Advanced", ["Areas", "Points"], {
    desc: "0 = off.",
    def: false,
  }),
  f("Falloff Rate", "slider", "Advanced", ["Heatmap"], { desc: "Default 0.2." }),
  f("Sprites per Point", "slider", "Advanced", ["Heatmap"], { desc: "Default 1." }),
  f("Size Multiplier", "slider", "Advanced", ["Heatmap"], { desc: "Default 1.0." }),
  f("Zoom scaling", "repeatable", "Zoom Scaling", ["All Map Layers"]),
  f("Show legend in Map Data", "toggle", "Map Legend", ["All Map Layers"]),
  f("Tooltip content fields", "multi", "Tooltips", MAP_TOOLTIPS, {
    desc: "Hover shows these mock-data columns: name, value, type, status.",
    values: ["name", "value", "type", "status"],
    defaultValue: ["name", "value", "type"],
    visibleWhen: { group: "Tooltips", name: "Show tooltips", is: "true" },
  }),

  /* ---- Advanced: Mapping ---- */
  f("Insight field", "field", "Mapping", ["All Charts & KPIs"], {
    desc: "Column used for footer / insight copy. General Info is the fallback when empty.",
    advanced: true,
  }),
  f("Hover tooltip field", "field", "Mapping", ["KPI Grid"], {
    desc: "Column shown on tile hover. Pair with Show hover tooltip.",
    advanced: true,
  }),

  /* ---- Advanced: Layout & visibility ---- */
  f("Show card outline", "toggle", "Layout & visibility", ["All Charts & KPIs"], {
    desc: "Outline around the asset when it is not in card mode.",
    advanced: true,
    def: false,
  }),
  f("Chart header icon", "text", "Layout & visibility", ["All Charts & KPIs"], {
    desc: "LlumenIcon name rendered before the chart title, e.g. folder.",
    advanced: true,
  }),
  f("Show header info icon", "toggle", "Layout & visibility", ["All Charts & KPIs"], {
    desc: "Trailing info icon in the header row.",
    advanced: true,
    def: false,
  }),

  /* ---- Advanced: Bar ---- */
  f("Stroke width", "slider", "Bar", BARS, {
    desc: "0–10 px (0 = hidden). Default 0.",
    advanced: true,
  }),
  f("Show segment separators", "toggle", "Bar", ["Progress Bar"], {
    desc: "Draw dividers between progress segments.",
    advanced: true,
  }),
  f("Category label color", "color", "Bar", ["Horizontal Bar"], {
    desc: "Color of the category labels beside each bar.",
    advanced: true,
    defaultValue: "#ffffff",
  }),
  f("Value label unit", "text", "Bar", ["Horizontal Bar"], {
    desc: "Suffix appended to each value label, e.g. %.",
    advanced: true,
  }),
  f("Value label position", "dropdown", "Bar", BARS.concat(["Progress Bar"]), {
    desc: "Where value labels sit relative to the bar.",
    values: ["Above bar", "Inline"],
    valuesByType: {
      "Horizontal Bar": ["Inline", "Above bar"],
      "Progress Bar": ["Inline", "Above bar"],
    },
    advanced: true,
  }),
  f("Segment count", "number", "Bar", ["Availability"], {
    desc: "How many rounded segments the availability track is split into.",
    advanced: true,
    defaultValue: "48",
  }),
  f("Corner radius", "slider", "Bar", ["Availability"], {
    desc: "0–40 px. Default 24.",
    advanced: true,
  }),
  f("Segment gap", "slider", "Bar", ["Availability"], {
    desc: "0–12 px. Default 3.",
    advanced: true,
  }),
  f("Segment width", "slider", "Bar", ["Availability"], {
    desc: "1–12 px. Default 3.",
    advanced: true,
  }),

  /* ---- Advanced: Line / Scatter / Pie ---- */
  f("Stroke width", "slider", "Line", LINE_AREA, {
    desc: "0–10 px (0 = hidden). Default 2.",
    advanced: true,
  }),
  f("Show grid lines", "toggle", "Line", ["Area"], {
    desc: "Area-only grid overlay. Scaling / axes also has a shared grid toggle.",
    advanced: true,
  }),
  f("Point fill", "color", "Line", LINE_AREA, {
    desc: "Fill color of line/area data points.",
    advanced: true,
    defaultValue: "#ffc401",
    visibleWhen: { group: "Line", name: "Show data points", is: "true" },
  }),
  f("Point stroke", "color", "Line", LINE_AREA, {
    desc: "Stroke color of line/area data points.",
    advanced: true,
    defaultValue: "#ffc401",
    visibleWhen: { group: "Line", name: "Show data points", is: "true" },
  }),
  f("Point stroke width", "slider", "Line", LINE_AREA, {
    desc: "0–8 px. Default 2.",
    advanced: true,
    visibleWhen: { group: "Line", name: "Show data points", is: "true" },
  }),
  f("Point radius", "slider", "Line", LINE_AREA, {
    desc: "1–16 px. Default 5.",
    advanced: true,
    visibleWhen: { group: "Line", name: "Show data points", is: "true" },
  }),
  f("Fill color", "color", "Scatter", ["Scatter"], {
    desc: "Marker fill. Solid or a translucent rgba.",
    advanced: true,
    defaultValue: "rgba(63, 167, 160, 0.3)",
  }),
  f("Point shape", "segmented", "Scatter", ["Scatter"], {
    values: ["Circle", "Square", "Triangle"],
    defaultValue: "Circle",
    advanced: true,
  }),
  f("Inner radius", "slider", "Pie / Donut", ["Pie/Donut"], {
    desc: "0–0.9. Default 0.05. Values ≥0.3 read as a donut.",
    advanced: true,
  }),

  /* ---- Advanced: Colors (gradient type + Polar intensity ramp) ---- */
  f("Gradient type", "segmented", "Colors", ["Line", "Area", "Scatter"], {
    values: ["Linear", "Radial"],
    defaultValue: "Linear",
    advanced: true,
  }),
  f("Grid color", "color", "Colors", ["Polar"], {
    desc: "Polar concentric-ring color.",
    advanced: true,
    defaultValue: "#454545",
  }),
  f("Spoke color", "color", "Colors", ["Polar"], {
    desc: "Polar radial-spoke color.",
    advanced: true,
    defaultValue: "#696969",
  }),
  f("Show direction labels", "toggle", "Colors", ["Polar"], {
    advanced: true,
  }),
  f("Show concentric rings", "toggle", "Colors", ["Polar"], {
    advanced: true,
  }),
  f("Show value labels", "toggle", "Colors", ["Polar"], {
    advanced: true,
  }),
  f("Ring count", "number", "Colors", ["Polar"], {
    desc: "Number of concentric frequency rings.",
    advanced: true,
    defaultValue: "5",
  }),
  f("Ring stroke width", "slider", "Colors", ["Polar"], {
    desc: "0–1 px. Default 0.55.",
    advanced: true,
  }),
  f("Spoke stroke width", "slider", "Colors", ["Polar"], {
    desc: "0–1 px. Default 0.5.",
    advanced: true,
  }),
  f("Inner circle ratio", "slider", "Colors", ["Polar"], {
    desc: "0–1. Default 0.36.",
    advanced: true,
  }),
  f("Inner hole radius", "number", "Colors", ["Polar"], {
    desc: "px. Combined with Inner circle ratio to size the hole.",
    advanced: true,
    defaultValue: "20",
  }),
  f("Outer radius ratio", "slider", "Colors", ["Polar"], {
    desc: "0–1. Default 0.4.",
    advanced: true,
  }),
  f("Direction label color", "color", "Colors", ["Polar"], {
    advanced: true,
    defaultValue: "#ffffff",
  }),
  f("Value label color", "color", "Colors", ["Polar"], {
    advanced: true,
    defaultValue: "#ffffff",
  }),

  /* ---- Advanced: Scaling / axes ---- */
  f("Trim edge ticks", "toggle", "Scaling / axes", AXIS_CHARTS, {
    desc: "Remove empty ticks at the start and end of the X axis.",
    advanced: true,
    def: false,
  }),
  f("Axis label color", "color", "Scaling / axes", AXIS_CHARTS, {
    desc: "Fill color of the dimension titles.",
    advanced: true,
    defaultValue: "#ffffff",
    visibleWhen: { group: "Scaling / axes", name: "Show Axes Labels", is: "true" },
  }),
  f("Axis label opacity", "slider", "Scaling / axes", AXIS_CHARTS, {
    desc: "0–1. Default 1.",
    advanced: true,
    visibleWhen: { group: "Scaling / axes", name: "Show Axes Labels", is: "true" },
  }),
  f("Axis offset", "slider", "Scaling / axes", AXIS_CHARTS, {
    desc: "-20–20 px. Positive shifts the X axis downward. Default 0.",
    advanced: true,
  }),
  f("Tick count", "slider", "Scaling / axes", AXIS_CHARTS, {
    desc: "0–10, step 1. 0 lets the renderer decide. Default 0.",
    advanced: true,
  }),
  f("Tick rotation", "slider", "Scaling / axes", AXIS_CHARTS, {
    desc: "-90–90°. Default 0.",
    advanced: true,
  }),
  f("Tick label formatter", "dropdown", "Scaling / axes", AXIS_CHARTS, {
    desc: "Preset for rendered tick labels. Non-Default overrides the Format field.",
    values: [
      "Default",
      "Compact number",
      "Rounded number",
      "Decimal comma",
      "Time only",
      "Date",
      "Month & year",
      "Date & time",
    ],
    defaultValue: "Default",
    advanced: true,
  }),

  /* ---- Advanced: Tooltips ---- */
  f("Show on click", "toggle", "Tooltips", TOOLTIPS, {
    desc: "Show the tooltip on click instead of hover.",
    advanced: true,
    def: false,
  }),
  f("Enable hover effects", "toggle", "Tooltips", ["Scatter", "Pie/Donut"], {
    desc: "Reveal Highlight on hover. Only Scatter and Pie/Donut honor this.",
    advanced: true,
    def: false,
  }),
  f("Highlight on hover", "toggle", "Tooltips", ["Scatter", "Pie/Donut"], {
    advanced: true,
    def: false,
    visibleWhen: { group: "Tooltips", name: "Enable hover effects", is: "true" },
  }),
  f("Enable crosshair", "toggle", "Tooltips", LINE_AREA, {
    desc: "Vertical guide line on hover with the value at the cursor.",
    advanced: true,
    def: false,
  }),
  f("Format", "dropdown", "Tooltips", MAP_TOOLTIPS, {
    desc: "How tooltip field values are formatted.",
    values: [
      "Auto (default)",
      "Whole number",
      "Decimal",
      "Abbreviated",
      "Currency",
      "Percentage",
      "ID / Raw",
    ],
    defaultValue: "Auto (default)",
    advanced: true,
  }),

  /* ---- Advanced: Annotations ---- */
  f("Line style", "dropdown", "Annotations", AXIS_CHARTS, {
    values: ["Solid", "Dashed", "Dotted"],
    defaultValue: "Dashed",
    advanced: true,
    visibleWhen: { group: "Annotations", name: "Show annotations", is: "true" },
  }),
  f("Stroke width", "slider", "Annotations", AXIS_CHARTS, {
    desc: "0–5 px, step 0.5. Default 1.5.",
    advanced: true,
    defaultValue: 30,
    visibleWhen: { group: "Annotations", name: "Show annotations", is: "true" },
  }),

  /* ---- Advanced: KPI Display / KPI card / KPI Grid ---- */
  f("Show max value", "toggle", "KPI Display", STORY_KPI, {
    desc: "When off, the configured max / denominator is hidden next to the headline.",
    advanced: true,
  }),
  f("Show max value", "toggle", "KPI card", ["KPI Card"], {
    desc: "When off, the configured max / denominator is hidden next to the headline.",
    advanced: true,
  }),
  f("Show value / secondary text", "toggle", "KPI Grid", ["KPI Grid"], {
    desc: "Show the tile value and secondary label.",
    advanced: true,
  }),
  f("Show hover tooltip", "toggle", "KPI Grid", ["KPI Grid"], {
    desc: "Needs Hover tooltip field mapped.",
    advanced: true,
    def: false,
  }),

  /* ---- Advanced: Track & marker styling ---- */
  f("Track min height", "number", "Track & marker styling", ["Score Indicator"], {
    desc: "px. Default 16.",
    advanced: true,
    defaultValue: "16",
  }),
  f("Track max height", "number", "Track & marker styling", ["Score Indicator"], {
    desc: "px. Default 20.",
    advanced: true,
    defaultValue: "20",
  }),
  f("Track height ratio", "slider", "Track & marker styling", ["Score Indicator"], {
    desc: "0–1. Default 1.",
    advanced: true,
  }),
  f("Track Y ratio", "slider", "Track & marker styling", ["Score Indicator"], {
    desc: "0–1. Default 0.",
    advanced: true,
  }),
  f("Track Y max", "number", "Track & marker styling", ["Score Indicator"], {
    desc: "px. Default 8.",
    advanced: true,
    defaultValue: "8",
  }),
  f("Show scale labels", "toggle", "Track & marker styling", ["Score Indicator"], {
    desc: "Distinct from Show bar range labels.",
    advanced: true,
    def: false,
  }),
  f("Empty track fill", "color", "Track & marker styling", ["Score Indicator"], {
    desc: "Unfilled remainder of the track, behind the gradient.",
    advanced: true,
    defaultValue: "rgba(255,255,255,0.1)",
  }),
  f("Empty track stroke", "color", "Track & marker styling", ["Score Indicator"], {
    advanced: true,
    defaultValue: "rgba(0,0,0,0.1)",
  }),
  f("Empty track stroke width", "slider", "Track & marker styling", ["Score Indicator"], {
    desc: "0–5 px, step 0.5. Default 1.",
    advanced: true,
  }),

  /* ---- Advanced: Bar gradient (Range) ---- */
  f("Unit", "text", "Bar gradient", ["Range"], {
    desc: "Suffix appended to the high / low value labels.",
    advanced: true,
    defaultValue: "°",
  }),
  f("Show range bars", "toggle", "Bar gradient", ["Range"], {
    advanced: true,
  }),
  f("Show value labels", "toggle", "Bar gradient", ["Range"], {
    advanced: true,
    def: false,
  }),
  f("Show reference lines", "toggle", "Bar gradient", ["Range"], {
    advanced: true,
  }),
  f("Show X axis", "toggle", "Bar gradient", ["Range"], {
    advanced: true,
  }),
  f("Show Y axis", "toggle", "Bar gradient", ["Range"], {
    advanced: true,
  }),
  f("Show grid", "toggle", "Bar gradient", ["Range"], {
    advanced: true,
  }),
  f("Bar padding", "slider", "Bar gradient", ["Range"], {
    desc: "0–1. Default 0.35.",
    advanced: true,
  }),
  f("Bar width ratio", "slider", "Bar gradient", ["Range"], {
    desc: "0–1. Default 0.7.",
    advanced: true,
  }),
  f("Bar max radius", "slider", "Bar gradient", ["Range"], {
    desc: "0–100 px. Default 100.",
    advanced: true,
  }),
  f("Bar opacity", "slider", "Bar gradient", ["Range"], {
    desc: "0–1. Default 1.",
    advanced: true,
  }),
  f("Ref line stroke width", "slider", "Bar gradient", ["Range"], {
    desc: "0–5 px, step 0.5. Default 1.5. Drawn when a Reference value field is mapped.",
    advanced: true,
  }),
  f("Ref line opacity", "slider", "Bar gradient", ["Range"], {
    desc: "0–1. Default 0.7.",
    advanced: true,
  }),
  f("Grid color", "color", "Bar gradient", ["Range"], {
    desc: "Range-specific grid color, separate from Scaling / axes.",
    advanced: true,
    defaultValue: "rgba(255,255,255,0.06)",
  }),
  f("Y tick count", "number", "Bar gradient", ["Range"], {
    advanced: true,
    defaultValue: "4",
  }),

  /* ---- Advanced: map layers ---- */
  f("High value color", "color", "Color", ["Pillars"], {
    desc: "Color used at the high end of the pillar ramp.",
    advanced: true,
    defaultValue: "#25C1E6",
  }),
  f("Disc border opacity", "slider", "Disc Scaling", ["Discs"], {
    desc: "0.1–1.0. Default 0.7.",
    advanced: true,
  }),
  f("Icon mode", "segmented", "Disc Scaling", ["Discs"], {
    values: ["Static", "Field"],
    defaultValue: "Static",
    advanced: true,
  }),
  f("Stem Height", "slider", "Marker appearance", ["Points"], {
    desc: "0–1500. Default 80.",
    advanced: true,
  }),
  f("Render full detail", "toggle", "Advanced", ["Areas"], {
    desc: "Off simplifies polygons for a faster map. On renders every vertex.",
    advanced: true,
    def: false,
  }),
  f("Emphasize on click", "toggle", "Advanced", ["Areas"], {
    desc: "When on, clicking a polygon lerps its opacity to 100%.",
    advanced: true,
    def: false,
  }),

  /* ---- Flags ---- */
  f("Positive Flag", "toggle", "Flags", ["All Charts & KPIs", "All Data Tables", "All Map Layers"], {
    desc: "Optional positive-state flag.",
    def: false,
  }),
  f("Neutral Flag", "toggle", "Flags", ["All Charts & KPIs", "All Data Tables", "All Map Layers"], {
    desc: "Optional neutral-state flag.",
    def: false,
  }),
  f("Negative Flag", "toggle", "Flags", ["All Charts & KPIs", "All Data Tables", "All Map Layers"], {
    desc: "Optional negative-state flag.",
    def: false,
  }),
];

function expandTypes(types: NotionVisualType[]): Set<NotionVisualType> {
  const out = new Set<NotionVisualType>();
  for (const t of types) {
    if (t === "All Charts & KPIs") ALL_CHARTS_KPIS.forEach((x) => out.add(x));
    else if (t === "All Data Tables") out.add("Data Table");
    else if (t === "All Map Layers") ALL_MAP_LAYERS.forEach((x) => out.add(x));
    else out.add(t);
  }
  return out;
}

function toOpt(def: FieldDef, notionType: NotionVisualType): Opt {
  const values = def.valuesByType?.[notionType] ?? def.values ?? [];
  return {
    name: def.name,
    desc: def.desc ?? "",
    level: def.advanced
      ? "advanced"
      : def.required || /\(required/i.test(def.name)
        ? "required"
        : "core",
    type: def.control,
    values,
    group: def.subCategory,
    def: def.def !== false,
    defaultValue: def.defaultValue,
    editableValue: def.editableValue,
    visibleWhen: def.visibleWhen,
  };
}

export function notionTypeForVisual(visualId: string): NotionVisualType | undefined {
  return NOTION_TYPE_BY_VISUAL_ID[visualId];
}

/** Gradient X/Y axis only applies to cartesian plots with an X and Y scale. */
export function visualHasGradientAxis(visualId: string): boolean {
  const notionType = NOTION_TYPE_BY_VISUAL_ID[visualId];
  return notionType != null && (AXIS_CHARTS as readonly string[]).includes(notionType);
}

/** Natural gradient direction for each visual's primary reading direction. */
export function defaultGradientAxisForVisual(visualId: string): "X" | "Y" {
  return [
    "horizontal-bar",
    "line-chart",
    "area-chart",
    "progress-bar",
    "availability",
    "fences",
  ].includes(visualId)
    ? "X"
    : "Y";
}

export type ColorPickerMode =
  | "Single Color"
  | "Categorical Colors"
  | "Sequential Colors";

export type VisualColorPickerProfile = {
  modes: readonly ColorPickerMode[];
  autoCategoryFields: readonly string[];
  autoValueFields: readonly string[];
  categoryFallback: string;
};

const ALL_PICKER_MODES: readonly ColorPickerMode[] = [
  "Single Color",
  "Categorical Colors",
  "Sequential Colors",
];

const VALUE_PICKER_MODES: readonly ColorPickerMode[] = [
  "Single Color",
  "Sequential Colors",
];

const COLOR_PICKER_PROFILES: Record<string, VisualColorPickerProfile> = {
  "vertical-bar": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Series", "X axis"],
    autoValueFields: ["Y axis"],
    categoryFallback: "district",
  },
  "horizontal-bar": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Series", "Y category"],
    autoValueFields: ["X value"],
    categoryFallback: "district",
  },
  "line-chart": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Series", "X axis"],
    autoValueFields: ["Y axis"],
    categoryFallback: "timestamp",
  },
  "area-chart": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Series", "X axis"],
    autoValueFields: ["Y axis"],
    categoryFallback: "timestamp",
  },
  "scatter-plot": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Color/Category"],
    autoValueFields: ["Y value"],
    categoryFallback: "category",
  },
  "donut-chart": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Category"],
    autoValueFields: ["Value"],
    categoryFallback: "district",
  },
  "progress-bar": {
    modes: VALUE_PICKER_MODES,
    autoCategoryFields: ["Y category"],
    autoValueFields: ["X value"],
    categoryFallback: "district",
  },
  "gauge-linear": {
    modes: VALUE_PICKER_MODES,
    autoCategoryFields: ["Status"],
    autoValueFields: ["Value"],
    categoryFallback: "status",
  },
  "polar-wind-rose": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Direction", "Band"],
    autoValueFields: ["Wind speed", "Frequency"],
    categoryFallback: "direction",
  },
  availability: {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Value"],
    autoValueFields: ["Y axis", "Value"],
    categoryFallback: "district",
  },
  arcs: {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Type", "Origin"],
    autoValueFields: ["Value"],
    categoryFallback: "category",
  },
  discs: {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Location field"],
    autoValueFields: ["Value"],
    categoryFallback: "category",
  },
  fences: {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Coordinates (Geometry)"],
    autoValueFields: ["Value"],
    categoryFallback: "category",
  },
  heatmap: {
    modes: VALUE_PICKER_MODES,
    autoCategoryFields: ["Type"],
    autoValueFields: ["Intensity Value Field", "Value"],
    categoryFallback: "category",
  },
  wind: {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Coordinates"],
    autoValueFields: ["U Component (Eastward)", "Wind speed"],
    categoryFallback: "category",
  },
  points: {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Color by category field", "Location field"],
    autoValueFields: ["Value"],
    categoryFallback: "category",
  },
  "map-area": {
    modes: ALL_PICKER_MODES,
    autoCategoryFields: ["Type", "Name"],
    autoValueFields: ["Value"],
    categoryFallback: "category",
  },
};

export function colorPickerProfileForVisual(
  visualId: string,
): VisualColorPickerProfile | undefined {
  return COLOR_PICKER_PROFILES[visualId];
}

function levelRank(level: Opt["level"]): number {
  if (level === "required") return 0;
  if (level === "advanced") return 2;
  return 1;
}

export function fieldsForVisual(visualId: string): Opt[] {
  const notionType = NOTION_TYPE_BY_VISUAL_ID[visualId];
  if (!notionType) return [];
  return FIELDS.filter((def) => expandTypes(def.types).has(notionType))
    .map((def) => toOpt(def, notionType))
    .sort((a, b) => {
      const aStageCount = a.group === "Mapping" && a.name === "Number of stages";
      const bStageCount = b.group === "Mapping" && b.name === "Number of stages";
      if (aStageCount !== bStageCount) return aStageCount ? -1 : 1;
      return levelRank(a.level) - levelRank(b.level);
    });
}

export function subCategoriesForVisual(visualId: string): string[] {
  const groups = new Set(fieldsForVisual(visualId).map((o) => o.group));
  return SUBCATEGORY_ORDER.filter((name) => groups.has(name));
}

/** Primary mapping and visual-attribute tabs. Everything else sits under Additional. */
export const SETTINGS_NAV_CORE = [
  "Mapping",
  "KPI Display",
  "Sankey",
  "Bar",
  "Line",
  "Scatter",
  "Pie / Donut",
  "Meter & Labels",
  "Track & marker styling",
  "Bar gradient",
  "KPI card",
  "KPI Grid",
  "Status",
  "Line Customization",
  "Height",
  "Size",
  "Disc Scaling",
  "Disc ring",
  "Ground disc",
  "Marker Shape",
  "Marker appearance",
  "Heatmap Style",
  "Bin & extrusion",
  "Contour Terrain",
  "Extrusion",
] as const;

/** Extra tabs whose first control is a master show/hide toggle. */
export const FEATURE_TAB_MASTERS: Record<string, string> = {
  Legend: "Show legend",
  "Status badge": "Show status badge",
  Tooltips: "Show tooltips",
  Annotations: "Show annotations",
  "Disc ring": "Show endpoint discs",
  "Map Legend": "Show legend in Map Data",
  Height: "Height Exaggeration",
};

function isToggleOn(value: unknown): boolean {
  return value === true || value === "true";
}

export function isFeatureTabOn(
  group: string,
  getValByKey: (group: string, name: string) => unknown,
  groupFields?: Opt[],
): boolean | null {
  const master = FEATURE_TAB_MASTERS[group];
  if (!master) return null;
  if (groupFields && !groupFields.some((o) => o.name === master)) return null;
  return isToggleOn(getValByKey(group, master));
}

export type SettingsNavSection = {
  id: "core" | "extra";
  label: string;
  tabs: string[];
};

export function settingsNavSections(visualId: string): SettingsNavSection[] {
  const fields = fieldsForVisual(visualId);
  const tabs = subCategoriesForVisual(visualId);
  const coreSet = new Set<string>(SETTINGS_NAV_CORE);
  const core = tabs.filter((name) => coreSet.has(name));
  const extra = tabs.filter((name) => !coreSet.has(name));
  const hasMaster = (name: string) => {
    const master = FEATURE_TAB_MASTERS[name];
    return Boolean(master && fields.some((o) => o.group === name && o.name === master));
  };
  const extraPlain = extra.filter((name) => !hasMaster(name));
  const extraToggles = extra.filter((name) => hasMaster(name));
  const flags = extra.includes("Flags") ? ["Flags"] : [];
  const extraOrdered = [
    ...extraPlain.filter((name) => name !== "Flags"),
    ...extraToggles,
    ...flags,
  ];
  const sections: SettingsNavSection[] = [];
  if (core.length) sections.push({ id: "core", label: "Main", tabs: core });
  if (extraOrdered.length) {
    sections.push({ id: "extra", label: "Additional", tabs: extraOrdered });
  }
  return sections;
}

export function isFieldVisible(o: Opt, getValByKey: (group: string, name: string) => unknown): boolean {
  const master = FEATURE_TAB_MASTERS[o.group];
  if (master && o.name !== master) {
    const current = getValByKey(o.group, master);
    if ((typeof current === "boolean" || current === "true" || current === "false") && !isToggleOn(current)) {
      return false;
    }
  }
  if (!o.visibleWhen) return true;
  const current = String(getValByKey(o.visibleWhen.group, o.visibleWhen.name) ?? "");
  const expected = o.visibleWhen.is;
  return Array.isArray(expected) ? expected.includes(current) : current === expected;
}
