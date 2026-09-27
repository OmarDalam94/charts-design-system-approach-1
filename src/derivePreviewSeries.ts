import type { MarkTip, PreviewSeries } from "./componentPreviewProfiles";
import {
  DISTRICT_LAYOUT,
  MOCK_DATASET,
  columnLabel,
  type MockDataset,
  type MockRow,
} from "./mockDataset";
import { asColorMode, asRepeatable, asStringArray, formatCompactNumber, formatNumberByNotation, matchThreshold, parseMinMax, withOpacity } from "./previewTheme";

type Config = Record<string, unknown>;

function cfgStr(config: Config, group: string, name: string): string {
  const v = config[`${group}::${name}`];
  return typeof v === "string" ? v.trim() : "";
}

function cfgBool(config: Config, group: string, name: string): boolean | undefined {
  const v = config[`${group}::${name}`];
  return typeof v === "boolean" ? v : undefined;
}

function formatConfiguredNumber(
  config: Config,
  value: number,
  spec = "",
): string {
  return formatNumberByNotation(
    value,
    cfgStr(config, "Mapping", "Number notation") || "Compact (5.7M)",
    spec,
  );
}

function cell(row: MockRow, col: string): string | number | boolean | undefined {
  if (!col) return undefined;
  return row[col];
}

