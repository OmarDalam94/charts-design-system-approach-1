/**
 * Typed chart models. Derivation (settings + data → model) is pure and
 * independent of size; layout and rendering consume these models.
 */

import type { ChartFamily } from "./assets";
import type { SeriesIdentity } from "./identity";
import type { NumberFormatter } from "./format";
import type { AggregationMode } from "./data/values";
import type { Adaptation, ConflictNote } from "./settings";

export type Severity = "info" | "warning" | "error";

export type Issue = {
  id: string;
  severity: Severity;
  message: string;
  settings?: string[];
};

export type DataState =
  | "ready"
  | "loading"
  | "error"
  | "missing-mapping"
  | "empty"
  | "all-null"
  | "all-zero"
  | "no-matches"
  | "invalid";

export type Tone = "positive" | "warning" | "negative" | "neutral";

export type BadgeModel = { text: string; tone: Tone; color?: string; source: string };

export type FlagChip = {
  kind: "positive" | "neutral" | "negative";
  label: string;
  tooltip?: string;
};

export type FlagEvaluation = FlagChip & { shown: boolean; reason: string };

export type KpiModel = {
  value: number | null;
  text: string;
  unit?: string;
  /** "/ max" context, already formatted. */
  maxText?: string;
  rangeText?: string;
  comparison?: { delta: number; text: string; direction: "up" | "down" | "flat"; basis: string } | null;
  source: string;
};

export type HeaderModel = {
  title: string;
  description?: string;
  icon?: string;
  info?: string;
  kpi: KpiModel | null;
  badge: BadgeModel | null;
  flags: FlagChip[];
};

export type TableColumn = { key: string; label: string; numeric?: boolean };
export type TableCell = { text: string; sort: number | string | null; note?: string };
export type DataTableModel = {
  caption: string;
  columns: TableColumn[];
  rows: Record<string, TableCell>[];
  notes: string[];
};

export type LegendStat = "latest" | "total" | "value" | "none";

export type LegendItem = {
  id: string;
  label: string;
  color: string;
  dash?: string;
  marker?: SeriesIdentity["marker"];
  valueText?: string;
  percentText?: string;
  /** Why no percentage is shown, when percentages were requested. */
  percentReason?: string;
};

export type LegendModel = {
  enabled: boolean;
  /** Reason the legend is not available for this configuration. */
  unavailableReason?: string;
  position: "top" | "bottom" | "left" | "right";
  requestedPosition: string;
  showLabels: boolean;
  showValues: boolean;
  showPercentages: boolean;
  statLabel: string;
  items: LegendItem[];
};

export type ChartEnvelope = {
  visualId: string;
  family: ChartFamily;
  state: DataState;
  stateMessage?: string;
  header: HeaderModel;
  insight?: string;
  legend: LegendModel;
  issues: Issue[];
  adaptations: Adaptation[];
  conflicts: ConflictNote[];
  table: DataTableModel;
  summary: string;
  /** Settings keys this model read; used by coverage verification. */
  reads: string[];
  flags: FlagEvaluation[];
  tooltip: TooltipConfig;
  showDataLabels: boolean;
  cardOutline: boolean;
};

export type TooltipConfig = {
  enabled: boolean;
  onClick: boolean;
  fields: string[];
  format: NumberFormatter;
  template?: string;
  crosshair: boolean;
  highlight: boolean;
};

/* ---------------- Cartesian ---------------- */

export type XKind = "time" | "number" | "category";

export type CartesianDatum = {
  /** Position: ms for time, number for numeric, category index for categories. */
  x: number;
  xLabel: string;
  y: number | null;
  /** Stacked baseline/top when stacking applies. */
  y0?: number;
  y1?: number;
  /** Scatter size or range low. */
  size?: number | null;
  low?: number | null;
  high?: number | null;
  total?: number | null;
  category?: string;
  rowIndexes: number[];
  invalid?: boolean;
  duplicate?: boolean;
  /** Tooltip extras read from the first underlying row. */
  meta?: { unit?: string; status?: string };
};

