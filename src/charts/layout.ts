/**
 * Responsive layout policy. Pure: given the container size and the chart's
 * anatomy, decide which parts are shown, where the legend goes, and how much
 * room the plot gets. Absent parts consume no space.
 */

import type { Adaptation } from "./settings";
import { measureText, TEXT, wrapLines, type TextStyle } from "./textMeasure";

export type SizeMode = "micro" | "compact" | "regular" | "wide";

export function sizeModeFor(width: number): SizeMode {
  if (width < 320) return "micro";
  if (width < 480) return "compact";
  if (width < 768) return "regular";
  return "wide";
}

export const PAD: Record<SizeMode, number> = { micro: 8, compact: 12, regular: 16, wide: 16 };
const GAP = 8;
const LEGEND_ROW = 22;
const LEGEND_SIDE_WIDTH = { min: 120, max: 220 };
const SWATCH = 18;
const ITEM_GAP = 12;

export type LegendItemText = { label: string; valueText?: string; percentText?: string };

export type LayoutInput = {
  width: number;
  height: number;
  minPlot: { width: number; height: number };
  title: string;
  description?: string;
  hasKpi: boolean;
  hasBadge: boolean;
  flagCount: number;
  insight?: string;
  legend: {
    enabled: boolean;
    position: "top" | "bottom" | "left" | "right";
    items: LegendItemText[];
    showLabels: boolean;
    showValues: boolean;
    showPercentages: boolean;
  };
  legendExpanded: boolean;
  /** Assets without a plot (KPI card, table) never collapse to a summary. */
  hasPlot: boolean;
  /** Radial plots cannot use height beyond their width; that surplus goes to legend rows. */
  squarePlot?: boolean;
  measure?: (text: string, style: TextStyle) => number;
};

export type LegendPlan = {
  visible: boolean;
  position: "top" | "bottom" | "left" | "right";
  showValues: boolean;
  showPercentages: boolean;
  /** Rows needed for every item at this width. */
  rows: number;
  /** Rows shown before "Show all". */
  visibleRows: number;
  overflow: boolean;
  /** Pixel height reserved (top/bottom) or width (left/right). */
  size: number;
  labelMax: number;
  /** Legend replaced by a "N series" toggle. */
  collapsed: boolean;
};

export type LayoutPlan = {
  mode: SizeMode;
  width: number;
  height: number;
  pad: number;
  title: { lines: number; height: number; style: TextStyle };
  description: { visible: boolean; lines: number; height: number };
  kpi: { visible: boolean; compact: boolean; height: number };
  badgeInline: boolean;
  flags: { visible: boolean; collapsed: boolean };
  insight: { visible: boolean; lines: number; height: number };
  legend: LegendPlan;
  headerHeight: number;
  plot: { width: number; height: number };
  compactSummary: boolean;
  adaptations: Adaptation[];
};

function legendItemWidth(item: LegendItemText, opts: { showLabels: boolean; showValues: boolean; showPercentages: boolean; labelMax: number }, m: (t: string, s: TextStyle) => number) {
  let w = SWATCH;
  if (opts.showLabels) w += Math.min(m(item.label, TEXT.small), opts.labelMax);
  if (opts.showValues && item.valueText) w += 6 + m(item.valueText, TEXT.tick);
  if (opts.showPercentages && item.percentText) w += 6 + m(item.percentText, TEXT.tick);
  return w + ITEM_GAP;
}

export function flowRows(widths: number[], available: number): number {
  if (!widths.length) return 0;
  let rows = 1;
  let x = 0;
  for (const w of widths) {
    if (x > 0 && x + w > available) {
      rows++;
      x = 0;
    }
    x += w;
  }
  return rows;
}

