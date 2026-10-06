import { aggregate, cellText, columnOf, isAdditive, parseNumber, parseTime, type RawRow } from "../data/values";
import { formatExact, formatTimeExact, isTimePreset } from "../format";
import { assignIdentities, firstAppearance, seriesColors } from "../identity";
import { colorAtValue, stopsForDomain } from "../color";
import { computeDomain, niceDomainForCount, parseManualRange } from "../scales";
import type {
  AnnotationModel,
  AxisModel,
  CartesianDatum,
  CartesianModel,
  CartesianSeries,
  DataTableModel,
  TableCell,
  XKind,
} from "../model";
import {
  evaluateFlags,
  headerFor,
  insightText,
  legendFor,
  statusBadge,
  storyKpi,
  tooltipConfig,
  type DeriveContext,
} from "./common";

type Variant = CartesianModel["variant"];

const VARIANT: Record<string, Variant> = {
  "line-chart": "line",
  "area-chart": "area",
  "vertical-bar": "bar",
  "horizontal-bar": "hbar",
  "scatter-plot": "scatter",
  range: "range",
};

const NO_VALUE = "(No value)";

type Cell = { ys: (number | null)[]; rows: number[]; lows: (number | null)[]; highs: (number | null)[]; totals: (number | null)[]; sizes: (number | null)[]; cats: string[] };

function emptyCell(): Cell {
  return { ys: [], rows: [], lows: [], highs: [], totals: [], sizes: [], cats: [] };
}

function dashFor(style: string): string {
  const s = style.toLowerCase();
  if (s.startsWith("solid")) return "";
  if (s.startsWith("dot")) return "1.5 3";
  return "5 4";
}