export type CartesianSeries = {
  identity: SeriesIdentity;
  data: CartesianDatum[];
  /** Data index per x key for exact-match shared tooltips. */
  byX: Map<number, CartesianDatum>;
  dashed?: boolean;
};

export type AxisModel = {
  showTicks: boolean;
  showTickLabels: boolean;
  showGrid: boolean;
  gridColor?: string;
  title: string | null;
  titleColor?: string;
  titleOpacity: number;
  tickMode: "standard" | "endpoints";
  tickCount: number;
  tickRotation: number;
  offset: number;
  trimEdgeTicks: boolean;
  format: NumberFormatter;
  timePreset?: string;
  manual: { min: number | null; max: number | null } | null;
  domainIssues: string[];
};

export type AnnotationModel = {
  kind: "average" | "maximum" | "minimum" | "trend" | "manual-x" | "manual-y" | "manual-xy" | "reference";
  value?: number;
  xKey?: string;
  slope?: number;
  intercept?: number;
  label: string;
  showCaption: boolean;
  dash: string;
  strokeWidth: number;
  followCategories: boolean;
  seriesId?: string;
};

export type CartesianModel = ChartEnvelope & {
  kind: "cartesian";
  variant: "line" | "area" | "bar" | "hbar" | "scatter" | "range";
  xKind: XKind;
  categories: string[];
  series: CartesianSeries[];
  xAxis: AxisModel;
  yAxis: AxisModel;
  /** Value domain from every series, so hiding a series never rescales. */
  yDomain: [number, number];
  /** Time/number X domain; null for categories. */
  xDomain: [number, number] | null;
  includeZero: boolean;
  stacked: boolean;
  /** Area fills under line paths. */
  areaFill: boolean;
  fillOpacity: number;
  curve: string;
  strokeWidth: number;
  points: { show: boolean; radius: number; strokeWidth: number; fill: string | null; stroke: string | null };
  bar: {
    showValues: boolean;
    valuePosition: "above" | "inline";
    track: "none" | "full" | "segmented";
    strokeWidth: number;
    layout: "inline" | "cartesian";
    labelColor: string | null;
    unitSuffix: string;
    topN: number;
    omitted: string[];
  };
  scatter: { minR: number; maxR: number; shape: "circle" | "square" | "triangle"; fill: string | null; sizeDomain: [number, number] | null };
  range: {
    showBars: boolean;
    showValues: boolean;
    showReference: boolean;
    showX: boolean;
    showY: boolean;
    padding: number;
    widthRatio: number;
    maxRadius: number;
    opacity: number;
    refStroke: number;
    refOpacity: number;
    unit: string;
    gradient: { color: string; at: number }[];
  };
  annotations: AnnotationModel[];
  /** Value-encoding gradient for single-series paths/bars. */
  valueGradient: { stops: { offset: number; color: string }[]; axis: "y" | "x" } | null;
  barColors: string[] | null;
  aggregation: AggregationMode;
  reference: { value: number; label: string } | null;
};

/* ---------------- Radial / flow ---------------- */

export type DonutSlice = {
  identity: SeriesIdentity;
  value: number | null;
  share: number | null;
  rowIndexes: number[];
};

export type DonutModel = ChartEnvelope & {
  kind: "donut";
  slices: DonutSlice[];
  total: number;
  innerRatio: number;
  labelFormat: "percentage" | "value" | "both";
  centerText: { value: string; label: string } | null;
  excluded: { label: string; value: number | null; reason: string }[];
  format: NumberFormatter;
};

export type PolarBin = {
  direction: string;
  angle: number;
  bands: { band: string; value: number; identity: SeriesIdentity }[];
  total: number;
};