export function planLayout(input: LayoutInput): LayoutPlan {
  const m = input.measure ?? measureText;
  const mode = sizeModeFor(input.width);
  const pad = PAD[mode];
  const inner = Math.max(0, input.width - pad * 2);
  const adaptations: Adaptation[] = [];

  const titleStyle = mode === "wide" ? TEXT.titleLarge : TEXT.title;
  const titleLine = mode === "wide" ? 24 : 20;
  const reserveRight = (input.hasBadge ? 80 : 0) + 32;
  const titleLinesFull = Math.min(2, wrapLines(input.title, titleStyle, Math.max(40, inner - reserveRight)));
  let titleLines = Math.max(1, titleLinesFull);

  const descLinesFull = input.description ? Math.min(2, wrapLines(input.description, TEXT.small, inner)) : 0;
  let showDesc = descLinesFull > 0 && mode !== "micro";
  if (input.description && mode === "micro") adaptations.push({ id: "desc-micro", reason: "Description is available from the info button at this width." });

  let kpiVisible = input.hasKpi;
  let kpiCompact = mode === "micro" || mode === "compact";
  let flagsCollapsed = mode === "micro" && input.flagCount > 1;

  const insightLinesFull = input.insight ? Math.min(2, wrapLines(input.insight, TEXT.small, inner)) : 0;
  let insightLines = insightLinesFull;

  // Legend
  const lg = input.legend;
  let legendVisible = lg.enabled && lg.items.length > 0;
  let position = lg.position;
  let showValues = lg.showValues;
  let showPercentages = lg.showPercentages;
  const labelMax = mode === "micro" ? 96 : mode === "compact" ? 140 : 200;
  const side = position === "left" || position === "right";
  if (legendVisible && side) {
    const widest = Math.max(...lg.items.map((it) => legendItemWidth(it, { ...lg, labelMax }, m)));
    const sideWidth = Math.min(LEGEND_SIDE_WIDTH.max, Math.max(LEGEND_SIDE_WIDTH.min, widest));
    if (inner - sideWidth - GAP < input.minPlot.width) {
      adaptations.push({ id: "legend-relocated", setting: "Legend::Position", requested: lg.position === "left" ? "Left" : "Right", effective: "Bottom", reason: `A side legend leaves less than ${input.minPlot.width}px for the plot at this width, so it moves below the chart.` });
      position = "bottom";
    }
  }

  const legendPlan = (availH: number): LegendPlan => {
    if (!legendVisible) return { visible: false, position, showValues, showPercentages, rows: 0, visibleRows: 0, overflow: false, size: 0, labelMax, collapsed: false };
    const opts = { showLabels: lg.showLabels, showValues, showPercentages, labelMax };
    if (position === "left" || position === "right") {
      const widest = Math.max(...lg.items.map((it) => legendItemWidth(it, opts, m)));
      const width = Math.min(LEGEND_SIDE_WIDTH.max, Math.max(LEGEND_SIDE_WIDTH.min, widest));
      return { visible: true, position, showValues, showPercentages, rows: lg.items.length, visibleRows: lg.items.length, overflow: false, size: width, labelMax: Math.min(labelMax, width - SWATCH - ITEM_GAP), collapsed: false };
    }
    const widths = lg.items.map((it) => legendItemWidth(it, opts, m));
    const rows = flowRows(widths, inner);
    const baseRows = mode === "micro" ? 1 : mode === "compact" ? 2 : 3;
    const squareTarget = Math.max(input.minPlot.height, Math.min(inner, availH * 0.62));
    const surplusRows = input.squarePlot && rows > baseRows ? Math.floor((availH - squareTarget) / LEGEND_ROW) - 1 : 0;
    const maxRows = baseRows + Math.max(0, surplusRows);
    const visibleRows = input.legendExpanded ? rows : Math.min(rows, maxRows);
    const expandedCap = Math.max(LEGEND_ROW * maxRows, Math.floor(input.height * 0.4));
    const size = input.legendExpanded ? Math.min(rows * LEGEND_ROW, expandedCap) + (rows > maxRows ? LEGEND_ROW : 0) : visibleRows * LEGEND_ROW + (rows > maxRows ? LEGEND_ROW : 0);
    return { visible: true, position, showValues, showPercentages, rows, visibleRows, overflow: rows > maxRows, size, labelMax, collapsed: false };
  };

  const compute = () => {
    const kpiH = kpiVisible ? (kpiCompact ? 28 : 34) : 0;
    const descH = showDesc ? descLinesFull * 16 : 0;
    const titleH = titleLines * titleLine;
    const headerH = titleH + (descH ? 2 + descH : 0) + (kpiH ? 4 + kpiH : 0);
    const insightH = insightLines ? insightLines * 16 : 0;
    const legend = legendPlan(input.height - pad * 2 - headerH - GAP - (insightH ? insightH + GAP : 0));
    const vertical = legend.visible && (legend.position === "top" || legend.position === "bottom") ? legend.size + GAP : 0;
    const horizontal = legend.visible && (legend.position === "left" || legend.position === "right") ? legend.size + GAP : 0;
    const plotH = input.height - pad * 2 - headerH - GAP - vertical - (insightH ? insightH + GAP : 0);
    const plotW = inner - horizontal;
    return { headerH, kpiH, descH, titleH, legend, insightH, plot: { width: Math.max(0, Math.floor(plotW)), height: Math.max(0, Math.floor(plotH)) } };
  };

  let r = compute();
  const fits = () => !input.hasPlot || (r.plot.height >= input.minPlot.height && r.plot.width >= input.minPlot.width);
  const steps: { when: () => boolean; apply: () => void; note: Adaptation }[] = [
    { when: () => showDesc, apply: () => (showDesc = false), note: { id: "drop-description", reason: "Description is hidden to keep the plot readable; it stays available from the info button." } },
    { when: () => insightLines > 1, apply: () => (insightLines = 1), note: { id: "insight-1line", reason: "Insight is shortened to one line." } },
    { when: () => legendVisible && (showValues || showPercentages), apply: () => ((showValues = false), (showPercentages = false)), note: { id: "legend-labels-only", setting: "Legend::Content", reason: "Legend shows labels only; values and percentages remain in the tooltip and data view." } },
    { when: () => kpiVisible && !kpiCompact, apply: () => (kpiCompact = true), note: { id: "kpi-compact", reason: "Headline KPI uses the compact size." } },
    { when: () => titleLines > 1, apply: () => (titleLines = 1), note: { id: "title-1line", reason: "Title is truncated to one line; the full title is in its tooltip." } },
    { when: () => insightLines > 0, apply: () => (insightLines = 0), note: { id: "drop-insight", reason: "Insight is hidden; it remains in the chart summary." } },
    { when: () => input.flagCount > 1 && !flagsCollapsed, apply: () => (flagsCollapsed = true), note: { id: "flags-collapsed", reason: "Flags are collapsed into a count." } },
    { when: () => legendVisible && !input.legendExpanded, apply: () => (legendVisible = false), note: { id: "legend-collapsed", setting: "Legend::Show legend", requested: "On", effective: "Collapsed", reason: "The legend is collapsed into a button so the plot keeps its minimum size." } },
    { when: () => kpiVisible && input.hasPlot, apply: () => (kpiVisible = false), note: { id: "kpi-hidden", reason: "Headline KPI is hidden; it remains in the compact summary and data view." } },
  ];
  let legendCollapsed = false;
  for (const step of steps) {
    if (fits()) break;
    if (!step.when()) continue;
    step.apply();
    if (step.note.id === "legend-collapsed") legendCollapsed = true;
    adaptations.push(step.note);
    r = compute();
  }
  const compactSummary = input.hasPlot && !fits();
  if (compactSummary) adaptations.push({ id: "compact-summary", reason: `The plot would be smaller than ${input.minPlot.width}×${input.minPlot.height}px, so a compact summary is shown. Use Expand or View data.` });

  return {
    mode,
    width: input.width,
    height: input.height,
    pad,
    title: { lines: titleLines, height: r.titleH, style: titleStyle },
    description: { visible: showDesc, lines: descLinesFull, height: r.descH },
    kpi: { visible: kpiVisible, compact: kpiCompact, height: r.kpiH },
    badgeInline: input.hasBadge,
    flags: { visible: input.flagCount > 0, collapsed: flagsCollapsed },
    insight: { visible: insightLines > 0, lines: insightLines, height: r.insightH },
    legend: { ...r.legend, collapsed: legendCollapsed && lg.enabled },
    headerHeight: r.headerH,
    plot: r.plot,
    compactSummary,
    adaptations,
  };
}

export function legendItemTextWidth(text: string): number {
  return measureText(text, TEXT.small);
}