/** Ordinary least squares over (x, y). Needs at least two distinct x values. */
export function olsFit(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const xs = new Set(points.map((p) => p.x));
  if (points.length < 2 || xs.size < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

export function deriveCartesian(ctx: DeriveContext): CartesianModel {
  const variant = VARIANT[ctx.input.visualId] ?? "line";
  const s = ctx.s;
  const ds = ctx.input.dataset;
  const countMode = ctx.aggregation === "count";

  let xCol = "";
  let yCol = "";
  let seriesCol = "";
  let lowCol = "";
  let highCol = "";
  let sizeCol = "";
  let maxCol = "";
  let refCol = "";
  if (variant === "hbar") {
    xCol = ctx.col("Y category");
    yCol = ctx.col("X value");
  } else if (variant === "scatter") {
    xCol = ctx.col("X value");
    yCol = ctx.col("Y value");
    sizeCol = ctx.col("Point size");
    seriesCol = ctx.col("Color/Category");
  } else if (variant === "range") {
    xCol = ctx.col("X axis");
    lowCol = ctx.col("Low value");
    highCol = ctx.col("High value");
  } else {
    xCol = ctx.col("X axis");
    yCol = ctx.col("Y axis");
  }
  if (variant === "bar" || variant === "hbar" || variant === "line" || variant === "area") seriesCol = ctx.col("Series");
  if (variant === "bar" || variant === "hbar") maxCol = ctx.col("Max/Total");
  if (variant === "line" || variant === "area" || variant === "range") refCol = ctx.col("Reference value");

  // ML-prediction sources: choose which measure column(s) to plot.
  const mlLabel = s.str("Mapping", "Y-axis values (ML only)");
  let mlDual = false;
  if (ds.ml && s.has("Mapping", "Y-axis values (ML only)") && variant !== "range") {
    if (mlLabel.startsWith("Actual vs")) mlDual = variant === "line" || variant === "area" || variant === "bar";
    else yCol = mlLabel.startsWith("Actual") ? ds.ml.actual : ds.ml.predicted;
    if (mlDual && seriesCol) {
      ctx.conflicts.push({
        settings: ["Mapping::Y-axis values (ML only)", "Mapping::Series"],
        resolution: "Actual vs predicted defines the two series, so the Series mapping is not used.",
      });
      seriesCol = "";
    }
  } else if (!ds.ml && s.isExplicit("Mapping", "Y-axis values (ML only)")) {
    ctx.issue("ml-na", "info", "Y-axis values (ML only) does not apply: this data source is not an ML-prediction source.", ["Mapping::Y-axis values (ML only)"]);
  }

  const missing = ctx.missingRequired((o) => countMode && (o.name === "Y axis" || o.name === "Y value" || o.name === "X value" && variant === "hbar"));
  const xType = xCol ? columnOf(ds, xCol)?.type : undefined;
  let xKind: XKind = "category";
  if ((variant === "line" || variant === "area") && xType === "datetime") xKind = "time";
  else if ((variant === "line" || variant === "area" || variant === "scatter") && xType === "number") xKind = "number";
  else if (variant === "scatter") xKind = "number";
  const chronological = xType === "datetime";

  // Row parsing
  const rows = ctx.rows;
  let invalidY = 0;
  let missingY = 0;
  let invalidX = 0;
  const seriesKeysInOrder: string[] = [];
  const grid = new Map<string, Map<string, Cell>>();
  const xValueByKey = new Map<string, number>();
  const xKeysInOrder: string[] = [];
  const mlCols = mlDual && ds.ml ? [ds.ml.actual, ds.ml.predicted] : null;

  const pushCell = (seriesKey: string, xKey: string, i: number, row: RawRow, y: number | null) => {
    if (!grid.has(seriesKey)) {
      grid.set(seriesKey, new Map());
      seriesKeysInOrder.push(seriesKey);
    }
    const cells = grid.get(seriesKey)!;
    if (!cells.has(xKey)) cells.set(xKey, emptyCell());
    const c = cells.get(xKey)!;
    c.ys.push(y);
    c.rows.push(i);
    if (lowCol) c.lows.push(parseNumber(row[lowCol]).value);
    if (highCol) c.highs.push(parseNumber(row[highCol]).value);
    if (maxCol) c.totals.push(parseNumber(row[maxCol]).value);
    if (sizeCol) c.sizes.push(parseNumber(row[sizeCol]).value);
  };

  if (!missing.length) {
    rows.forEach((row, i) => {
      let xKey: string;
      if (variant === "scatter" || xKind === "number") {
        const p = parseNumber(row[xCol]);
        if (p.status !== "ok") {
          invalidX++;
          return;
        }
        xKey = String(p.value);
        xValueByKey.set(xKey, p.value);
      } else if (xKind === "time") {
        const t = parseTime(row[xCol]);
        if (t === null) {
          invalidX++;
          return;
        }
        xKey = String(t);
        xValueByKey.set(xKey, t);
      } else if (!xCol) {
        xKey = `Row ${i + 1}`;
      } else {
        xKey = cellText(row[xCol]).trim() || NO_VALUE;
        if (chronological && !xValueByKey.has(xKey)) xValueByKey.set(xKey, parseTime(row[xCol]) ?? Infinity);
      }
      if (!xKeysInOrder.includes(xKey)) xKeysInOrder.push(xKey);
      if (mlCols) {
        ["Actual", "Predicted"].forEach((name, k) => {
          const p = parseNumber(row[mlCols[k]]);
          if (p.status === "invalid") invalidY++;
          if (p.status === "missing") missingY++;
          pushCell(name, xKey, i, row, p.value);
        });
        return;
      }
      const seriesKey = seriesCol ? cellText(row[seriesCol]).trim() || NO_VALUE : yCol || lowCol || "value";
      let y: number | null = null;
      if (variant === "range") {
        y = null;
      } else if (countMode) {
        y = 1;
      } else {
        const p = parseNumber(row[yCol]);
        if (p.status === "invalid") invalidY++;
        if (p.status === "missing") missingY++;
        y = p.value;
      }
      pushCell(seriesKey, xKey, i, row, y);
    });
  }

  if (invalidY) ctx.issue("invalid-y", "warning", `${invalidY} value${invalidY === 1 ? " is" : "s are"} not numbers and ${invalidY === 1 ? "is" : "are"} shown as gaps, not zero.`);
  if (missingY) ctx.issue("missing-y", "info", `${missingY} row${missingY === 1 ? " has" : "s have"} no value; ${missingY === 1 ? "it is" : "they are"} shown as ${variant === "line" || variant === "area" ? "gaps" : "missing marks"}.`);
  if (invalidX) ctx.issue("invalid-x", "warning", `${invalidX} row${invalidX === 1 ? " has" : "s have"} an X value that cannot be placed on a ${xKind === "time" ? "time" : "numeric"} axis and ${invalidX === 1 ? "is" : "are"} not plotted.`);
  if (seriesKeysInOrder.length > 50) {
    ctx.issue("series-over-50", "warning", `Series has ${seriesKeysInOrder.length} unique values; the catalog supports up to 50. All are drawn.`, ["Mapping::Series"]);
  }

  // Category order
  let categories: string[] = [];
  if (xKind === "category") {
    categories = [...xKeysInOrder];
    if (chronological) categories.sort((a, b) => (xValueByKey.get(a) ?? 0) - (xValueByKey.get(b) ?? 0));
  }

  // Build series data
  const seriesKeys = firstAppearance(seriesKeysInOrder);
  const mode = s.has("Colors", "Palette") ? s.palette() : null;
  const colorAssign = seriesColors(mode, seriesKeys);
  if (colorAssign.note && seriesKeys.length > 1) ctx.adapt({ id: "palette-series", setting: "Colors::Palette", requested: mode?.style, effective: "Categorical per series", reason: colorAssign.note });
  const labels: Record<string, string> = {};
  for (const k of seriesKeys) labels[k] = seriesCol || mlCols ? k : ctx.label(k);
  const identities = assignIdentities(seriesKeys, labels, colorAssign.colors);

  const plotsEveryRow = variant === "line" || variant === "area" || variant === "scatter";
  let duplicateGroups = 0;
  let duplicateRows = 0;

  const series: CartesianSeries[] = identities.map((identity) => {
    const cells = grid.get(identity.key)!;
    const data: CartesianDatum[] = [];
    for (const [xKey, cell] of cells) {
      const x = xKind === "category" ? categories.indexOf(xKey) : xValueByKey.get(xKey)!;
      const xLabel = xKind === "time" ? formatTimeExact(x) : xKey;
      const dup = cell.rows.length > 1;
      if (ctx.aggregation === "raw" && dup) {
        duplicateGroups++;
        if (plotsEveryRow) {
          cell.rows.forEach((r, k) =>
            data.push({ x, xLabel, y: cell.ys[k], size: cell.sizes[k] ?? null, rowIndexes: [r], duplicate: true }),
          );
          continue;
        }
        duplicateRows += cell.rows.length - 1;
        data.push({
          x,
          xLabel,
          y: cell.ys[0] ?? null,
          low: cell.lows[0] ?? null,
          high: cell.highs[0] ?? null,
          total: cell.totals[0] ?? null,
          rowIndexes: cell.rows,
          duplicate: true,
        });
        continue;
      }
      const agg = ctx.aggregation;
      const lowAgg = agg === "count" ? "average" : agg;
      data.push({
        x,
        xLabel,
        y: variant === "range" ? null : aggregate(cell.ys, agg, cell.rows.length),
        low: lowCol ? aggregate(cell.lows, lowAgg === "raw" ? "raw" : lowAgg) : undefined,
        high: highCol ? aggregate(cell.highs, lowAgg === "raw" ? "raw" : lowAgg) : undefined,
        total: maxCol ? aggregate(cell.totals, agg === "count" ? "sum" : agg) : undefined,
        size: sizeCol ? aggregate(cell.sizes, agg === "count" ? "sum" : agg) : undefined,
        rowIndexes: cell.rows,
      });
    }
    if (xKind !== "category") data.sort((a, b) => a.x - b.x);
    else data.sort((a, b) => a.x - b.x);
    const byX = new Map<number, CartesianDatum>();
    for (const d of data) if (!byX.has(d.x)) byX.set(d.x, d);
    return { identity, data, byX, dashed: mlCols ? identity.key === "Predicted" : false };
  });

  const unitColumn = columnOf(ds, "unit") ? "unit" : "";
  const statusColumn = columnOf(ds, "status") ? "status" : "";
  if (unitColumn || statusColumn) {
    for (const sr of series)
      for (const d of sr.data) {
        const r = rows[d.rowIndexes[0]];
        if (r) d.meta = { unit: unitColumn ? cellText(r[unitColumn]) || undefined : undefined, status: statusColumn ? cellText(r[statusColumn]) || undefined : undefined };
      }
  }

  if (duplicateGroups && ctx.aggregation === "raw") {
    if (plotsEveryRow) {
      ctx.issue(
        "raw-duplicates",
        "warning",
        `Aggregation is None and ${duplicateGroups} X position${duplicateGroups === 1 ? "" : "s"} ${duplicateGroups === 1 ? "has" : "have"} several rows in the same series; every row is plotted. Choose an aggregation or map Series.`,
        ["Mapping::Aggregation", "Mapping::Series"],
      );
    } else {
      ctx.issue(
        "raw-duplicates",
        "warning",
        `Aggregation is None, but ${duplicateGroups} ${variant === "range" ? "category" : "bar"}${duplicateGroups === 1 ? "" : "s"} ${duplicateGroups === 1 ? "has" : "have"} several rows. Each mark shows its first row; ${duplicateRows} row${duplicateRows === 1 ? " is" : "s are"} not shown. Choose an aggregation.`,
        ["Mapping::Aggregation"],
      );
    }
  }

  // Range: low/high integrity
  if (variant === "range") {
    let swapped = 0;
    let partial = 0;
    for (const sr of series)
      for (const d of sr.data) {
        if (d.low != null && d.high != null && d.low > d.high) {
          swapped++;
          d.invalid = true;
        }
        if ((d.low == null) !== (d.high == null)) partial++;
      }
    if (swapped) ctx.issue("range-inverted", "warning", `${swapped} range${swapped === 1 ? " has" : "s have"} a low value above the high value. They are drawn as outlined inverted ranges and are not swapped.`);
    if (partial) ctx.issue("range-partial", "info", `${partial} range${partial === 1 ? " is" : "s are"} missing one endpoint and ${partial === 1 ? "is" : "are"} shown as a single point.`);
  }

  // Sorting and Top N (bars, range categories)
  const isBar = variant === "bar" || variant === "hbar";
  const stacked = isBar && s.bool("Bar", "Stack series") && series.length > 1;
  const topNRaw = isBar ? Math.round(s.slider("Bar", "Top N categories", 100)) : 0;
  let omitted: string[] = [];
  if (xKind === "category" && categories.length) {
    const totals = categories.map((_, ci) =>
      series.reduce((a, sr) => {
        const d = sr.byX.get(ci);
        return a + (d?.y != null ? Math.abs(d.y) : 0);
      }, 0),
    );
    let order = categories.map((_, i) => i);
    if (isBar && s.bool("Bar", "Sort by value")) {
      const desc = (s.str("Bar", "Sort order") || "Descending").startsWith("Desc");
      const signed = categories.map((_, ci) => series.reduce((a, sr) => a + (sr.byX.get(ci)?.y ?? 0), 0));
      order = [...order].sort((a, b) => (desc ? signed[b] - signed[a] : signed[a] - signed[b]) || a - b);
    }
    if (isBar && topNRaw > 0 && topNRaw < categories.length) {
      const ranked = [...order].sort((a, b) => totals[b] - totals[a] || a - b).slice(0, topNRaw);
      const keep = new Set(ranked);
      omitted = order.filter((i) => !keep.has(i)).map((i) => categories[i]);
      order = order.filter((i) => keep.has(i));
      ctx.adapt({
        id: "top-n",
        setting: "Bar::Top N categories",
        requested: String(topNRaw),
        effective: `${order.length} of ${categories.length}`,
        reason: `Top N keeps the ${topNRaw} categories with the largest absolute totals; ${omitted.length} ${omitted.length === 1 ? "is" : "are"} not shown and remain in the data view.`,
      });
    }
    const remap = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
    const nextCategories = order.map((i) => categories[i]);
    for (const sr of series) {
      sr.data = sr.data.filter((d) => remap.has(d.x)).map((d) => ({ ...d, x: remap.get(d.x)! }));
      sr.data.sort((a, b) => a.x - b.x);
      sr.byX = new Map(sr.data.map((d) => [d.x, d]));
    }
    categories = nextCategories;
  }

  // Stacking
  // The Area asset keeps its fill unless Chart style is explicitly Line (the catalog default is the first value, Line).
  const areaLineOverride = variant === "area" && s.isExplicit("Line", "Chart style") && s.str("Line", "Chart style") === "Line";
  const area = variant === "area" ? !areaLineOverride : variant === "line" && s.str("Line", "Chart style") === "Area";
  const stackedArea = variant === "area" && !!ctx.input.extensions?.stackedArea && series.length > 1;
  if (stacked || stackedArea) {
    const xs = new Set<number>();
    series.forEach((sr) => sr.data.forEach((d) => xs.add(d.x)));
    let gaps = 0;
    for (const x of xs) {
      let pos = 0;
      let neg = 0;
      for (const sr of series) {
        const d = sr.byX.get(x);
        if (!d || d.y === null) {
          gaps++;
          continue;
        }
        if (d.y >= 0) {
          d.y0 = pos;
          d.y1 = pos + d.y;
          pos = d.y1;
        } else {
          d.y0 = neg;
          d.y1 = neg + d.y;
          neg = d.y1;
        }
      }
    }
    if (gaps && stackedArea) ctx.issue("stack-gaps", "info", `${gaps} missing value${gaps === 1 ? "" : "s"} in the stack ${gaps === 1 ? "is" : "are"} drawn as gaps and do not contribute to the layers above.`);
  }

  // Reference
  let reference: CartesianModel["reference"] = null;
  if (refCol) {
    const vals = rows.map((r) => parseNumber(r[refCol]).value).filter((v): v is number => v !== null);
    if (vals.length) {
      const unique = new Set(vals);
      const value = unique.size === 1 ? vals[0] : vals.reduce((a, b) => a + b, 0) / vals.length;
      reference = { value, label: unique.size === 1 ? ctx.label(refCol) : `${ctx.label(refCol)} (average)` };
      if (unique.size > 1) ctx.adapt({ id: "reference-average", setting: "Mapping::Reference value", effective: "Average", reason: `${ctx.label(refCol)} varies across rows; the reference line shows its average.` });
    }
  }

  // Domains
  const yVals: (number | null)[] = [];
  for (const sr of series)
    for (const d of sr.data) {
      if (stacked || stackedArea) {
        yVals.push(d.y0 ?? null, d.y1 ?? null);
      } else yVals.push(d.y);
      if (d.low !== undefined) yVals.push(d.low);
      if (d.high !== undefined) yVals.push(d.high);
      if (d.total !== undefined) yVals.push(d.total);
    }
  if (reference) yVals.push(reference.value);
  const includeZero = isBar || area;
  const manual = s.has("Scaling / axes", "Manual range (min/max)") ? parseManualRange(s.raw("Scaling / axes", "Manual range (min/max)")) : null;
  const yDomain = computeDomain({ values: yVals, includeZero, padding: includeZero ? 0 : 0.06, manual: manual && (manual.min !== null || manual.max !== null) ? manual : null });
  for (const msg of yDomain.issues) ctx.issue(`domain:${msg}`, "warning", msg, ["Scaling / axes::Manual range (min/max)"]);
  let xDomain: [number, number] | null = null;
  if (xKind !== "category") {
    const xs = series.flatMap((sr) => sr.data.map((d) => d.x));
    if (xs.length) {
      let lo = Math.min(...xs);
      let hi = Math.max(...xs);
      if (lo === hi) {
        const pad = xKind === "time" ? 86_400_000 * 15 : Math.abs(lo) * 0.1 || 1;
        lo -= pad;
        hi += pad;
      } else if (variant === "scatter") {
        const d = computeDomain({ values: xs, includeZero: false, padding: 0.04 });
        [lo, hi] = d.domain;
      }
      xDomain = [lo, hi];
    }
  }

  // Axes
  const shared = s.list("Scaling / axes", "Show ticks / tick labels / gridlines");
  const hasShared = s.has("Scaling / axes", "Show ticks / tick labels / gridlines");
  const showTickLabels = hasShared ? shared.includes("Show Tick Labels") : true;
  let showGrid = hasShared ? shared.includes("Show Grid Lines") : true;
  let showXAxis = true;
  let showYAxis = true;
  let gridColor: string | undefined;
  if (variant === "area" && s.has("Line", "Show grid lines")) {
    const local = s.bool("Line", "Show grid lines", true);
    if (showGrid && !local) ctx.conflicts.push({ settings: ["Scaling / axes::Show Grid Lines", "Line::Show grid lines"], resolution: "Area › Show grid lines is off, so gridlines are hidden. Both settings must allow gridlines." });
    if (!showGrid && local && s.isExplicit("Line", "Show grid lines")) ctx.conflicts.push({ settings: ["Scaling / axes::Show Grid Lines", "Line::Show grid lines"], resolution: "Shared Show Grid Lines is off; the Area grid toggle cannot add gridlines on its own." });
    showGrid = showGrid && local;
  }
  if (variant === "range") {
    const localGrid = s.bool("Bar gradient", "Show grid", true);
    showXAxis = s.bool("Bar gradient", "Show X axis", true);
    showYAxis = s.bool("Bar gradient", "Show Y axis", true);
    if (showGrid && !localGrid) ctx.conflicts.push({ settings: ["Scaling / axes::Show Grid Lines", "Bar gradient::Show grid"], resolution: "Range › Show grid is off, so gridlines are hidden. Both settings must allow gridlines." });
    if (!showGrid && localGrid && s.isExplicit("Bar gradient", "Show grid")) ctx.conflicts.push({ settings: ["Scaling / axes::Show Grid Lines", "Bar gradient::Show grid"], resolution: "Shared Show Grid Lines is off; Range › Show grid cannot add gridlines on its own." });
    showGrid = showGrid && localGrid;
    const localColor = s.explicitColor("Bar gradient", "Grid color");
    if (localColor) gridColor = localColor;
  }
  const preset = s.str("Scaling / axes", "Tick label formatter") || "Default";
  const spec = s.str("Scaling / axes", "Format");
  const valuePreset = isTimePreset(preset) ? "Default" : preset;
  if (isTimePreset(preset) && xKind !== "time") ctx.issue("time-preset-na", "info", `Tick label formatter “${preset}” is a time format, but the X axis is not a time axis; values use Format / Number notation.`, ["Scaling / axes::Tick label formatter"]);
  if (preset !== "Default" && spec && !isTimePreset(preset)) ctx.conflicts.push({ settings: ["Scaling / axes::Tick label formatter", "Scaling / axes::Format"], resolution: `Tick label formatter “${preset}” overrides Format “${spec}”.` });
  const unitSuffix = variant === "hbar" ? s.str("Bar", "Value label unit") : variant === "range" ? s.str("Bar gradient", "Unit") : "";
  const axisFormat = ctx.formatter({ spec, preset: valuePreset });
  if (axisFormat.issue) ctx.issue("axis-format", "warning", `Format: ${axisFormat.issue}`, ["Scaling / axes::Format"]);
  const showTitles = s.bool("Scaling / axes", "Show Axes Labels");
  const titleColor = s.explicitColor("Scaling / axes", "Axis label color") ?? undefined;
  const titleOpacity = s.has("Scaling / axes", "Axis label opacity") ? s.slider("Scaling / axes", "Axis label opacity", 1) : 1;
  const tickCount = Math.round(s.slider("Scaling / axes", "Tick count", 0));
  const tickRotation = s.slider("Scaling / axes", "Tick rotation", 0);
  const axisOffset = s.slider("Scaling / axes", "Axis offset", 0);
  const tickMode = (s.str("Scaling / axes", "Tick mode") || "Standard").startsWith("End") ? "endpoints" : "standard";
  const trim = s.bool("Scaling / axes", "Trim edge ticks");
  const xName = variant === "hbar" ? (xCol ? ctx.label(xCol) : "Row") : xCol ? ctx.label(xCol) : "";
  const yName = variant === "range" ? `${lowCol ? ctx.label(lowCol) : "Low"} – ${highCol ? ctx.label(highCol) : "High"}` : countMode ? "Count" : yCol ? ctx.label(yCol) : mlCols ? "Value" : "";
  const xTitleText = s.str("Scaling / axes", "X axis label") || xName;
  const yTitleText = s.str("Scaling / axes", "Y axis label") || yName;
  let rangeYTicks = tickCount;
  if (variant === "range") {
    const local = s.num("Bar gradient", "Y tick count");
    if (local !== null && local >= 0) {
      if (tickCount > 0 && tickCount !== local) ctx.conflicts.push({ settings: ["Scaling / axes::Tick count", "Bar gradient::Y tick count"], resolution: `Range › Y tick count (${local}) is more specific and wins over the shared Tick count (${tickCount}).` });
      rangeYTicks = local;
    }
  }
  const yTickCount = variant === "range" ? rangeYTicks : tickCount;
  if (yTickCount >= 2 && tickMode === "standard" && !yDomain.manualApplied) yDomain.domain = niceDomainForCount(yDomain.domain, yTickCount);
  const baseAxis = {
    showTicks: hasShared ? shared.includes("Show Ticks") : true,
    titleColor,
    titleOpacity,
    tickMode: tickMode as AxisModel["tickMode"],
    tickRotation: 0,
    offset: 0,
    trimEdgeTicks: false,
    manual: null,
    domainIssues: [] as string[],
  };
  const xAxis: AxisModel = {
    ...baseAxis,
    showTickLabels: showTickLabels && showXAxis,
    showTicks: baseAxis.showTicks && showXAxis,
    showGrid: showGrid && (variant === "scatter" || variant === "hbar" && s.str("Bar", "Layout") === "Cartesian"),
    gridColor,
    title: showTitles && xTitleText ? xTitleText : null,
    tickCount: variant === "hbar" ? tickCount : tickCount,
    tickRotation,
    offset: axisOffset,
    trimEdgeTicks: trim,
    format: axisFormat,
    timePreset: isTimePreset(preset) ? preset : undefined,
  };
  const yAxis: AxisModel = {
    ...baseAxis,
    showTickLabels: showTickLabels && showYAxis,
    showTicks: baseAxis.showTicks && showYAxis,
    showGrid,
    gridColor,
    title: showTitles && yTitleText ? yTitleText : null,
    tickCount: variant === "range" ? rangeYTicks : tickCount,
    format: ctx.formatter({ spec, preset: valuePreset, unit: variant === "range" ? unitSuffix : undefined }),
    manual: yDomain.manualApplied && manual ? { min: yDomain.domain[0], max: yDomain.domain[1] } : null,
    domainIssues: yDomain.issues,
  };

  // Line styling
  const curve = s.str("Line", "Curve interpolation") || "Smooth";
  const strokeWidth = s.has("Line", "Stroke width") ? s.slider("Line", "Stroke width", 2) : 2;
  const showPoints = s.bool("Line", "Show data points");
  const pointFill = s.explicitColor("Line", "Point fill");
  const pointStroke = s.explicitColor("Line", "Point stroke");
  if ((pointFill || pointStroke) && series.length > 1) {
    ctx.adapt({ id: "point-color-multi", setting: "Line::Point fill", reason: "Point colors override series colors; series remain distinguishable by line color, dash and marker shape." });
  }
  if (s.str("Colors", "Gradient type") === "Radial" && (variant === "line" || variant === "area")) {
    ctx.issue("radial-na", "info", "Gradient type Radial applies to Scatter markers only; lines and areas use a linear value gradient.", ["Colors::Gradient type"]);
  }
  if (areaLineOverride) {
    ctx.issue("area-style-line", "info", "Chart style is Line on the Area asset; fills are hidden and series render as lines.", ["Line::Chart style"]);
  }
  const areaFill = area;
  const fillOpacity = variant === "area" ? s.slider("Colors", "Fill opacity", 40) / 100 : 0.22;

  // Area colors pair (single series only)
  const pair = variant === "area" && (s.isExplicit("Colors", "Line + Area colors") || s.stored["Area styling::Line + Area colors"] !== undefined) ? s.colorPair("Colors", "Line + Area colors") : null;
  if (pair && series.length === 1) {
    series[0].identity = { ...series[0].identity, color: pair.stroke };
  } else if (pair && series.length > 1) {
    ctx.adapt({ id: "area-pair-multi", setting: "Colors::Line + Area colors", reason: "Line + Area colors apply to single-series areas; multiple series use the palette so they stay distinguishable." });
  }

  // Value gradient / bar colors
  let valueGradient: CartesianModel["valueGradient"] = null;
  let barColors: string[] | null = null;
  if (mode && (mode.style === "Gradient" || mode.style === "Steps") && series.length === 1) {
    const valid = yVals.filter((v): v is number => v !== null);
    const dom: [number, number] = valid.length ? [Math.min(...valid), Math.max(...valid)] : [0, 1];
    const { stops, rescaled } = stopsForDomain(mode, dom);
    if (rescaled) ctx.adapt({ id: "stops-rescaled", setting: "Colors::Palette", reason: "Palette stops are outside the data range, so they are spread across the data range." });
    if (isBar || variant === "range") {
      if (mode.sequentialBasis === "Category") {
        barColors = categories.map((c, i) => seriesColors({ ...mode, style: "Gradient", sequentialBasis: "Category" }, categories).colors[i] ?? c);
      } else {
        barColors = categories.map((_, ci) => {
          const d = series[0].byX.get(ci);
          return d?.y != null ? colorAtValue(stops, d.y, mode.style === "Steps") : series[0].identity.color;
        });
      }
    } else if (variant !== "scatter") {
      const span = yDomain.domain[1] - yDomain.domain[0] || 1;
      valueGradient = {
        axis: "y",
        stops: stops.map((st) => ({ offset: Math.max(0, Math.min(1, (st.value - yDomain.domain[0]) / span)), color: st.color })),
      };
    }
  } else if (mode && mode.style === "Per Category" && series.length === 1 && (isBar || variant === "range")) {
    barColors = seriesColors(mode, categories).colors;
  }

  // Annotations
  const annotations: AnnotationModel[] = [];
  if (s.bool("Annotations", "Show annotations")) {
    const source = s.str("Annotations", "Source") || "Average";
    const label = s.str("Annotations", "Label");
    const unit = s.str("Annotations", "Unit");
    const showCaption = s.bool("Annotations", "Show caption on chart", true);
    const dash = dashFor(s.str("Annotations", "Line style") || "Dashed");
    const width = s.slider("Annotations", "Stroke width", 1.5);
    const follow = (s.str("Annotations", "Line shape (avg/max/min)") || "").startsWith("Follow");
    const plotted = series.flatMap((sr) => sr.data.filter((d) => d.y !== null).map((d) => ({ x: d.x, y: (stacked ? d.y1 : d.y) as number })));
    const fmt = ctx.formatter();
    const withUnit = (v: number) => `${fmt.format(v)}${unit ? ` ${unit}` : ""}`;
    if (source === "Average" || source === "Maximum" || source === "Minimum") {
      // Range intervals: Average is the mean midpoint, Maximum the highest High, Minimum the lowest Low.
      const intervals = variant === "range" ? series.flatMap((sr) => sr.data.filter((d) => d.low != null && d.high != null && !d.invalid).map((d) => [d.low as number, d.high as number])) : [];
      const ys = variant === "range" ? (source === "Average" ? intervals.map(([l, h]) => (l + h) / 2) : source === "Maximum" ? intervals.map(([, h]) => h) : intervals.map(([l]) => l)) : plotted.map((p) => p.y);
      if (ys.length) {
        const v = source === "Average" ? ys.reduce((a, b) => a + b, 0) / ys.length : source === "Maximum" ? Math.max(...ys) : Math.min(...ys);
        const kind = source === "Average" ? "average" : source === "Maximum" ? "maximum" : "minimum";
        if (follow && series.length === 1) ctx.issue("follow-single", "info", "Follow categories traces the statistic across series at each X; with one series it would repeat the series, so a straight line is drawn.", ["Annotations::Line shape (avg/max/min)"]);
        annotations.push({ kind, value: v, label: `${label || source}: ${withUnit(v)}`, showCaption, dash, strokeWidth: width, followCategories: follow && series.length > 1 });
      }
    } else if (source.startsWith("Linear trend")) {
      const fit = olsFit(plotted);
      if (!fit) ctx.issue("ols-insufficient", "info", "A linear trend needs at least two distinct X values with data; no trend is drawn.", ["Annotations::Source"]);
      else annotations.push({ kind: "trend", slope: fit.slope, intercept: fit.intercept, label: label || "Linear trend (OLS)", showCaption, dash, strokeWidth: width, followCategories: false });
    } else if (source.startsWith("Manual")) {
      const axis = s.str("Annotations", "Axis (manual only)") || "Y only (horizontal)";
      const raw = s.str("Annotations", "X position / Y value (manual)");
      if (!raw) ctx.issue("manual-annotation-empty", "info", "Manual annotation has no position, so nothing is drawn.", ["Annotations::X position / Y value (manual)"]);
      else if (axis.startsWith("Y")) {
        const v = Number(raw);
        if (!Number.isFinite(v)) ctx.issue("manual-annotation-invalid", "warning", `Manual Y value “${raw}” is not a number.`, ["Annotations::X position / Y value (manual)"]);
        else annotations.push({ kind: "manual-y", value: v, label: `${label || "Target"}: ${withUnit(v)}`, showCaption, dash, strokeWidth: width, followCategories: false });
      } else {
        const [xPart, yPart] = axis.startsWith("X and") ? raw.split(/\s*[,/]\s*/) : [raw, undefined];
        const yv = yPart !== undefined ? Number(yPart) : undefined;
        annotations.push({ kind: axis.startsWith("X and") ? "manual-xy" : "manual-x", xKey: xPart, value: yv !== undefined && Number.isFinite(yv) ? yv : undefined, label: label || xPart, showCaption, dash, strokeWidth: width, followCategories: false });
      }
    }
  }

  // Envelope
  const primaryColumn = variant === "range" ? highCol : yCol;
  const kpi = storyKpi(ctx, primaryColumn);
  const timeCol = xKind === "time" || chronological ? xCol : undefined;
  const badge = statusBadge(ctx, { valueText: kpi?.text, timeColumn: timeCol });
  const flags = evaluateFlags(ctx);
  const tooltip = tooltipConfig(ctx, unitSuffix || undefined);
  const statFor = (sr: CartesianSeries): number | null => {
    if (variant === "line" || variant === "area") {
      for (let i = sr.data.length - 1; i >= 0; i--) if (sr.data[i].y !== null) return sr.data[i].y;
      return null;
    }
    if (variant === "scatter") return sr.data.length;
    if (variant === "range") return null;
    const ys = sr.data.map((d) => d.y).filter((y): y is number => y !== null);
    return ys.length ? ys.reduce((a, b) => a + b, 0) : null;
  };
  const statLabel = variant === "line" || variant === "area" ? "Latest value" : variant === "scatter" ? "Points" : "Total";
  const hbarCategoryStack = variant === "hbar" && stacked;
  const legend = legendFor(
    ctx,
    series.map((sr) => ({ id: sr.identity.id, label: sr.identity.label, color: sr.identity.color, dash: sr.identity.dash || (sr.dashed ? "5 3" : ""), marker: sr.identity.marker, stat: statFor(sr) })),
    {
      statLabel,
      additive: variant === "scatter" || isAdditive(ctx.aggregation),
      format: ctx.formatter(),
      unavailableReason: hbarCategoryStack ? "Horizontal bars with stacked categories label segments directly; the catalog hides the legend for this layout." : undefined,
    },
  );

  // Data table
  const table = cartesianTable(ctx, { variant, xKind, categories, series, omitted, xName: xName || "X", yName: yName || "Value", seriesCol, countMode });

  // State
  let state: CartesianModel["state"] = "ready";
  let stateMessage: string | undefined;
  if (missing.length) {
    state = "missing-mapping";
    stateMessage = `Map ${missing.join(" and ")} to draw this chart.`;
  } else if (!rows.length) {
    state = "empty";
    stateMessage = "The data source returned no rows.";
  } else {
    const anyValue = series.some((sr) => sr.data.some((d) => (variant === "range" ? d.low != null || d.high != null : d.y !== null)));
    if (!anyValue) {
      state = "all-null";
      stateMessage = invalidY ? "No value could be read as a number, so there is nothing to plot." : "Every value is missing, so there is nothing to plot.";
    } else if (variant !== "range" && series.every((sr) => sr.data.every((d) => d.y === null || d.y === 0))) {
      ctx.issue("all-zero", "info", "All values are zero.");
    }
  }

  const visibleSeries = series.length;
  const summary =
    state !== "ready"
      ? stateMessage ?? ""
      : summarizeCartesian(variant, series, categories, xKind, yName || "value", ctx.formatter().format);

  return {
    kind: "cartesian",
    variant,
    visualId: ctx.input.visualId,
    family: ctx.asset.family,
    state,
    stateMessage,
    header: headerFor(ctx, { kpi, badge, flags }),
    insight: insightText(ctx, timeCol),
    legend,
    issues: ctx.issues,
    adaptations: ctx.adaptations,
    conflicts: ctx.conflicts,
    table,
    summary,
    reads: [...s.reads],
    flags,
    tooltip,
    showDataLabels: s.bool("Layout & visibility", "Show data labels"),
    cardOutline: s.bool("Layout & visibility", "Show card outline"),
    xKind,
    categories,
    series,
    xAxis,
    yAxis,
    yDomain: yDomain.domain,
    xDomain,
    includeZero,
    stacked: stacked || stackedArea,
    areaFill: areaFill && visibleSeries > 0,
    fillOpacity,
    curve,
    strokeWidth,
    points: { show: showPoints, radius: s.slider("Line", "Point radius", 5), strokeWidth: s.slider("Line", "Point stroke width", 2), fill: pointFill, stroke: pointStroke },
    bar: {
      showValues: s.bool("Bar", "Show values on bars") || s.bool("Layout & visibility", "Show data labels"),
      valuePosition: (s.str("Bar", "Value label position") || (variant === "hbar" ? "Inline" : "Above bar")).startsWith("Inline") ? "inline" : "above",
      track: ((s.str("Bar", "Background track style") || "None").toLowerCase() as "none" | "full" | "segmented"),
      strokeWidth: s.slider("Bar", "Stroke width", 0),
      layout: (s.str("Bar", "Layout") || "Inline") === "Cartesian" ? "cartesian" : "inline",
      labelColor: s.explicitColor("Bar", "Category label color"),
      unitSuffix,
      topN: topNRaw,
      omitted,
    },
    scatter: {
      minR: s.slider("Scatter", "Min bubble radius", 4),
      maxR: s.slider("Scatter", "Max bubble radius", 18),
      shape: ((s.str("Scatter", "Point shape") || "Circle").toLowerCase() as "circle" | "square" | "triangle"),
      fill: s.explicitColor("Scatter", "Fill color"),
      sizeDomain: (() => {
        const sizes = series.flatMap((sr) => sr.data.map((d) => d.size)).filter((v): v is number => v != null && v >= 0);
        return sizes.length ? [0, Math.max(...sizes)] : null;
      })(),
    },
    range: {
      showBars: s.bool("Bar gradient", "Show range bars", true),
      showValues: s.bool("Bar gradient", "Show value labels") || s.bool("Layout & visibility", "Show data labels"),
      showReference: s.bool("Bar gradient", "Show reference lines", true),
      showX: showXAxis,
      showY: showYAxis,
      padding: s.slider("Bar gradient", "Bar padding", 0.35),
      widthRatio: s.slider("Bar gradient", "Bar width ratio", 0.7),
      maxRadius: s.slider("Bar gradient", "Bar max radius", 100),
      opacity: s.slider("Bar gradient", "Bar opacity", 1),
      refStroke: s.slider("Bar gradient", "Ref line stroke width", 1.5),
      refOpacity: s.slider("Bar gradient", "Ref line opacity", 0.7),
      unit: unitSuffix,
      gradient: variant === "range" ? gradientStops(s.raw("Bar gradient", "Bar gradient")) : [],
    },
    annotations,
    valueGradient,
    barColors,
    aggregation: ctx.aggregation,
    reference,
  };
}

function gradientStops(raw: unknown): { color: string; at: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ color: String((r as { color?: string }).color ?? "#73adf5"), at: Number((r as { at?: number }).at ?? 0) }))
    .filter((r) => Number.isFinite(r.at))
    .sort((a, b) => a.at - b.at);
}