export type PolarModel = ChartEnvelope & {
  kind: "polar";
  bins: PolarBin[];
  bands: SeriesIdentity[];
  maxTotal: number;
  rings: number;
  style: {
    gridColor: string | null;
    spokeColor: string | null;
    showDirections: boolean;
    showRings: boolean;
    showValues: boolean;
    ringStroke: number;
    spokeStroke: number;
    innerRatio: number;
    innerHole: number;
    outerRatio: number;
    directionColor: string | null;
    valueColor: string | null;
  };
  format: NumberFormatter;
  convention: string;
};

export type SankeyNodeModel = { id: string; label: string; stage: number; identity: SeriesIdentity; value: number };
export type SankeyLinkModel = { source: string; target: string; value: number; rowIndexes: number[] };

export type SankeyModel = ChartEnvelope & {
  kind: "sankey";
  stages: string[];
  nodes: SankeyNodeModel[];
  links: SankeyLinkModel[];
  style: { nodeWidth: number; nodeGap: number; linkOpacity: number; curvature: number; showLabels: boolean };
  format: NumberFormatter;
  dropped: { reason: string; count: number }[];
};

/* ---------------- Metric / status ---------------- */

export type ProgressModel = ChartEnvelope & {
  kind: "progress";
  rows: { label: string; value: number | null; max: number | null; share: number | null; color: string }[];
  mode: "percentage" | "value";
  showValues: boolean;
  valuePosition: "above" | "inline";
  separators: boolean;
  track: "none" | "full" | "segmented";
  format: NumberFormatter;
  omitted: number;
};

export type GaugeModel = ChartEnvelope & {
  kind: "gauge";
  type: "vertical" | "circular";
  value: number | null;
  min: number;
  max: number;
  /** 0–1 position after clamping; null when value missing. */
  position: number | null;
  outOfRange: "below" | "above" | null;
  movement: "Rising" | "Falling" | "Stabilizing";
  showCenter: boolean;
  subdivisions: number;
  unit: string;
  status: string;
  color: string;
  format: NumberFormatter;
};

export type ScoreModel = ChartEnvelope & {
  kind: "score";
  value: number | null;
  min: number;
  max: number;
  position: number | null;
  outOfRange: "below" | "above" | null;
  style: {
    showMarker: boolean;
    fillToMarker: boolean;
    trackMin: number;
    trackMax: number;
    heightRatio: number;
    yRatio: number;
    yMax: number;
    showScale: boolean;
    emptyFill: string | null;
    emptyStroke: string | null;
    emptyStrokeWidth: number;
  };
  colors: string[];
  format: NumberFormatter;
};

export type KpiCardModel = ChartEnvelope & {
  kind: "kpi" | "legacy-kpi";
  kpi: KpiModel;
  label: string;
};

export type KpiTile = {
  id: string;
  label: string;
  value: number | null;
  valueText: string;
  secondary?: string;
  status?: string;
  accent: string | null;
  critical: boolean;
  tooltip?: string;
};

export type KpiGridModel = ChartEnvelope & {
  kind: "kpi-grid";
  tiles: KpiTile[];
  showStatus: boolean;
  glow: boolean;
  showValue: boolean;
  showHover: boolean;
};

export type AvailabilitySegment = {
  index: number;
  start: number | null;
  end: number | null;
  label: string;
  state: "up" | "down" | "degraded" | "unknown";
  value: number | null;
  color: string;
  rowIndexes: number[];
};

export type AvailabilityModel = ChartEnvelope & {
  kind: "availability";
  segments: AvailabilitySegment[];
  categories: SeriesIdentity[];
  style: { segmentCount: number; radius: number; gap: number; width: number };
  axis: "time" | "order";
  uptime: { share: number | null; known: number; total: number };
};

export type TableModel = ChartEnvelope & {
  kind: "table";
  columns: TableColumn[];
  rows: Record<string, TableCell>[];
};

export type ChartModel =
  | CartesianModel
  | DonutModel
  | PolarModel
  | SankeyModel
  | ProgressModel
  | GaugeModel
  | ScoreModel
  | KpiCardModel
  | KpiGridModel
  | AvailabilityModel
  | TableModel;