function numCell(row: MockRow, col: string): number {
  const v = cell(row, col);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function strCell(row: MockRow, col: string): string {
  const v = cell(row, col);
  return v == null ? "" : String(v);
}

function aggregate(values: number[], mode: string): number {
  if (!values.length) return 0;
  const m = mode.toLowerCase();
  if (m.startsWith("sum")) return values.reduce((a, b) => a + b, 0);
  if (m.startsWith("average") || m.startsWith("avg")) return values.reduce((a, b) => a + b, 0) / values.length;
  if (m.startsWith("min")) return Math.min(...values);
  if (m.startsWith("max")) return Math.max(...values);
  if (m.startsWith("count")) return values.length;
  return values[0];
}

function groupRows(rows: MockRow[], key: string): { label: string; rows: MockRow[] }[] {
  const order: string[] = [];
  const map = new Map<string, MockRow[]>();
  for (const row of rows) {
    const label = key ? strCell(row, key) || "(empty)" : String(order.length + 1);
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(row);
  }
  return order.map((label) => ({ label, rows: map.get(label)! }));
}

function markTipFromGroup(
  g: { label: string; rows: MockRow[] },
  valCol: string,
  agg: string,
): MarkTip {
  const first = g.rows[0] ?? {};
  const stamps = [...new Set(g.rows.map((r) => strCell(r, "timestamp")).filter(Boolean))];
  return {
    label: g.label,
    value: Number(aggregate(g.rows.map((r) => numCell(r, valCol)), agg).toFixed(2)),
    category: strCell(first, "category"),
    timestamp: stamps.length <= 1 ? (stamps[0] ?? "") : `${stamps[0]} – ${stamps[stamps.length - 1]}`,
    unit: strCell(first, "unit"),
    status: strCell(first, "status"),
  };
}

function markTipFromRow(row: MockRow, label: string, value: number): MarkTip {
  return {
    label,
    value,
    category: strCell(row, "category"),
    timestamp: strCell(row, "timestamp"),
    unit: strCell(row, "unit"),
    status: strCell(row, "status"),
  };
}

function mapped(config: Config, name: string, fallback = ""): string {
  return cfgStr(config, "Mapping", name) || fallback;
}

export function mappedMeasureColumn(config: Config, fallback = "value"): string {
  return (
    mapped(config, "Y axis") ||
    mapped(config, "Value") ||
    mapped(config, "X value") ||
    mapped(config, "Y value") ||
    mapped(config, "High value") ||
    mapped(config, "Intensity Value Field") ||
    mapped(config, "Wind speed") ||
    mapped(config, "Wind speed / band") ||
    mapped(config, "Low value") ||
    fallback
  );
}

function measureColumn(config: Config, fallback: string): string {
  const ml = cfgStr(config, "Mapping", "Y-axis values (ML only)");
  if (ml.includes("Predicted only")) return "predicted";
  if (ml.includes("Actual only")) return "actual";
  return mappedMeasureColumn(config, fallback);
}

function formatDelta(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return "";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function toneFromText(text: string): NonNullable<PreviewSeries["badge"]>["tone"] {
  const s = text.toLowerCase();
  if (s.includes("track") || s.includes("healthy") || s.includes("positive")) return "positive";
  if (s.includes("watch") || s.includes("review")) return "warning";
  if (s.includes("risk") || s.includes("fail") || s.includes("negative") || s.includes("critical")) return "negative";
  return "neutral";
}

function applyTopN<T>(items: T[], pct: number): T[] {
  if (pct <= 0 || pct >= 99 || items.length <= 1) return items;
  const take = Math.max(1, Math.round((pct / 100) * items.length));
  return items.slice(0, take);
}

function seriesFromGroups(
  groups: { label: string; rows: MockRow[] }[],
  yCol: string,
  agg: string,
): { labels: string[]; values: number[] } {
  return {
    labels: groups.map((g) => g.label),
    values: groups.map((g) => Number(aggregate(g.rows.map((r) => numCell(r, yCol)), agg).toFixed(2))),
  };
}

function seriesMaxTotals(
  groups: { label: string; rows: MockRow[] }[],
  maxCol: string,
  agg: string,
): number[] {
  return groups.map((g) => Number(aggregate(g.rows.map((r) => numCell(r, maxCol)), agg).toFixed(2)));
}

function calcFromNums(nums: number[], calc: string): number {
  if (!nums.length) return 0;
  const c = calc.toLowerCase();
  if (c.startsWith("last")) return nums[nums.length - 1] ?? 0;
  if (c.startsWith("maximum") || c.startsWith("max")) return Math.max(...nums);
  if (c.startsWith("minimum") || c.startsWith("min")) return Math.min(...nums);
  if (c.startsWith("sum")) return nums.reduce((a, b) => a + b, 0);
  return nums[0];
}

function buildBadge(config: Config, rows: MockRow[], statusCol: string, value: number): PreviewSeries["badge"] {
  if (cfgBool(config, "Status badge", "Show status badge") === false) {
    return undefined;
  }
  const source = cfgStr(config, "Status badge", "Text source") || "Specific column";
  const column = cfgStr(config, "Status badge", "Column") || statusCol;
  const template = cfgStr(config, "Status badge", "Template");
  const fallback = cfgStr(config, "Status badge", "Fallback");
  let text = strCell(rows[0] ?? {}, column || statusCol);
  if (source.includes("Manual")) text = fallback || text;
  else if (source.includes("Template")) {
    text = (template || "{status} · {value}")
      .replace(/\{status\}/g, strCell(rows[0] ?? {}, column || statusCol))
      .replace(/\{value\}/g, formatConfiguredNumber(config, value))
      .replace(/\{(\w+)\}/g, (_m: string, col: string) => strCell(rows[0] ?? {}, col));
  }
  const colorField = cfgStr(config, "Status badge", "Color Source") || measureColumn(config, "value");
  const thresholds = asRepeatable(config["Status badge::Color thresholds"]);
  const nums = rows.map((r) => numCell(r, colorField));
  const lo = Math.min(...thresholds.map((t) => Number(t.min)));
  const hi = Math.max(...thresholds.map((t) => Number(t.max) || Number(t.min)));
  let n = value;
  const kpiCalc = cfgStr(config, "KPI Display", "KPI value calculation");
  if (kpiCalc && !kpiCalc.toLowerCase().startsWith("hidden")) {
    n = calcFromNums(nums, kpiCalc);
  }
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    n = Math.max(lo, Math.min(hi, n));
  }

  const hit = matchThreshold(thresholds, n);
  let color: string | undefined;
  if (hit) {
    color = withOpacity(hit.color, hit.opacity ?? 100);
    const mappedOrDefault = !source.includes("Manual") && !source.includes("Template") && !source.includes("Specific");
    if (mappedOrDefault && hit.label) text = hit.label;
  }
  if (!text) return undefined;
  return { text, tone: toneFromText(text), color };
}

function buildStoryKpi(config: Config, rows: MockRow[]): PreviewSeries["storyKpi"] {
  const calc = cfgStr(config, "KPI Display", "KPI value calculation");
  const override = cfgBool(config, "KPI Display", "Manual override");
  const field =
    cfgStr(config, "KPI Display", "KPI value field") ||
    mapped(config, "Y axis") ||
    mapped(config, "Value") ||
    mapped(config, "X value") ||
    "value";
  const unitField = cfgStr(config, "KPI Display", "KPI unit field") || mapped(config, "Unit", "unit");
  if (override) {
    const value = cfgStr(config, "KPI Display", "Value");
    const unit = cfgStr(config, "KPI Display", "Unit") || strCell(rows[0] ?? {}, unitField);
    if (value) return { value, unit };
  }
  if (!calc || calc.toLowerCase().startsWith("hidden")) return undefined;
  const nums = rows.map((r) => numCell(r, field));
  const notation = cfgStr(config, "Mapping", "Number notation");
  return {
    value: notation && !notation.startsWith("Automatic")
      ? formatConfiguredNumber(config, calcFromNums(nums, calc))
      : formatCompactNumber(calcFromNums(nums, calc)),
    unit: strCell(rows[0] ?? {}, unitField),
  };
}

function layoutFor(label: string, i: number) {
  return DISTRICT_LAYOUT[label] ?? {
    x: 0.18 + (i % 3) * 0.32,
    y: 0.22 + Math.floor(i / 3) * 0.38,
  };
}

export function derivePreviewSeries({
  visualId,
  chartId,
  config,
  title,
  insight,
  dataset = MOCK_DATASET,
}: {
  visualId: string;
  chartId: string;
  config: Config;
  title?: string;
  insight?: string;
  dataset?: MockDataset;
}): PreviewSeries {
  const rows = dataset.rows;
  const agg = cfgStr(config, "Mapping", "Aggregation") || "None (raw value)";
  const yCol = measureColumn(config, "value");
  const statusCol = mapped(config, "Status", "status");
  const unitCol = mapped(config, "Unit", "unit");
  const seriesCol = mapped(config, "Series");
  const topNRaw = config["Bar::Top N categories"];
  const topN = topNRaw === undefined ? 100 : Number(topNRaw);
  const ml = cfgStr(config, "Mapping", "Y-axis values (ML only)");
  const unit = strCell(rows[0] ?? {}, unitCol);
  const firstValue = aggregate(rows.map((r) => numCell(r, yCol)), agg.startsWith("None") ? "Average" : agg);

  const out: PreviewSeries = {
    legend: seriesCol ? columnLabel(seriesCol, dataset) : columnLabel(yCol, dataset),
    badge: buildBadge(config, rows, statusCol, firstValue),
    title: title?.trim() || undefined,
    insight: insight?.trim() || undefined,
    storyKpi: buildStoryKpi(config, rows),
  };

  const refCol = mapped(config, "Reference value");
  if (refCol) out.reference = aggregate(rows.map((r) => numCell(r, refCol)), "Average");
  const maxCol =
    mapped(config, "Max/Total") ||
    mapped(config, "Max value") ||
    cfgStr(config, "KPI Display", "KPI max value field");
  const minCol = cfgStr(config, "KPI Display", "KPI min value field");
  if (maxCol) out.maxTotal = aggregate(rows.map((r) => numCell(r, maxCol)), "Average");
  if (minCol) out.minTotal = aggregate(rows.map((r) => numCell(r, minCol)), "Average");
  if (cfgBool(config, "KPI Display", "Manual override")) {
    const manMax = Number(cfgStr(config, "KPI Display", "Max"));
    const manMin = Number(cfgStr(config, "KPI Display", "Min"));
    if (Number.isFinite(manMax) && manMax > 0) out.maxTotal = manMax;
    if (Number.isFinite(manMin)) out.minTotal = manMin;
  }

  const isMap = [
    "arcs", "fences", "pillars", "discs", "map-area", "heatmap", "points", "wind",
  ].includes(visualId);

  if (
    chartId === "kpi" ||
    chartId === "legacyKpi" ||
    visualId === "kpi-card" ||
    visualId === "score-indicator"
  ) {
    const valueCol = mapped(config, "Value", yCol || "completion_rate");
    const calc = cfgStr(config, "Mapping", "Value calculation") || "First row";
    const nums = rows.map((r) => numCell(r, valueCol));
    const primary = calcFromNums(nums, calc);
    const cmpCol = mapped(config, "Comparison value", "predicted");
    const cmp = numCell(rows[0] ?? {}, cmpCol);
    const format = cfgStr(config, "KPI card", "Value format");
    out.kpiPrimary = formatConfiguredNumber(config, primary, format);
    out.kpiUnit =
      unit && cfgBool(config, "KPI card", "Show unit") !== false
        ? unit.startsWith("%") || format.toLowerCase().includes("percent")
          ? "%"
          : ` ${unit}`
        : "";
    out.kpiComparison = formatDelta(primary, cmp) || undefined;
    out.gaugeValue = Math.max(0, Math.min(100, primary));
    out.values = [primary];
    out.markTips = [markTipFromRow(rows[0] ?? {}, strCell(rows[0] ?? {}, statusCol) || "KPI", primary)];
    if (visualId !== "score-indicator") return out;
  }

  if (chartId === "kpiGrid" || visualId === "kpi-grid") {
    const labelCol = mapped(config, "Metric label", "district");
    const valueCol = mapped(config, "Value", "completion_rate");
    const secondaryCol = mapped(config, "Secondary label/context", "region");
    const groups = groupRows(rows, labelCol).slice(0, 4);
    out.kpiTiles = groups.map((g) => ({
      label: g.label,
      secondary: strCell(g.rows[0] ?? {}, secondaryCol),
      value: formatConfiguredNumber(
        config,
        aggregate(
          g.rows.map((r) => numCell(r, valueCol)),
          agg.startsWith("None") ? "Average" : agg,
        ),
      ),
      status: strCell(g.rows[0] ?? {}, statusCol),
    }));
    return out;
  }

  if (chartId === "table") {
    const visible = asStringArray(config["Mapping::Visible columns"]);
    const cols = visible.length ? visible : dataset.columns.slice(0, 4).map((c) => c.name);
    const headerRaw = cfgStr(config, "Mapping", "Header label per column");
    const headers = cols.map((col) => {
      const pair = headerRaw
        .split(/[,;\n]/)
        .map((s) => s.split(/[:=]/).map((p) => p.trim()))
        .find((p) => p[0] === col);
      return pair?.[1] || columnLabel(col, dataset);
    });
    out.table = { columns: cols, headers, rows: rows.slice(0, 8) };
    return out;
  }

  if (chartId === "gauge") {
    const valueCol = mapped(config, "Value", "completion_rate");
    const nums = rows.map((r) => numCell(r, valueCol));
    const value = aggregate(nums, agg.startsWith("None") ? "Average" : agg);
    const minCol = mapped(config, "Min field");
    const maxCol = mapped(config, "Max field");
    const legacy = parseMinMax(config["Mapping::Min/Max"], [NaN, NaN]);
    const minFallback = Number(cfgStr(config, "Mapping", "Min"));
    const maxFallback = Number(cfgStr(config, "Mapping", "Max"));
    const min = minCol
      ? aggregate(rows.map((r) => numCell(r, minCol)), agg.startsWith("None") ? "Average" : agg)
      : Number.isFinite(minFallback)
        ? minFallback
        : Number.isFinite(legacy[0])
          ? legacy[0]
          : 0;
    const max = maxCol
      ? aggregate(rows.map((r) => numCell(r, maxCol)), agg.startsWith("None") ? "Average" : agg)
      : Number.isFinite(maxFallback)
        ? maxFallback
        : Number.isFinite(legacy[1])
          ? legacy[1]
          : 100;
    const scaled = ((value - min) / (max - min || 1)) * 100;
    out.gaugeValue = Math.max(0, Math.min(100, scaled));
    out.values = [value];
    out.kpiPrimary = formatConfiguredNumber(config, value);
    out.kpiUnit = unit === "%" ? "%" : unit;
    out.markTips = [markTipFromRow(rows[0] ?? {}, "Value", value)];
    return out;
  }

  if (chartId === "sankey") {
    const stageCount = Math.max(
      2,
      Math.min(8, Number(cfgStr(config, "Mapping", "Number of stages")) || 2),
    );
    const sourceCol = mapped(config, "Source", "origin");
    const targetCol = mapped(config, "Target", "destination");
    const valueCol = mapped(config, "Value", "value");
    const intermediateDefaults = ["region", "category", "status", "series", "type", "direction"];
    const stageCols = [
      sourceCol,
      ...Array.from({ length: stageCount - 2 }, (_, index) =>
        mapped(config, `Stage ${index + 2}`, intermediateDefaults[index] ?? "category"),
      ),
      targetCol,
    ];
    const pairRows = new Map<
      string,
      { source: string; target: string; sourceStage: number; targetStage: number; rows: MockRow[] }
    >();

    rows.forEach((row) => {
      stageCols.forEach((column, sourceStage) => {
        if (sourceStage >= stageCols.length - 1) return;
        const targetStage = sourceStage + 1;
        const source = strCell(row, column);
        const target = strCell(row, stageCols[targetStage]);
        if (!source || !target) return;
        const key = `${sourceStage}\u0000${source}\u0000${target}`;
        const pair = pairRows.get(key);
        if (pair) pair.rows.push(row);
        else pairRows.set(key, { source, target, sourceStage, targetStage, rows: [row] });
      });
    });

    const pairs = [...pairRows.values()];
    const links = pairs
      .map((pair) => ({
        source: `stage:${pair.sourceStage}:${pair.source}`,
        target: `stage:${pair.targetStage}:${pair.target}`,
        value: Math.max(
          0,
          aggregate(
            pair.rows.map((row) => numCell(row, valueCol)),
            agg.startsWith("None") ? "Sum" : agg,
          ),
        ),
      }))
      .filter((link) => link.value > 0);

    const nodeFlows = new Map<
      string,
      { id: string; label: string; stage: number; incoming: number; outgoing: number }
    >();
    links.forEach((link) => {
      const sourceParts = link.source.split(":");
      const targetParts = link.target.split(":");
      const sourceStage = Number(sourceParts[1]);
      const targetStage = Number(targetParts[1]);
      const source = nodeFlows.get(link.source) ?? {
        id: link.source,
        label: sourceParts.slice(2).join(":"),
        stage: sourceStage,
        incoming: 0,
        outgoing: 0,
      };
      const target = nodeFlows.get(link.target) ?? {
        id: link.target,
        label: targetParts.slice(2).join(":"),
        stage: targetStage,
        incoming: 0,
        outgoing: 0,
      };
      source.outgoing += link.value;
      target.incoming += link.value;
      nodeFlows.set(link.source, source);
      nodeFlows.set(link.target, target);
    });

    const nodes = [...nodeFlows.values()].map((node) => ({
      id: node.id,
      label: node.label,
      stage: node.stage,
      value: Math.max(node.incoming, node.outgoing),
      category: columnLabel(stageCols[node.stage], dataset),
    }));

    out.sankey = { nodes, links };
    out.labels = nodes.map((node) => node.label);
    out.values = nodes.map((node) => node.value);
    out.legend = stageCols.map((column) => columnLabel(column, dataset)).join(" → ");
    out.markTips = pairs
      .map((pair) => {
        const link = links.find(
          (candidate) =>
            candidate.source === `stage:${pair.sourceStage}:${pair.source}` &&
            candidate.target === `stage:${pair.targetStage}:${pair.target}`,
        );
        if (!link) return null;
        return {
          ...markTipFromRow(pair.rows[0] ?? {}, `${pair.source} → ${pair.target}`, link.value),
          label: `${pair.source} → ${pair.target}`,
          category: pair.source,
        };
      })
      .filter((tip): tip is MarkTip => tip !== null);
    return out;
  }

  if (chartId === "scatter" && !isMap) {
    const xCol = mapped(config, "X value", "amount");
    const yScatter = mapped(config, "Y value", "incidents");
    const sizeCol = mapped(config, "Point size", "value");
    const pickerColorMode = asColorMode(config["Colors::Palette"]);
    const catCol =
      (pickerColorMode.categoryField !== "Auto"
        ? pickerColorMode.categoryField
        : "") ||
      mapped(config, "Color/Category", "category");
    out.scatterPoints = rows.map((r) => ({
      x: numCell(r, xCol),
      y: numCell(r, yScatter),
      r: sizeCol ? numCell(r, sizeCol) : undefined,
      category: catCol ? strCell(r, catCol) : undefined,
    }));
    out.markTips = rows.map((r) => markTipFromRow(r, strCell(r, catCol) || strCell(r, xCol), numCell(r, yScatter)));
    return out;
  }

  if (chartId === "polar" && !isMap) {
    const dirCol = mapped(config, "Direction", "direction");
    const speedCol = mapped(config, "Wind speed") || mapped(config, "Wind speed / band", "wind_speed");
    const bandCol = mapped(config, "Band");
    const freqCol = mapped(config, "Frequency");
    const pickerColorMode = asColorMode(config["Colors::Palette"]);
    const colorCategoryCol =
      pickerColorMode.categoryField !== "Auto"
        ? pickerColorMode.categoryField
        : bandCol || dirCol;
    const groups = groupRows(rows, dirCol);
    out.polar = groups.map((g) => ({
      direction: g.label,
      speed: aggregate(g.rows.map((r) => numCell(r, speedCol)), "Average"),
      frequency: freqCol ? aggregate(g.rows.map((r) => numCell(r, freqCol)), "Sum") : g.rows.length,
      colorCategory: strCell(g.rows[0] ?? {}, colorCategoryCol),
    }));
    out.labels = out.polar.map((p) => p.direction);
    out.values = out.polar.map((p) => p.frequency);
    out.markTips = groups.map((g, i) => ({
      ...markTipFromGroup(g, speedCol, "Average"),
      label: g.label,
      value: out.polar![i]?.frequency ?? 0,
      category: bandCol ? strCell(g.rows[0] ?? {}, bandCol) : strCell(g.rows[0] ?? {}, "category"),
    }));
    return out;
  }

  if (chartId === "availability") {
    const pickerColorMode = asColorMode(config["Colors::Palette"]);
    const cat =
      (pickerColorMode.categoryField !== "Auto"
        ? pickerColorMode.categoryField
        : "") ||
      mapped(config, "Value", "district");
    const val = yCol || "completion_rate";
    out.availability = groupRows(rows, cat).map((g) => ({
      label: g.label,
      cells: g.rows.map((r) => numCell(r, val)),
    }));
    return out;
  }

  if (isMap) {
    const locCol =
      mapped(config, "Location field") ||
      mapped(config, "Location") ||
      mapped(config, "Coordinates") ||
      mapped(config, "Coordinates (Geometry)") ||
      mapped(config, "Geometry") ||
      mapped(config, "Name") ||
      "district";
    const valCol =
      mapped(config, "Value") ||
      mapped(config, "Intensity Value Field") ||
      cfgStr(config, "Color", "Data Field") ||
      "value";
    const mapColorMode = asColorMode(config["Color::Palette"]);
    const autoCategoryCol =
      visualId === "points"
        ? cfgStr(config, "Color", "Color by category field") ||
          mapped(config, "Location field")
        : visualId === "discs"
          ? mapped(config, "Location field")
          : visualId === "fences"
            ? mapped(config, "Coordinates (Geometry)")
            : visualId === "arcs"
              ? mapped(config, "Origin")
              : visualId === "wind" || visualId === "heatmap"
                ? mapped(config, "Coordinates")
                : visualId === "map-area"
                  ? mapped(config, "Type") || mapped(config, "Name")
                  : "";
    const catCol =
      (mapColorMode.categoryField !== "Auto"
        ? mapColorMode.categoryField
        : "") ||
      autoCategoryCol ||
      "category";
    const groups = groupRows(rows, locCol);
    out.mapPoints = groups.map((g, i) => {
      const pos = layoutFor(g.label, i);
      return {
        id: g.label,
        label: g.label,
        x: pos.x,
        y: pos.y,
        value: aggregate(g.rows.map((r) => numCell(r, valCol)), agg.startsWith("None") ? "Average" : agg),
        category: strCell(g.rows[0] ?? {}, catCol),
        status: strCell(g.rows[0] ?? {}, statusCol),
        origin: strCell(g.rows[0] ?? {}, mapped(config, "Origin", "origin")),
        destination: strCell(g.rows[0] ?? {}, mapped(config, "Destination", "destination")),
        direction: strCell(g.rows[0] ?? {}, "direction"),
        speed: numCell(g.rows[0] ?? {}, mapped(config, "U Component (Eastward)", "wind_speed")),
      };
    });
    out.mapArcs = groups.map((g) => ({
      from: strCell(g.rows[0] ?? {}, mapped(config, "Origin", "origin")) || g.label,
      to: strCell(g.rows[0] ?? {}, mapped(config, "Destination", "destination")),
      value: aggregate(g.rows.map((r) => numCell(r, valCol)), "Sum"),
    }));
    out.labels = out.mapPoints.map((p) => p.label);
    out.values = out.mapPoints.map((p) => p.value);
    out.markTips = groups.map((g, i) => ({
      ...markTipFromGroup(g, valCol, agg.startsWith("None") ? "Average" : agg),
      label: out.mapPoints![i]?.label ?? g.label,
      value: out.mapPoints![i]?.value ?? 0,
      category: out.mapPoints![i]?.category ?? strCell(g.rows[0] ?? {}, catCol),
      status: out.mapPoints![i]?.status ?? strCell(g.rows[0] ?? {}, statusCol),
    }));
    const peak = out.mapPoints.reduce((a, p) => (p.value > a.value ? p : a), out.mapPoints[0]);
    if (!out.insight && peak) out.insight = `${peak.label} leads on mapped value`;
    return out;
  }

  if (chartId === "range") {
    const cat = mapped(config, "X axis", "district");
    const lowCol = mapped(config, "Low value", "incidents");
    const highCol = mapped(config, "High value", "value");
    const groups = applyTopN(groupRows(rows, cat), topN);
    out.ranges = groups.map((g) => ({
      label: g.label,
      low: aggregate(g.rows.map((r) => numCell(r, lowCol)), "Average"),
      high: aggregate(g.rows.map((r) => numCell(r, highCol)), "Average"),
    }));
    out.labels = out.ranges.map((r) => r.label);
    out.values = out.ranges.map((r) => r.high - r.low);
    out.markTips = groups.map((g, i) => ({
      ...markTipFromGroup(g, highCol, "Average"),
      value: out.ranges![i]?.high ?? 0,
    }));
    return out;
  }

  const isTime = chartId === "line" || chartId === "area";
  const isHorizontal = chartId === "horizontalBar" || chartId === "progress" || chartId === "score";
  const cat = isHorizontal
    ? mapped(config, "Y category", "district")
    : mapped(config, "X axis") || mapped(config, "Category") || (isTime ? "timestamp" : "district");
  const val = isHorizontal
    ? mapped(config, "X value", "value")
    : chartId === "bar" || isTime
      ? mapped(config, "Y axis", "value")
      : mapped(config, "Value", yCol);

  const groups = groupRows(rows, cat);
  const sliced = applyTopN(groups, isTime ? 100 : topN);
  const valueAgg = agg.startsWith("None") && isTime ? "Average" : agg.startsWith("None") && (chartId === "pie") ? "Sum" : agg;
  const grouped = seriesFromGroups(sliced, val, valueAgg);
  out.labels = grouped.labels;
  out.values = chartId === "progress" ? [grouped.values[0] ?? 0] : grouped.values;
  if (chartId === "progress") out.labels = grouped.labels.slice(0, 1);
  const colorMode = asColorMode(config["Colors::Palette"]);
  const categoryField =
    colorMode.categoryField === "Auto"
      ? seriesCol || cat
      : colorMode.categoryField;
  out.colorCategories = sliced.map(
    (group) => strCell(group.rows[0] ?? {}, categoryField) || group.label,
  );
  if (chartId === "progress") out.colorCategories = out.colorCategories.slice(0, 1);
  const tipAgg = valueAgg;
  const tipGroups = chartId === "progress" ? sliced.slice(0, 1) : sliced;
  out.markTips = tipGroups.map((g) => markTipFromGroup(g, val, tipAgg));

  const mappedMaxCol = mapped(config, "Max/Total");
  if (mappedMaxCol && (chartId === "bar" || chartId === "horizontalBar" || chartId === "progress" || chartId === "score")) {
    const totals = seriesMaxTotals(tipGroups, mappedMaxCol, valueAgg);
    out.maxTotals = totals;
    out.maxTotal = Math.max(...totals, 0);
    out.markTips = out.markTips.map((tip, i) => ({ ...tip, total: totals[i] }));
  }

  const dual = ml.includes("Actual vs predicted");
  if (seriesCol || dual) {
    const names = dual ? ["Actual", "Predicted"] : groupRows(rows, seriesCol).map((g) => g.label);
    const cols = dual ? ["actual", "predicted"] : [];
    out.groups = names.map((name, ni) => ({
      name,
      values: sliced.map((g) => {
        const subset = dual ? g.rows : g.rows.filter((r) => strCell(r, seriesCol) === name);
        const col = dual ? cols[ni] : val;
        return Number(aggregate(subset.map((r) => numCell(r, col)), agg.startsWith("None") ? "Average" : agg).toFixed(2));
      }),
    }));
  }

  if (!out.insight) {
    const peak = grouped.values.length ? grouped.labels[grouped.values.indexOf(Math.max(...grouped.values))] : "";
    if (peak) out.insight = `${peak} leads on ${columnLabel(val, dataset)}`;
  }

  return out;
}