function summarizeCartesian(variant: Variant, series: CartesianSeries[], categories: string[], xKind: XKind, measure: string, fmt: (n: number | null) => string): string {
  const parts: string[] = [];
  const points = series.reduce((a, sr) => a + sr.data.length, 0);
  const kind = { line: "Line chart", area: "Area chart", bar: "Bar chart", hbar: "Horizontal bar chart", scatter: "Scatter plot", range: "Range chart" }[variant];
  parts.push(`${kind} of ${measure}${series.length > 1 ? ` with ${series.length} series` : ""}, ${xKind === "category" ? `${categories.length} categories` : `${points} points`}.`);
  const all = series.flatMap((sr) => sr.data.map((d) => ({ d, sr }))).filter((x) => x.d.y !== null);
  if (all.length && variant !== "range") {
    const max = all.reduce((a, b) => ((b.d.y as number) > (a.d.y as number) ? b : a));
    const min = all.reduce((a, b) => ((b.d.y as number) < (a.d.y as number) ? b : a));
    const where = (x: typeof max) => `${x.d.xLabel}${series.length > 1 ? `, ${x.sr.identity.label}` : ""}`;
    parts.push(`Highest ${fmt(max.d.y)} at ${where(max)}; lowest ${fmt(min.d.y)} at ${where(min)}.`);
  }
  return parts.join(" ");
}

function cartesianTable(
  ctx: DeriveContext,
  o: { variant: Variant; xKind: XKind; categories: string[]; series: CartesianSeries[]; omitted: string[]; xName: string; yName: string; seriesCol: string; countMode: boolean },
): DataTableModel {
  const notes: string[] = [];
  const multi = o.series.length > 1;
  const columns = [
    { key: "x", label: o.xName },
    ...(multi ? [{ key: "series", label: o.seriesCol ? ctx.label(o.seriesCol) : "Series" }] : []),
    ...(o.variant === "range"
      ? [
          { key: "low", label: "Low", numeric: true },
          { key: "high", label: "High", numeric: true },
        ]
      : [{ key: "y", label: o.yName, numeric: true }]),
    ...(o.series.some((sr) => sr.data.some((d) => d.total != null)) ? [{ key: "total", label: "Max / total", numeric: true }] : []),
    ...(o.series.some((sr) => sr.data.some((d) => d.size != null)) ? [{ key: "size", label: "Size", numeric: true }] : []),
    { key: "rows", label: "Rows", numeric: true },
  ];
  const cell = (n: number | null | undefined): TableCell => ({ text: n === undefined ? "" : formatExact(n ?? null), sort: n ?? null });
  const rows: Record<string, TableCell>[] = [];
  for (const sr of o.series)
    for (const d of sr.data) {
      const xText = o.xKind === "category" ? o.categories[d.x] ?? d.xLabel : d.xLabel;
      rows.push({
        x: { text: xText, sort: o.xKind === "category" ? d.x : d.x },
        ...(multi ? { series: { text: sr.identity.label, sort: sr.identity.index } } : {}),
        ...(o.variant === "range" ? { low: cell(d.low ?? null), high: cell(d.high ?? null) } : { y: cell(d.y) }),
        ...(d.total !== undefined ? { total: cell(d.total) } : {}),
        ...(d.size !== undefined ? { size: cell(d.size) } : {}),
        rows: { text: String(d.rowIndexes.length), sort: d.rowIndexes.length, note: d.duplicate ? "Several rows" : undefined },
      });
    }
  for (const c of o.omitted) rows.push({ x: { text: c, sort: Infinity, note: "Not shown (Top N)" }, y: { text: "Not shown (Top N)", sort: null }, rows: { text: "", sort: null } });
  if (o.omitted.length) notes.push(`${o.omitted.length} categor${o.omitted.length === 1 ? "y is" : "ies are"} not shown on the chart because of Top N.`);
  if (ctx.aggregation !== "raw") notes.push(`Values are ${ctx.s.str("Mapping", "Aggregation").toLowerCase()} per ${o.xKind === "category" ? "category" : "X value"}${multi ? " and series" : ""}; missing values are skipped.`);
  return { caption: `${ctx.input.title || ctx.asset.label} data`, columns, rows, notes };
}
