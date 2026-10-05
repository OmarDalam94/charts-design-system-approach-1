/**
 * Live SVG chart preview. Reads every catalog setting through `cfg`
 * and the derived mock-data `series` so controls change the visual.
 */

import { createContext, useContext, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MarkTip, PreviewSeries } from "./componentPreviewProfiles";
import MapPreview from "./MapPreview";
import { columnLabel } from "./mockDataset";
import {
  BRAND,
  asColorMode,
  asColorPair,
  asGradient,
  asRecord,
  asRepeatable,
  asStringArray,
  formatNumberByNotation,
  listHas,
  parseMinMax,
  resolveColorMode,
  sliderMapped,
  withOpacity,
  type ColorModeConfig,
} from "./previewTheme";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

export type ChartPreviewSize = "small" | "medium" | "large";

type PlotMetrics = { W: number; H: number; P: number };

const SIZE_PLOT: Record<ChartPreviewSize, PlotMetrics> = {
  small: { W: 152, H: 132, P: 12 },
  medium: { W: 348, H: 148, P: 18 },
  large: { W: 348, H: 340, P: 22 },
};

const PlotContext = createContext<PlotMetrics>(SIZE_PLOT.medium);
const usePlot = () => useContext(PlotContext);

const INK = "var(--lc-text-secondary)";
const INK_STRONG = "var(--lc-text-primary)";
const FS_TICK = 11;
const FS_CAPTION = 11;

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
const formatVisualNumber = (cfg: Cfg, value: number, spec = "") =>
  formatNumberByNotation(
    value,
    str(
      cfg("Mapping", "Number notation", "Compact (5.7M)"),
      "Compact (5.7M)",
    ),
    spec,
  );

const TOOLTIP_FIELDS = ["value", "category", "timestamp", "unit", "status"] as const;

function tipValue(
  cfg: Cfg,
  tip: MarkTip,
  field: string,
  numberFormat: string,
): string {
  if (field === "value") {
    if (tip.total != null && Number.isFinite(tip.total)) {
      return `${formatVisualNumber(cfg, tip.value, numberFormat)} / ${formatVisualNumber(cfg, tip.total, numberFormat)}`;
    }
    return formatVisualNumber(cfg, tip.value, numberFormat);
  }
  if (field === "category") return tip.category || tip.label;
  if (field === "timestamp") return tip.timestamp;
  if (field === "unit") return tip.unit;
  if (field === "status") return tip.status;
  if (field === "label" || field === "x") return tip.label;
  if (field === "y") return formatVisualNumber(cfg, tip.value, numberFormat);
  return "";
}

function markTooltip(cfg: Cfg, tip: MarkTip | undefined, fallbackLabel = "", fallbackValue?: number) {
  if (!bool(cfg("Tooltips", "Show tooltips", true), true)) return "";
  const data: MarkTip = tip ?? {
    label: fallbackLabel,
    value: fallbackValue ?? 0,
    category: fallbackLabel,
    timestamp: "",
    unit: "",
    status: "",
  };
  const rawFormat = str(cfg("Tooltips", "Tooltip format", ".0f"), ".0f");
  const axisFormat = str(cfg("Scaling / axes", "Format", ""), "");
  const numberFormat = rawFormat.includes("{") ? axisFormat : rawFormat || axisFormat || ".0f";
  const selected = asStringArray(cfg("Tooltips", "Tooltip content fields", ["value", "category", "timestamp"])).filter((f) =>
    (TOOLTIP_FIELDS as readonly string[]).includes(f),
  );
  const fields = selected.length ? selected : ["value", "category"];

  if (rawFormat.includes("{")) {
    return rawFormat.replace(/\{(\w+)\}/g, (_m, key: string) =>
      tipValue(cfg, data, key, numberFormat),
    );
  }

  return fields
    .map((field) => {
      const v = tipValue(cfg, data, field, numberFormat);
      if (!v) return "";
      return `${columnLabel(field)}: ${v}`;
    })
    .filter(Boolean)
    .join("\n");
}

const MAP_TIP_FIELDS = ["name", "value", "type", "status"] as const;

function mapTooltip(cfg: Cfg, tip: MarkTip | undefined) {
  if (!tip) return "";
  if (!bool(cfg("Tooltips", "Show tooltips", true), true)) return "";
  const selected = asStringArray(
    cfg(
      "Tooltips",
      "Tooltip content fields",
      cfg("Tooltip Fields", "Tooltip fields", ["name", "value", "type"]),
    ),
  ).filter((f) => (MAP_TIP_FIELDS as readonly string[]).includes(f));
  const fields = selected.length ? selected : ["name", "value"];
  const numberFormat = str(cfg("Tooltips", "Tooltip format", ".0f"), ".0f");
  return fields
    .map((field) => {
      const v =
        field === "name"
          ? tip.label
          : field === "value"
            ? formatVisualNumber(cfg, tip.value, numberFormat)
            : field === "type"
              ? tip.category
              : tip.status;
      if (!v) return "";
      return `${columnLabel(field)}: ${v}`;
    })
    .filter(Boolean)
    .join("\n");
}

const pickerCfg: Cfg = (_group, _name, fallback) => fallback;

const MAP_IDS = new Set(["arcs", "fences", "pillars", "discs", "map-area", "heatmap", "points", "wind", "water-surfaces"]);

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcStroke(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}
function wedge(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const [ox0, oy0] = polar(cx, cy, rO, a0);
  const [ox1, oy1] = polar(cx, cy, rO, a1);
  const [ix1, iy1] = polar(cx, cy, rI, a1);
  const [ix0, iy0] = polar(cx, cy, rI, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${ox0} ${oy0} A ${rO} ${rO} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${rI} ${rI} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

const pt = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
function linearPath(pts: [number, number][]) {
  return "M " + pts.map(pt).join(" L ");
}
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return linearPath(pts);
  let d = `M ${pt(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${pt(p2)}`;
  }
  return d;
}
function stepPath(pts: [number, number][], kind: string) {
  let d = `M ${pt(pts[0])}`;
  for (let i = 1; i < pts.length; i++) {
    if (kind.includes("before")) d += ` L ${pts[i - 1][0].toFixed(1)} ${pts[i][1].toFixed(1)} L ${pt(pts[i])}`;
    else if (kind.includes("after") || kind === "step") d += ` L ${pts[i][0].toFixed(1)} ${pts[i - 1][1].toFixed(1)} L ${pt(pts[i])}`;
    else d += ` L ${pts[i][0].toFixed(1)} ${pts[i - 1][1].toFixed(1)} L ${pt(pts[i])}`;
  }
  return d;
}
function buildPath(pts: [number, number][], curve: string) {
  const c = curve.toLowerCase();
  if (c.includes("step")) return stepPath(pts, c);
  if (c.includes("linear")) return linearPath(pts);
  return smoothPath(pts);
}

function colorFromCfg(cfg: Cfg) {
  return asColorMode(cfg("Colors", "Palette", cfg("Colors", "Single color", BRAND)));
}

function colorMode(
  cfg: Cfg,
  index: number,
  value: number,
  max: number,
  category?: string,
  n?: number,
  along?: { x: number; y: number },
): string {
  const mode = colorFromCfg(cfg);
  const unit = along ?? {
    x: index / Math.max((n ?? 1) - 1, 1),
    y: value / Math.max(max, 1),
  };
  const t =
    mode.style === "Gradient" && (mode.gradientAxis || "Y") === "X"
      ? unit.x
      : unit.y;
  return resolveColorMode(mode, t, index, category, n);
}

function axisAlong(index: number, n: number, value: number, min: number, max: number) {
  return {
    x: index / Math.max(n - 1, 1),
    y: (value - min) / (max - min || 1),
  };
}

function GradientPaint({
  id,
  mode,
  box,
  min = 0,
  max = 1,
}: {
  id: string;
  mode: ColorModeConfig;
  box?: { left: number; right: number; top: number; bottom: number };
  min?: number;
  max?: number;
}) {
  if (mode.style !== "Gradient") return null;
  const stops = [...mode.stops].sort((a, b) => a.value - b.value);
  if (!stops.length) return null;
  const reverse = Boolean(mode.gradientReverse);
  const axis = mode.gradientAxis || "Y";
  const span = max - min || 1;
  const stopEls = stops.map((s, i) => (
    <stop key={i} offset={`${((s.value - min) / span) * 100}%`} stopColor={withOpacity(s.color, s.opacity)} />
  ));

  if (box) {
    if (axis === "Y") {
      return (
        <linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1={box.left}
          y1={reverse ? box.top : box.bottom}
          x2={box.left}
          y2={reverse ? box.bottom : box.top}
        >
          {stopEls}
        </linearGradient>
      );
    }
    return (
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={reverse ? box.right : box.left}
        y1={box.bottom}
        x2={reverse ? box.left : box.right}
        y2={box.bottom}
      >
        {stopEls}
      </linearGradient>
    );
  }
  const x1 = axis === "X" ? (reverse ? "1" : "0") : "0";
  const x2 = axis === "X" ? (reverse ? "0" : "1") : "0";
  const y1 = axis === "Y" ? (reverse ? "0" : "1") : "0";
  const y2 = axis === "Y" ? (reverse ? "1" : "0") : "0";
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stopEls}
    </linearGradient>
  );
}

type RenderProps = {
  cfg: Cfg;
  chartId: string;
  visualId?: string;
  minimal?: boolean;
  compact?: boolean;
  series?: PreviewSeries;
  decorate?: boolean;
  hover?: number | null;
  setHover?: (i: number | null) => void;
  onMarkEnter?: (index: number, e: ReactMouseEvent) => void;
  onMarkLeave?: () => void;
};

function markHover(props: Pick<RenderProps, "setHover" | "onMarkEnter" | "onMarkLeave">, index: number) {
  return {
    style: { cursor: "pointer" as const },
    onMouseEnter: (e: ReactMouseEvent) => {
      props.setHover?.(index);
      props.onMarkEnter?.(index, e);
    },
    onMouseMove: (e: ReactMouseEvent) => props.onMarkEnter?.(index, e),
    onMouseLeave: () => {
      props.setHover?.(null);
      props.onMarkLeave?.();
    },
  };
}

function plotBox(cfg: Cfg, decorate: boolean, extraBottom = 0, extraTop = 0, { W, H, P }: PlotMetrics) {
  const axisOn = decorate && bool(cfg("Scaling / axes", "Show Axes Labels", false), false);
  const ticks = asStringArray(cfg("Scaling / axes", "Show ticks / tick labels / gridlines", []));
  const showTickLabels = decorate && listHas(ticks, "Show Tick Labels");
  const legend = decorate && bool(cfg("Legend", "Show legend", false), false);
  const legendPos = str(cfg("Legend", "Position", "Top"), "Top");
  const left = P + (showTickLabels ? 28 : 0) + (axisOn ? 16 : 0) + (legend && legendPos === "Left" ? 16 : 0);
  const right = W - P - (legend && legendPos === "Right" ? 16 : 0);
  const top = P + extraTop + (legend && legendPos === "Top" ? 16 : 0);
  const bottom = H - P - extraBottom - (legend && legendPos === "Bottom" ? 16 : 0) - (showTickLabels ? 16 : 0) - (axisOn ? 14 : 0);
  return { left, right, top, bottom, width: right - left, height: Math.max(20, bottom - top), showTickLabels, ticks, legend, legendPos, axisOn };
}

function AxisChrome({
  cfg,
  box,
  labels,
  max,
  min = 0,
  unit = "",
}: {
  cfg: Cfg;
  box: ReturnType<typeof plotBox>;
  labels: string[];
  max: number;
  min?: number;
  unit?: string;
}) {
  const { W } = usePlot();
  const format = str(cfg("Scaling / axes", "Format", ""), "");
  const tickMode = str(cfg("Scaling / axes", "Tick mode", "Standard"), "Standard");
  const showTicks = listHas(box.ticks, "Show Ticks");
  const showGrid = listHas(box.ticks, "Show Grid Lines");
  const yTicks = tickMode.includes("Endpoint") ? [min, max] : [min, min + (max - min) / 2, max];
  const xLabel =
    str(cfg("Scaling / axes", "X axis label", ""), "") || str(cfg("Mapping", "X axis", ""), "") || str(cfg("Mapping", "X value", ""), "");
  const yLabel =
    str(cfg("Scaling / axes", "Y axis label", ""), "") || str(cfg("Mapping", "Y axis", ""), "") || str(cfg("Mapping", "Y value", ""), "");
  const yLabelX = box.left - (box.showTickLabels ? 34 : 16);
  const yLabelY = (box.top + box.bottom) / 2;
  const xLabelY = box.bottom + (box.showTickLabels ? 26 : 14);
  const yTickUnit = unit
    ? /^[%°]/.test(unit)
      ? unit
      : ` ${unit}`
    : "";
  const compactXAxis = W < 220;
  const endpointXAxis =
    str(cfg("__dev", "Palette edge case", ""), "") === "more-values";
  const maxVisibleXTicks = compactXAxis
    ? Math.max(2, Math.floor(box.width / 52))
    : labels.length;
  const visibleXTickIndices = endpointXAxis
    ? new Set([0, Math.max(labels.length - 1, 0)])
    : new Set(
        Array.from(
          { length: Math.min(labels.length, maxVisibleXTicks) },
          (_, index) =>
            maxVisibleXTicks <= 1
              ? 0
              : Math.round(
                  (index * Math.max(labels.length - 1, 0)) /
                    Math.max(maxVisibleXTicks - 1, 1),
                ),
        ),
      );
  return (
    <g>
      {showGrid &&
        yTicks.map((t, i) => {
          const y = box.bottom - ((t - min) / (max - min || 1)) * box.height;
          return <line key={i} x1={box.left} y1={y} x2={box.right} y2={y} stroke="rgba(255,255,255,.08)" />;
        })}
      {showTicks &&
        yTicks.map((t, i) => {
          const y = box.bottom - ((t - min) / (max - min || 1)) * box.height;
          return <line key={`t${i}`} x1={box.left - 3} y1={y} x2={box.left} y2={y} stroke="rgba(255,255,255,.28)" />;
        })}
      {box.showTickLabels &&
        yTicks.map((t, i) => {
          const y = box.bottom - ((t - min) / (max - min || 1)) * box.height;
          return (
            <text key={`l${i}`} x={box.left - 6} y={y + 4} fill={INK} fontSize={FS_TICK} fontWeight="500" textAnchor="end">
              {formatVisualNumber(cfg, t, format)}
              {yTickUnit}
            </text>
          );
        })}
      {box.showTickLabels &&
        labels.map((lab, i) => {
          if ((compactXAxis || endpointXAxis) && !visibleXTickIndices.has(i)) {
            return null;
          }
          const columnX =
            box.left +
            ((i + 0.5) / Math.max(labels.length, 1)) * box.width;
          const x =
            columnX +
            (compactXAxis && i === 0
              ? 5
              : compactXAxis && i === labels.length - 1
                ? -5
                : 0);
          const maxChars = compactXAxis ? 7 : 12;
          return (
            <text key={`x${i}`} x={x} y={box.bottom + 13} fill={INK} fontSize={compactXAxis ? 9 : FS_TICK} fontWeight="500" textAnchor="middle">
              {lab.length > maxChars ? `${lab.slice(0, maxChars - 1)}…` : lab}
            </text>
          );
        })}
      {box.axisOn && yLabel && (
        <text
          x={yLabelX}
          y={yLabelY}
          fill={INK}
          fontSize={FS_CAPTION}
          fontWeight="500"
          textAnchor="middle"
          transform={`rotate(-90 ${yLabelX} ${yLabelY})`}
        >
          {yLabel}
        </text>
      )}
      {box.axisOn && xLabel && (
        <text x={(box.left + box.right) / 2} y={xLabelY} fill={INK} fontSize={FS_CAPTION} fontWeight="500" textAnchor="middle">
          {xLabel}
        </text>
      )}
    </g>
  );
}

function Legend({
  cfg,
  series,
  items,
  box,
}: {
  cfg: Cfg;
  series?: PreviewSeries;
  items: { label: string; color: string; value?: number }[];
  box: ReturnType<typeof plotBox>;
}) {
  if (!box.legend || !items.length) return null;
  const content = asStringArray(cfg("Legend", "Content", []));
  const showLabels = !content.length || listHas(content, "Show labels");
  const showValues = listHas(content, "Show values");
  const showPct = listHas(content, "Show percentages");
  const total = items.reduce((a, b) => a + (b.value ?? 0), 0) || 1;
  const { W, H, P } = usePlot();
  const pos = box.legendPos;
  const shown = items.slice(0, 4);
  const side = pos === "Left" || pos === "Right";
  const rowH = 16;

  const swatchAndLabel = (it: (typeof items)[number], x: number, y: number, anchor: "start" | "end") => {
    const bits = [
      showLabels ? it.label : "",
      showValues && it.value != null
        ? formatVisualNumber(cfg, it.value)
        : "",
      showPct && it.value != null ? `${Math.round((it.value / total) * 100)}%` : "",
    ].filter(Boolean);
    const swatchX = anchor === "end" ? x - 8 : x;
    const textX = anchor === "end" ? x - 12 : x + 11;
    return (
      <g>
        <rect x={swatchX} y={y - 7} width={8} height={8} rx={2} fill={it.color} />
        <text x={textX} y={y} fill={INK} fontSize={FS_TICK} fontWeight="500" textAnchor={anchor}>
          {bits.join(" ") || series?.legend || "Series"}
        </text>
      </g>
    );
  };

  if (side) {
    const blockH = shown.length * rowH;
    const y0 = (H - blockH) / 2 + rowH / 2;
    const x = pos === "Right" ? W - P : P;
    const anchor = pos === "Right" ? "end" : "start";
    return (
      <g>
        {shown.map((it, i) => (
          <g key={i}>{swatchAndLabel(it, x, y0 + i * rowH, anchor)}</g>
        ))}
      </g>
    );
  }

  const y = pos === "Bottom" ? H - 14 : 12;
  const x0 = P;
  return (
    <g>
      {shown.map((it, i) => (
        <g key={i}>{swatchAndLabel(it, x0 + i * 56, y, "start")}</g>
      ))}
    </g>
  );
}

function Annotation({ cfg, series, box, max, min = 0 }: { cfg: Cfg; series?: PreviewSeries; box: ReturnType<typeof plotBox>; max: number; min?: number }) {
  if (!bool(cfg("Annotations", "Show annotations", false), false)) return null;
  const source = str(cfg("Annotations", "Source", "Average"), "Average");
  const values = series?.values ?? [];
  if (!values.length) return null;
  let yVal = values.reduce((a, b) => a + b, 0) / values.length;
  if (source.startsWith("Maximum")) yVal = Math.max(...values);
  if (source.startsWith("Minimum")) yVal = Math.min(...values);
  if (source.startsWith("Linear")) {
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = yVal;
    const nume = values.reduce((a, y, i) => a + (i - xMean) * (y - yMean), 0);
    const deno = values.reduce((a, _, i) => a + (i - xMean) ** 2, 0) || 1;
    const slope = nume / deno;
    const intercept = yMean - slope * xMean;
    const y0 = intercept;
    const y1 = intercept + slope * (n - 1);
    const py0 = box.bottom - ((y0 - min) / (max - min || 1)) * box.height;
    const py1 = box.bottom - ((y1 - min) / (max - min || 1)) * box.height;
    const caption = bool(cfg("Annotations", "Show caption on chart", true), true);
    const label = str(cfg("Annotations", "Label", ""), "Trend");
    return (
      <g>
        <line x1={box.left} y1={py0} x2={box.right} y2={py1} stroke="rgba(255,255,255,.45)" strokeDasharray="4 3" />
        {caption && (
          <text x={box.left + 4} y={py1 - 4} fill={INK} fontSize={FS_CAPTION} fontWeight="500">
            {label}
          </text>
        )}
      </g>
    );
  }
  if (source.startsWith("Manual")) {
    const raw = str(cfg("Annotations", "X position / Y value (manual)", ""), "");
    const axis = str(cfg("Annotations", "Axis (manual only)", "Y only (horizontal)"), "Y only (horizontal)");
    const parts = raw.split(/[/,]/).map((s) => s.trim());
    const yManual = Number(parts[1] ?? parts[0]);
    if (Number.isFinite(yManual)) yVal = yManual;
    const y = box.bottom - ((yVal - min) / (max - min || 1)) * box.height;
    const xKey = parts[0];
    const xi = labelsIndex(series?.labels, xKey);
    const x = box.left + ((xi + 0.5) / Math.max(series?.labels?.length ?? 1, 1)) * box.width;
    return (
      <g>
        {(axis.includes("Y") || axis.includes("cross") || axis.includes("horizontal")) && (
          <line x1={box.left} y1={y} x2={box.right} y2={y} stroke="rgba(255,213,138,.7)" strokeDasharray="3 3" />
        )}
        {(axis.includes("X") || axis.includes("cross") || axis.includes("vertical")) && (
          <line x1={x} y1={box.top} x2={x} y2={box.bottom} stroke="rgba(255,213,138,.7)" strokeDasharray="3 3" />
        )}
      </g>
    );
  }
  const y = box.bottom - ((yVal - min) / (max - min || 1)) * box.height;
  const shape = str(cfg("Annotations", "Line shape (avg/max/min)", "Straight (full width)"), "Straight");
  const unit = str(cfg("Annotations", "Unit", ""), "");
  const label = str(cfg("Annotations", "Label", ""), source);
  const caption = bool(cfg("Annotations", "Show caption on chart", true), true);
  if (shape.toLowerCase().includes("follow") && series?.values) {
    const pts: [number, number][] = series.values.map((v, i) => [
      box.left + (i / Math.max(series.values!.length - 1, 1)) * box.width,
      box.bottom - ((v - min) / (max - min || 1)) * box.height,
    ]);
    return <path d={linearPath(pts)} fill="none" stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" />;
  }
  return (
    <g>
      <line x1={box.left} y1={y} x2={box.right} y2={y} stroke="rgba(255,255,255,.4)" strokeDasharray="4 3" />
      {caption && (
        <text x={box.left + 4} y={y - 5} fill={INK} fontSize={FS_CAPTION} fontWeight="500">
          {label} {formatVisualNumber(cfg, yVal)}
          {unit}
        </text>
      )}
    </g>
  );
}

function labelsIndex(labels: string[] | undefined, key: string) {
  if (!labels?.length) return 0;
  const i = labels.findIndex((l) => l.toLowerCase() === key.toLowerCase());
  return i >= 0 ? i : 0;
}

function Bars({ cfg, minimal, compact, series, decorate, hover, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const gradId = useId().replace(/:/g, "");
  const sort = minimal && !series ? false : bool(cfg("Bar", "Sort by value", false), false);
  const sortOrder = str(cfg("Bar", "Sort order", "Descending"), "Descending");
  const track = str(cfg("Bar", "Background track style", "None"), "None");
  const stack = bool(cfg("Bar", "Stack series", false), false);
  const source = series?.values ?? [40, 72, 30, 58, 90, 64];
  const sourceLabels = series?.labels ?? source.map((_, i) => String(i + 1));
  const groups = series?.groups;
  const paired = source.map((value, i) => ({
    value,
    label: sourceLabels[i] ?? "",
    i,
    total: series?.maxTotals?.[i],
  }));
  if (sort) paired.sort((a, b) => (sortOrder === "Ascending" ? a.value - b.value : b.value - a.value));
  const data = paired.map((p) => p.value);
  const labels = paired.map((p) => p.label);
  const n = Math.max(data.length, 1);
  const metrics = usePlot();
  const rangeRaw = String(cfg("Scaling / axes", "Manual range (min/max)", "")).trim();
  const totals = paired.map((p) => p.total).filter((t): t is number => t != null && Number.isFinite(t) && t > 0);
  const hasTotals = totals.length > 0;
  const showLabels =
    !minimal &&
    !compact &&
    (hasTotals ||
      bool(cfg("Bar", "Show values on bars", false), false) ||
      bool(cfg("Layout & visibility", "Show data labels", false), false));
  const dataMax = Math.max(...data, 1);
  const domain = parseMinMax(cfg("Scaling / axes", "Manual range (min/max)", ""), [0, hasTotals ? 100 : dataMax]);
  const min = rangeRaw ? domain[0] : 0;
  const max = rangeRaw ? domain[1] : hasTotals ? 100 : dataMax;
  const box = plotBox(cfg, !!decorate, 0, showLabels ? 16 : 0, metrics);
  const slot = box.width / n;
  const bw = slot * 0.62;
  const r = Math.min(bw / 2, 4);
  const mode = colorFromCfg(cfg);
  const yMax = groups?.length && stack && !hasTotals
    ? Math.max(
        ...labels.map((_, li) => groups.reduce((a, g) => a + (g.values[paired[li]?.i ?? li] ?? 0), 0)),
        1,
      )
    : max;
  const gradFill =
    mode.style === "Gradient" && mode.sequentialBasis !== "Category"
      ? `url(#${gradId})`
      : "";

  const stackedMax = yMax;
  const axisFmt = str(cfg("Scaling / axes", "Format", ""), "");

  const markColor = (index: number, value: number, seriesN: number, category?: string) =>
    gradFill || colorMode(cfg, index, value, stackedMax, category, seriesN, axisAlong(index, n, value, min, stackedMax));

  const fillH = (value: number, total: number | undefined) => {
    if (hasTotals && total != null && total > 0) return Math.min(value / total, 1) * box.height;
    return ((value - min) / (max - min || 1)) * box.height;
  };

  const trackRect = (x: number, width = bw) =>
    hasTotals ? (
      <rect
        x={x}
        y={box.top}
        width={width}
        height={box.height}
        rx={r}
        fill="color-mix(in srgb, var(--lc-text-primary) 14%, transparent)"
      />
    ) : null;

  const valueLabel = (value: number, total: number | undefined, x: number, y: number) =>
    showLabels ? (
      <text x={x + bw / 2} y={y - 4} fill={INK_STRONG} fontSize="10" textAnchor="middle">
        {hasTotals && total != null
          ? `${formatVisualNumber(cfg, value, axisFmt)} / ${formatVisualNumber(cfg, total, axisFmt)}`
          : formatVisualNumber(cfg, value, axisFmt)}
      </text>
    ) : null;

  return (
    <>
      {gradFill && (
        <defs>
          <GradientPaint id={gradId} mode={mode} box={box} min={min} max={stackedMax} />
        </defs>
      )}
      {decorate && <AxisChrome cfg={cfg} box={box} labels={labels} max={stack && groups && !hasTotals ? stackedMax : max} min={min} unit={series?.storyKpi?.unit} />}
      {data.map((d, i) => {
        const x = box.left + i * slot + (slot - bw) / 2;
        const srcIndex = paired[i]?.i ?? i;
        const total = paired[i]?.total;
        if (stack && groups?.length) {
          let y = box.bottom;
          return (
            <g key={i} {...markHover({ setHover, onMarkEnter, onMarkLeave }, srcIndex)}>
              {(track !== "None" || hasTotals) && (
                <rect x={x} y={box.top} width={bw} height={box.height} rx={r} fill="rgba(255,255,255,.06)" />
              )}
              {trackRect(x)}
              {groups.map((g, gi) => {
                const v = g.values[srcIndex] ?? 0;
                const bh = fillH(v, total);
                y -= bh;
                const color = markColor(gi, v, groups.length, g.name);
                return <rect key={g.name} x={x} y={y} width={bw} height={Math.max(0, bh)} fill={color} />;
              })}
              {valueLabel(d, total, x, y)}
            </g>
          );
        }
        if (groups?.length && !stack) {
          const gw = bw / groups.length;
          return (
            <g key={i} {...markHover({ setHover, onMarkEnter, onMarkLeave }, srcIndex)}>
              {trackRect(x)}
              {groups.map((g, gi) => {
                const v = g.values[srcIndex] ?? 0;
                const bh = fillH(v, total);
                const color = markColor(gi, v, groups.length, g.name);
                return <rect key={g.name} x={x + gi * gw} y={box.bottom - bh} width={Math.max(1, gw - 1)} height={bh} rx={2} fill={color} />;
              })}
            </g>
          );
        }
        const bh = fillH(d, total);
        const y = box.bottom - bh;
        const color = markColor(
          i,
          d,
          n,
          series?.colorCategories?.[srcIndex] ?? labels[i],
        );
        return (
          <g key={i} {...markHover({ setHover, onMarkEnter, onMarkLeave }, srcIndex)}>
            {track === "Full" && <rect x={x} y={box.top} width={bw} height={box.height} rx={r} fill="rgba(255,255,255,.06)" />}
            {track === "Segmented" &&
              [0.25, 0.5, 0.75].map((t) => (
                <line
                  key={t}
                  x1={x}
                  x2={x + bw}
                  y1={box.bottom - t * box.height}
                  y2={box.bottom - t * box.height}
                  stroke="rgba(255,255,255,.12)"
                />
              ))}
            {trackRect(x)}
            <rect x={x} y={y} width={bw} height={Math.max(0, bh)} rx={r} fill={color} opacity={hover === srcIndex ? 1 : 0.92} />
            {valueLabel(d, total, x, y)}
          </g>
        );
      })}
      {decorate && <Annotation cfg={cfg} series={series} box={box} max={max} min={min} />}
      {decorate && (
        <Legend
          cfg={cfg}
          series={series}
          items={
            groups?.length
              ? groups.map((g, i) => ({ label: g.name, color: colorMode(cfg, i, 1, 1, g.name, groups.length), value: g.values[0] }))
              : [{ label: series?.legend ?? "Series", color: colorMode(cfg, 0, data[0] ?? 1, max, labels[0] ?? "", n), value: data[0] }]
          }
          box={box}
        />
      )}
    </>
  );
}

function LineArea({ cfg, chartId, minimal, compact, series, decorate, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const gradId = useId().replace(/:/g, "");
  const grp = "Line";
  const style = str(cfg(grp, "Chart style", chartId === "area" ? "Area" : "Line"), "Line");
  const isArea = chartId === "area" || style === "Area";
  const showPoints = !minimal && !compact && bool(cfg(grp, "Show data points", false), false);
  const curve = str(cfg(grp, "Curve interpolation", "Smooth"), "Smooth");
  const fillOp = sliderMapped(cfg("Colors", "Fill opacity", cfg("Area styling", "Fill opacity", 40)), 0, 1, 0.35);
  const pair = asColorPair(cfg("Colors", "Line + Area colors", cfg("Area styling", "Line + Area colors", undefined)));
  const values = series?.values ?? [52, 48, 55, 42, 58, 61, 54];
  const labels = series?.labels ?? values.map((_, i) => String(i + 1));
  const groups = series?.groups;
  const domain = parseMinMax(cfg("Scaling / axes", "Manual range (min/max)", ""), [0, Math.max(...values, 1)]);
  const hasManual = String(cfg("Scaling / axes", "Manual range (min/max)", "")).trim();
  const min = hasManual ? domain[0] : Math.min(0, ...values);
  const max = hasManual ? domain[1] : Math.max(...values, 1);
  const box = plotBox(cfg, !!decorate, 0, 0, usePlot());
  const mode = colorFromCfg(cfg);
  const axisPaint =
    mode.style === "Gradient" && mode.sequentialBasis !== "Category"
      ? `url(#${gradId})`
      : "";
  const color0 = colorMode(cfg, 0, values[0] ?? 1, max, labels[0] ?? "", values.length, axisAlong(0, values.length, values[0] ?? 1, min, max));
  const stroke = axisPaint || (isArea ? pair.stroke || color0 : color0);
  const fill = axisPaint || (isArea ? pair.fill || color0 : color0);

  const toPts = (vals: number[]): [number, number][] =>
    vals.map((v, i) => [
      box.left + (i / Math.max(vals.length - 1, 1)) * box.width,
      box.bottom - ((v - min) / (max - min || 1)) * box.height,
    ]);

  const lines = groups?.length ? groups : [{ name: series?.legend ?? "Series", values }];

  return (
    <>
      {axisPaint && (
        <defs>
          <GradientPaint id={gradId} mode={mode} box={box} min={min} max={max} />
        </defs>
      )}
      {decorate && <AxisChrome cfg={cfg} box={box} labels={labels} max={max} min={min} unit={series?.storyKpi?.unit} />}
      {lines.map((line, li) => {
        const pts = toPts(line.values);
        const path = buildPath(pts, curve);
        const area = `${path} L ${pts[pts.length - 1][0].toFixed(1)} ${box.bottom} L ${pts[0][0].toFixed(1)} ${box.bottom} Z`;
        const c = axisPaint || colorMode(cfg, li, line.values[0] ?? 1, max, line.name, lines.length);
        const sc = li === 0 && isArea ? stroke : c;
        return (
          <g key={line.name}>
            {isArea && <path d={area} fill={li === 0 ? fill : c} opacity={fillOp} />}
            <path d={path} fill="none" stroke={sc} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            {(showPoints || decorate) &&
              pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={showPoints ? 3 : 10}
                  fill={showPoints ? (axisPaint ? colorMode(cfg, i, line.values[i] ?? 0, max, line.name, pts.length, axisAlong(i, pts.length, line.values[i] ?? 0, min, max)) : sc) : "transparent"}
                  stroke={showPoints ? "#0c0f15" : "none"}
                  strokeWidth={showPoints ? "1.5" : 0}
                  {...markHover({ setHover, onMarkEnter, onMarkLeave }, i)}
                />
              ))}
          </g>
        );
      })}
      {series?.reference != null && (
        <line
          x1={box.left}
          x2={box.right}
          y1={box.bottom - ((series.reference - min) / (max - min || 1)) * box.height}
          y2={box.bottom - ((series.reference - min) / (max - min || 1)) * box.height}
          stroke="rgba(255,255,255,.35)"
          strokeDasharray="2 3"
        />
      )}
      {decorate && <Annotation cfg={cfg} series={series} box={box} max={max} min={min} />}
      {decorate && (
        <Legend
          cfg={cfg}
          series={series}
          items={lines.map((l, i) => ({ label: l.name, color: colorMode(cfg, i, 1, 1, l.name, lines.length), value: l.values[l.values.length - 1] }))}
          box={box}
        />
      )}
    </>
  );
}

function PieDonut({ cfg, chartId, minimal, compact, series, decorate, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const metrics = usePlot();
  const { W, H } = metrics;
  const data = series?.values ?? [34, 24, 18, 14, 10];
  const labels = series?.labels ?? data.map((_, i) => `S${i + 1}`);
  const total = data.reduce((a, b) => a + b, 0) || 1;
  const fmt = str(cfg("Pie / Donut", "Label format", "Percentage"), "Percentage");
  const isDonut = chartId !== "pie" || true;
  const legendOn = !!decorate && bool(cfg("Legend", "Show legend", false), false);
  const legendPos = str(cfg("Legend", "Position", "Left"), "Left");
  const sideLegend = legendOn && (legendPos === "Left" || legendPos === "Right");
  const shift = sideLegend ? Math.min(40, W * 0.1) : 0;
  const cx = W / 2 + (legendPos === "Left" ? shift : legendPos === "Right" ? -shift : 0);
  const cy = H / 2 + (decorate && !sideLegend ? 4 : 0);
  const rO = Math.min(W, H) * (sideLegend ? 0.28 : 0.32);
  const rI = isDonut ? rO * 0.54 : 0;
  let cursor = -90;
  const showLabels = !minimal && !compact && bool(cfg("Layout & visibility", "Show data labels", false), false);
  const max = Math.max(...data, 1);

  return (
    <>
      {data.map((d, i) => {
        const sweep = (d / total) * 360;
        const a0 = cursor + 1;
        const a1 = cursor + sweep - 1;
        cursor += sweep;
        const colorCategory = series?.colorCategories?.[i] ?? labels[i];
        const color = colorMode(cfg, i, d, max, colorCategory, data.length, axisAlong(i, data.length, d, 0, max));
        const [lx, ly] = polar(cx, cy, (rO + rI) / 2 + 2, (a0 + a1) / 2);
        const sliceLabel =
          fmt === "Value"
            ? formatVisualNumber(cfg, d)
            : fmt === "Both"
              ? `${formatVisualNumber(cfg, d)} (${Math.round((d / total) * 100)}%)`
              : `${Math.round((d / total) * 100)}%`;
        return (
          <g key={i} {...markHover({ setHover, onMarkEnter, onMarkLeave }, i)}>
            <path d={wedge(cx, cy, rO, rI, a0, a1)} fill={color} />
            {showLabels && sweep > 18 && (
              <text x={lx} y={ly + 3} fill="#fff" fontSize={FS_TICK} fontWeight="500" textAnchor="middle">
                {sliceLabel}
              </text>
            )}
          </g>
        );
      })}
      {isDonut && (
        <text x={cx} y={cy + 4} fill="#fff" fontSize="16" fontWeight="500" textAnchor="middle">
          {`${Math.round((Math.max(...data) / total) * 100)}%`}
        </text>
      )}
      {decorate && (
        <Legend
          cfg={cfg}
          series={series}
          items={labels.map((lab, i) => ({ label: lab, color: colorMode(cfg, i, data[i], max, series?.colorCategories?.[i] ?? lab, data.length), value: data[i] }))}
          box={plotBox(cfg, true, 0, 0, metrics)}
        />
      )}
    </>
  );
}

function PolarRose({ cfg, series, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const { W, H } = usePlot();
  const bands = series?.polar ?? [];
  const dirs = bands.length ? bands : [{ direction: "N", speed: 8, frequency: 4 }];
  const cx = W / 2;
  const cy = H / 2 + 4;
  const max = Math.max(...dirs.map((d) => d.frequency), 1);
  const maxSpeed = Math.max(...dirs.map((d) => d.speed), 1);
  const ring = Math.min(W, H) * 0.32;
  return (
    <>
      {[0.35, 0.65, 1].map((t) => (
        <circle key={t} cx={cx} cy={cy} r={ring * t} fill="none" stroke="rgba(255,255,255,.1)" />
      ))}
      {dirs.map((d, i) => {
        const ang = (i / dirs.length) * 360;
        const r = ring * 0.25 + (d.frequency / max) * ring * 0.75;
        const color = colorMode(cfg, i, d.speed, maxSpeed, d.colorCategory ?? d.direction, dirs.length, {
          x: i / Math.max(dirs.length - 1, 1),
          y: d.speed / maxSpeed,
        });
        const [x, y] = polar(cx, cy, r, ang);
        return (
          <g key={d.direction} {...markHover({ setHover, onMarkEnter, onMarkLeave }, i)}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth={Math.max(8, d.speed / 3)} strokeLinecap="round" opacity="0" />
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth={Math.max(2, d.speed / 3)} strokeLinecap="round" />
            <text x={polar(cx, cy, ring + 10, ang)[0]} y={polar(cx, cy, ring + 10, ang)[1] + 4} fill={INK} fontSize={FS_TICK} fontWeight="500" textAnchor="middle">
              {d.direction}
            </text>
          </g>
        );
      })}
    </>
  );
}

function Gauge({ cfg, visualId, minimal, compact, series, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const mode = colorFromCfg(cfg);
  const gaugeType = str(
    cfg(
      "Meter & Labels",
      "Gauge type",
      visualId === "gauge-circular" ? "Circular gauge" : "Vertical gauge",
    ),
    "Vertical gauge",
  );
  const showCenter = !minimal && !compact && bool(cfg("Meter & Labels", "Show center value", true), true);
  const base = mode.color;
  const ticksN = Math.round(sliderMapped(cfg("Meter & Labels", "Tick subdivisions", 40), 12, 120, 36));
  const movement = str(cfg("Meter & Labels", "Movement state", "Rising"), "Rising");
  const a0 = -180;
  const a1 = 0;
  const { W, H } = usePlot();
  const cx = W / 2;
  const cy = H / 2 + Math.min(H, W) * 0.08;
  const r = Math.min(W, H) * 0.38;
  const value = series?.gaugeValue ?? 72;
  const va = a0 + ((a1 - a0) * value) / 100;
  const [nx, ny] = polar(cx, cy, r - 12, va);
  const paletteZones = (mode.colors?.length ? mode.colors : mode.stops.map((s) => s.color)).filter(Boolean);
  const orderedZones = mode.gradientReverse
    ? [...paletteZones].reverse()
    : paletteZones;
  const zones = orderedZones.length >= 2 ? orderedZones.slice(0, 5) : ["#34d399", "#fbbf24", "#f87171"];
  const zonesOn = (minimal && !series) || mode.style !== "Single";

  if (gaugeType === "Vertical gauge") {
    const clampedValue = Math.max(0, Math.min(100, value));
    const trackHeight = Math.min(H * 0.68, 190);
    const trackTop = (H - trackHeight) / 2 - 8;
    const trackBottom = trackTop + trackHeight;
    const trackWidth = Math.max(12, Math.min(20, W * 0.06));
    const trackX = cx - trackWidth / 2;
    const valueY = trackBottom - (trackHeight * clampedValue) / 100;
    const labelX = trackX + trackWidth + 22;

    return (
      <g {...markHover({ setHover, onMarkEnter, onMarkLeave }, 0)}>
        <rect
          x={trackX}
          y={trackTop}
          width={trackWidth}
          height={trackHeight}
          rx={trackWidth / 2}
          fill="rgba(255,255,255,.12)"
        />
        {zonesOn ? (
          zones.map((color, i) => {
            const segmentHeight = trackHeight / zones.length;
            return (
              <rect
                key={color + i}
                x={trackX}
                y={trackBottom - segmentHeight * (i + 1)}
                width={trackWidth}
                height={segmentHeight + 0.5}
                fill={color}
              />
            );
          })
        ) : (
          <rect
            x={trackX}
            y={valueY}
            width={trackWidth}
            height={trackBottom - valueY}
            rx={trackWidth / 2}
            fill={base}
          />
        )}
        {Array.from({ length: ticksN }).map((_, i) => {
          const y = trackBottom - (trackHeight * i) / Math.max(ticksN - 1, 1);
          return (
            <line
              key={i}
              x1={trackX + trackWidth + 3}
              y1={y}
              x2={trackX + trackWidth + 7}
              y2={y}
              stroke="rgba(255,255,255,.35)"
              strokeWidth="1"
            />
          );
        })}
        <line
          x1={trackX - 4}
          y1={valueY}
          x2={trackX + trackWidth + 10}
          y2={valueY}
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {showCenter && (
          <text x={labelX} y={valueY + 5} fill="#fff" fontSize="20" fontWeight="500">
            {Math.round(value)}
          </text>
        )}
        <text
          x={cx}
          y={trackBottom + 24}
          fill={INK}
          fontSize={FS_CAPTION}
          fontWeight="500"
          textAnchor="middle"
        >
          {movement}
        </text>
      </g>
    );
  }

  return (
    <g {...markHover({ setHover, onMarkEnter, onMarkLeave }, 0)}>
      <path d={arcStroke(cx, cy, r, a0, a1)} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" strokeLinecap="round" />
      {zonesOn ? (
        zones.map((c, i) => {
          const z0 = a0 + ((a1 - a0) * i) / zones.length;
          const z1 = a0 + ((a1 - a0) * (i + 1)) / zones.length;
          return <path key={i} d={arcStroke(cx, cy, r, z0, z1)} fill="none" stroke={c} strokeWidth="10" strokeLinecap="round" />;
        })
      ) : (
        <path d={arcStroke(cx, cy, r, a0, va)} fill="none" stroke={base} strokeWidth="10" strokeLinecap="round" />
      )}
      {Array.from({ length: ticksN }).map((_, i) => {
        const ang = a0 + ((a1 - a0) * i) / Math.max(ticksN - 1, 1);
        const [x0, y0] = polar(cx, cy, r + 2, ang);
        const [x1, y1] = polar(cx, cy, r + 6, ang);
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(255,255,255,.25)" strokeWidth="1" />;
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="#fff" />
      {showCenter && (
        <text x={cx} y={cy - 18} fill="#fff" fontSize="20" fontWeight="500" textAnchor="middle">
          {Math.round(value)}
        </text>
      )}
      <text x={cx} y={cy + 16} fill={INK} fontSize={FS_CAPTION} fontWeight="500" textAnchor="middle">
        {movement}
      </text>
    </g>
  );
}

function Scatter({ cfg, series, decorate, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const radiusMin = sliderMapped(cfg("Scatter", "Min bubble radius", 16), 1, 20, 4);
  const radiusMax = sliderMapped(cfg("Scatter", "Max bubble radius", 9), 10, 100, 18);
  const points = series?.scatterPoints;
  const plot = plotBox(cfg, !!decorate, 0, 0, usePlot());
  const xs = points?.map((p) => p.x) ?? [];
  const ys = points?.map((p) => p.y) ?? [];
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const rs = points?.map((p) => p.r ?? 0) ?? [];
  const minR = Math.min(...rs, 0);
  const maxR = Math.max(...rs, 1);
  const cats = [...new Set(points?.map((p) => p.category || "") ?? [])];
  const marks = points
    ? points.map((p) => ({
        x: plot.left + ((p.x - minX) / (maxX - minX || 1)) * plot.width,
        y: plot.bottom - ((p.y - minY) / (maxY - minY || 1)) * plot.height,
        r: radiusMin + ((p.r ?? minR) - minR) / (maxR - minR || 1) * (radiusMax - radiusMin) * 0.25,
        category: p.category ?? "",
        value: p.y,
        along: {
          x: (p.x - minX) / (maxX - minX || 1),
          y: (p.y - minY) / (maxY - minY || 1),
        },
      }))
    : Array.from({ length: 18 }).map((_, i) => ({
        x: plot.left + ((i * 53) % plot.width),
        y: plot.top + ((i * i * 19) % plot.height),
        r: 3 + (i % 3),
        category: "",
        value: i,
        along: { x: i / 17, y: i / 17 },
      }));
  const maxV = Math.max(...marks.map((m) => m.value), 1);

  return (
    <>
      {decorate && <AxisChrome cfg={cfg} box={plot} labels={["min", "max"]} max={maxY} min={minY} unit={series?.storyKpi?.unit} />}
      {marks.map((p, i) => {
        const color = colorMode(cfg, cats.indexOf(p.category), p.value, maxV, p.category, Math.max(cats.length, marks.length), p.along);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={Math.max(2, p.r)}
            fill={color}
            opacity={0.82}
            {...markHover({ setHover, onMarkEnter, onMarkLeave }, i)}
          />
        );
      })}
      {decorate && (
        <Legend
          cfg={cfg}
          series={series}
          items={(cats.length ? cats : ["Points"]).map((c, i) => ({ label: c || "Points", color: colorMode(cfg, i, 1, 1, c, Math.max(cats.length, 1)) }))}
          box={plot}
        />
      )}
      {decorate && <Annotation cfg={cfg} series={{ values: ys }} box={plot} max={maxY} min={minY} />}
    </>
  );
}

function HBars({ cfg, chartId, minimal, compact, series, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const { W, H, P } = usePlot();
  const layout = str(cfg("Bar", "Layout", "Inline"), "Inline");
  const kpiMode = str(cfg("Bar", "KPI number mode", "Percentage"), "Percentage");
  const sort = minimal && !series ? false : bool(cfg("Bar", "Sort by value", false), false);
  const sortOrder = str(cfg("Bar", "Sort order", "Descending"), "Descending");
  const source = series?.values ?? (chartId === "progress" ? [68] : [84, 72, 61, 44]);
  const sourceLabels = series?.labels ?? source.map((_, i) => `Item ${i + 1}`);
  const paired = source.map((value, i) => ({
    value,
    label: sourceLabels[i] ?? "",
    i,
    maxTotal: series?.maxTotals?.[i] ?? series?.maxTotal,
  }));
  if (sort && chartId === "horizontalBar") {
    paired.sort((a, b) => (sortOrder === "Ascending" ? a.value - b.value : b.value - a.value));
  }
  const data = paired.map((p) => p.value);
  const labels = paired.map((p) => p.label);
  const minTotal = series?.minTotal ?? 0;
  const hasMappedTotal = paired.some((p) => p.maxTotal != null && p.maxTotal > 0);
  const showLabels =
    !minimal &&
    !compact &&
    (hasMappedTotal || bool(cfg("Layout & visibility", "Show data labels", false), false));
  const fallbackMax = Math.max(...data, 1);
  const n = data.length;
  const cartesian = layout === "Cartesian" && chartId === "horizontalBar";
  const labelW = cartesian ? 58 : 0;
  const plotW = W - 2 * P - labelW;
  const gap = 10;
  const bh = Math.min(H >= 280 ? 28 : 18, (H - 2 * P - gap * (n - 1)) / n);
  const track = str(cfg("Bar", "Background track style", "None"), "None");
  const showMarker = bool(cfg("Track & marker styling", "Show marker", true), true);
  const fillTo = bool(cfg("Track & marker styling", "Fill track to marker", false), false);
  const isScore = chartId === "score";
  const mode = colorFromCfg(cfg);
  const gradId = useId().replace(/:/g, "");
  const plotBoxH = {
    left: P + labelW,
    right: P + labelW + plotW,
    top: P,
    bottom: P + n * (bh + gap) - gap,
  };
  const gradFill =
    mode.style === "Gradient" && mode.sequentialBasis !== "Category"
      ? `url(#${gradId})`
      : "";
  const scaleMax = hasMappedTotal
    ? Math.max(...paired.map((p) => (p.maxTotal && p.maxTotal > 0 ? p.maxTotal : p.value)), 1)
    : fallbackMax;

  return (
    <>
      {gradFill && (
        <defs>
          <GradientPaint id={gradId} mode={mode} box={plotBoxH} min={minTotal} max={scaleMax} />
        </defs>
      )}
      {data.map((v, i) => {
        const y = P + i * (bh + gap);
        const cap = paired[i]?.maxTotal && paired[i]!.maxTotal! > 0 ? paired[i]!.maxTotal! : scaleMax;
        const span = cap - minTotal || 1;
        const color =
          gradFill ||
          colorMode(cfg, i, v, cap, series?.colorCategories?.[paired[i]?.i ?? i] ?? labels[i], n, {
            x: (v - minTotal) / span,
            y: i / Math.max(n - 1, 1),
          });
        const pct = Math.max(0, Math.min(1, (v - minTotal) / span));
        const w = Math.max(2, pct * plotW);
        const label =
          hasMappedTotal || kpiMode === "Value of total"
            ? `${formatVisualNumber(cfg, v)} / ${formatVisualNumber(cfg, cap)}`
            : `${Math.round(pct * 100)}%`;
        return (
          <g key={i} {...markHover({ setHover, onMarkEnter, onMarkLeave }, paired[i]?.i ?? i)}>
            {cartesian && (
              <text x={P + labelW - 4} y={y + bh / 2 + 4} fill={INK} fontSize={FS_TICK} fontWeight="500" textAnchor="end">
                {labels[i].length > 10 ? `${labels[i].slice(0, 9)}…` : labels[i]}
              </text>
            )}
            {(track !== "None" || chartId === "progress" || isScore || hasMappedTotal) && (
              <rect
                x={P + labelW}
                y={y}
                width={plotW}
                height={bh}
                rx={bh / 2}
                fill="color-mix(in srgb, var(--lc-text-primary) 14%, transparent)"
              />
            )}
            {(fillTo || !isScore) && (
              <rect x={P + labelW} y={y} width={w} height={bh} rx={bh / 2} fill={color} />
            )}
            {isScore && showMarker && <circle cx={P + labelW + w} cy={y + bh / 2} r={5} fill="#fff" stroke={color} strokeWidth="2" />}
            {showLabels && (
              <text x={P + labelW + plotW - 4} y={y + bh / 2 + 4} fill={INK_STRONG} fontSize={FS_TICK} fontWeight="500" textAnchor="end">
                {cartesian
                  ? formatVisualNumber(cfg, v)
                  : `${!cartesian ? labels[i] + "  " : ""}${
                      chartId === "progress" ||
                      isScore ||
                      hasMappedTotal
                        ? label
                        : formatVisualNumber(cfg, v)
                    }`}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function RangeChart({ cfg, series, decorate, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const rows = series?.ranges ?? [];
  const labels = rows.map((r) => r.label);
  const highs = rows.map((r) => r.high);
  const lows = rows.map((r) => r.low);
  const min = Math.min(...lows, 0);
  const max = Math.max(...highs, 1);
  const box = plotBox(cfg, !!decorate, 0, 0, usePlot());
  const stops = asGradient(cfg("Bar gradient", "Bar gradient", undefined));
  const n = Math.max(rows.length, 1);
  const slot = box.width / n;
  const bw = slot * 0.45;
  return (
    <>
      {decorate && <AxisChrome cfg={cfg} box={box} labels={labels} max={max} min={min} unit={series?.storyKpi?.unit} />}
      <defs>
        <linearGradient id="cp-range-grad" x1="0" y1="1" x2="0" y2="0">
          {stops.map((s) => (
            <stop key={s.at} offset={`${s.at}%`} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      {rows.map((row, i) => {
        const x = box.left + i * slot + (slot - bw) / 2;
        const y1 = box.bottom - ((row.high - min) / (max - min || 1)) * box.height;
        const y0 = box.bottom - ((row.low - min) / (max - min || 1)) * box.height;
        return (
          <g key={row.label} {...markHover({ setHover, onMarkEnter, onMarkLeave }, i)}>
            <line x1={x + bw / 2} y1={y0} x2={x + bw / 2} y2={y1} stroke="rgba(255,255,255,.2)" strokeWidth="6" strokeLinecap="round" />
            <rect x={x} y={y1} width={bw} height={Math.max(4, y0 - y1)} rx={4} fill="url(#cp-range-grad)" />
            <circle cx={x + bw / 2} cy={y1} r="4" fill="#fff" />
            <circle cx={x + bw / 2} cy={y0} r="4" fill="#fff" />
          </g>
        );
      })}
      {series?.reference != null && (
        <line
          x1={box.left}
          x2={box.right}
          y1={box.bottom - ((series.reference - min) / (max - min || 1)) * box.height}
          y2={box.bottom - ((series.reference - min) / (max - min || 1)) * box.height}
          stroke="rgba(255,255,255,.35)"
          strokeDasharray="2 3"
        />
      )}
    </>
  );
}

function Availability({ cfg, series }: RenderProps) {
  const { W, H, P } = usePlot();
  const rows = series?.availability ?? [];
  const cols = Math.max(...rows.map((r) => r.cells.length), 4);
  const gap = 4;
  const cellW = (W - 2 * P - gap * (cols - 1)) / cols;
  const cellH = (H - 2 * P - gap * (Math.max(rows.length, 1) - 1)) / Math.max(rows.length, 1);
  const max = Math.max(...rows.flatMap((r) => r.cells), 1);
  return (
    <>
      {(rows.length ? rows : [{ label: "A", cells: [40, 70, 20, 90] }]).map((row, ri) =>
        Array.from({ length: cols }).map((_, ci) => {
          const v = row.cells[ci] ?? 0;
          const color = colorMode(cfg, ci, v, max, row.label, cols);
          return (
            <rect
              key={`${ri}-${ci}`}
              x={P + ci * (cellW + gap)}
              y={P + ri * (cellH + gap)}
              width={cellW}
              height={cellH}
              rx={2}
              fill={v ? color : "rgba(255,255,255,.08)"}
              opacity={v ? 0.35 + (v / max) * 0.65 : 1}
            />
          );
        }),
      )}
    </>
  );
}

function Sankey({ cfg, minimal, compact, series, decorate, hover, setHover, onMarkEnter, onMarkLeave }: RenderProps) {
  const metrics = usePlot();
  const box = plotBox(cfg, !!decorate, 0, 0, metrics);
  const fallback = {
    nodes: [
      { id: "stage:0:A", label: "A", value: 62, category: "Source", stage: 0 },
      { id: "stage:0:B", label: "B", value: 38, category: "Source", stage: 0 },
      { id: "stage:1:C", label: "C", value: 45, category: "Target", stage: 1 },
      { id: "stage:1:D", label: "D", value: 55, category: "Target", stage: 1 },
    ],
    links: [
      { source: "stage:0:A", target: "stage:1:C", value: 36 },
      { source: "stage:0:A", target: "stage:1:D", value: 26 },
      { source: "stage:0:B", target: "stage:1:C", value: 9 },
      { source: "stage:0:B", target: "stage:1:D", value: 29 },
    ],
  };
  const graph = series?.sankey?.nodes.length ? series.sankey : fallback;
  const dataMaxLink = Math.max(...graph.links.map((link) => link.value), 1);
  const nodeWidth = sliderMapped(cfg("Sankey", "Node width", 33), 6, 30, 14);
  const nodeGap = sliderMapped(cfg("Sankey", "Node gap", 29), 4, 32, 12);
  const linkOpacity = sliderMapped(cfg("Sankey", "Link opacity", 50), 0.1, 1, 0.55);
  const curvature = sliderMapped(cfg("Sankey", "Link curvature", 55), 0, 1, 0.55);
  const showLabels =
    !minimal &&
    !compact &&
    bool(cfg("Sankey", "Show node labels", true), true);
  const showValues =
    !minimal &&
    !compact &&
    bool(cfg("Layout & visibility", "Show data labels", false), false);
  const showNodeText = showLabels || showValues;
  const labelRoom = showNodeText ? Math.min(58, box.width * 0.21) : 0;
  const sourceX = box.left + labelRoom;
  const targetX = box.right - labelRoom - nodeWidth;
  const stageValues = [...new Set(graph.nodes.map((node) => node.stage ?? 0))].sort((a, b) => a - b);
  const columns = stageValues.map((stage) =>
    graph.nodes.filter((node) => (node.stage ?? 0) === stage),
  );

  type SankeyNode = (typeof graph.nodes)[number];
  type PositionedNode = SankeyNode & { x: number; y: number; height: number; color: string };
  const positioned = new Map<string, PositionedNode>();
  const allMax = Math.max(...graph.nodes.map((node) => node.value), 1);

  const placeColumn = (nodes: SankeyNode[], x: number, colorOffset: number) => {
    const safeGap = Math.min(nodeGap, Math.max(2, (box.height - nodes.length * 8) / Math.max(nodes.length - 1, 1)));
    const available = Math.max(8 * nodes.length, box.height - safeGap * Math.max(nodes.length - 1, 0));
    const total = nodes.reduce((sum, node) => sum + node.value, 0) || 1;
    const heights = nodes.map((node) => Math.max(8, (node.value / total) * available));
    const used = heights.reduce((sum, height) => sum + height, 0) + safeGap * Math.max(nodes.length - 1, 0);
    let y = box.top + Math.max(0, (box.height - used) / 2);
    nodes.forEach((node, index) => {
      positioned.set(node.id, {
        ...node,
        x,
        y,
        height: heights[index],
        color: colorMode(
          cfg,
          colorOffset + index,
          node.value,
          allMax,
          node.label,
          graph.nodes.length,
        ),
      });
      y += heights[index] + safeGap;
    });
  };

  let colorOffset = 0;
  columns.forEach((nodes, columnIndex) => {
    const x =
      columns.length <= 1
        ? sourceX
        : sourceX + (columnIndex / (columns.length - 1)) * (targetX - sourceX);
    placeColumn(nodes, x, colorOffset);
    colorOffset += nodes.length;
  });
  const bend = Math.max(0, Math.min(1, curvature));
  const legendItems = (columns[0] ?? []).map((node) => ({
    label: node.label,
    color: positioned.get(node.id)?.color ?? BRAND,
    value: node.value,
  }));

  return (
    <>
      {graph.links.map((link, index) => {
        const source = positioned.get(link.source);
        const target = positioned.get(link.target);
        if (!source || !target) return null;
        const x1 = source.x + nodeWidth;
        const x2 = target.x;
        const y1 = source.y + source.height / 2;
        const y2 = target.y + target.height / 2;
        const dx = x2 - x1;
        const c1 = x1 + dx * bend;
        const c2 = x2 - dx * bend;
        const path = `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
        const scaledValue = Math.max(0, Math.min(1, link.value / dataMaxLink));
        return (
          <path
            key={`${link.source}-${link.target}`}
            d={path}
            fill="none"
            stroke={source.color}
            strokeWidth={2 + scaledValue * Math.min(16, box.height / 5)}
            strokeOpacity={hover == null || hover === index ? linkOpacity : linkOpacity * 0.22}
            strokeLinecap="round"
            {...markHover({ setHover, onMarkEnter, onMarkLeave }, index)}
          />
        );
      })}
      {[...positioned.values()].map((node) => {
        const columnIndex = stageValues.indexOf(node.stage ?? 0);
        const isFirstStage = columnIndex === 0;
        const isLastStage = columnIndex === columns.length - 1;
        const compactMiddleLabel = columns.length > 4 && !isFirstStage && !isLastStage;
        const maxLabelLength = compactMiddleLabel ? 4 : 8;
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={nodeWidth}
              height={node.height}
              rx={Math.min(3, nodeWidth / 4)}
              fill={node.color}
              stroke="rgba(255,255,255,.28)"
              strokeWidth="0.8"
            />
            {showNodeText && (
              <text
                x={
                  compactMiddleLabel
                    ? node.x + nodeWidth / 2
                    : isFirstStage
                      ? node.x - 5
                      : node.x + nodeWidth + 5
                }
                y={node.y + node.height / 2 + 3}
                fill={compactMiddleLabel ? INK_STRONG : INK}
                fontSize={compactMiddleLabel ? 7 : FS_TICK}
                fontWeight="500"
                textAnchor={compactMiddleLabel ? "middle" : isFirstStage ? "end" : "start"}
              >
                {showLabels
                  ? node.label.length > maxLabelLength
                    ? `${node.label.slice(0, maxLabelLength - 1)}…`
                    : node.label
                  : ""}
                {showLabels && showValues ? " · " : ""}
                {showValues ? formatVisualNumber(cfg, node.value) : ""}
              </text>
            )}
          </g>
        );
      })}
      {decorate && <Legend cfg={cfg} series={series} items={legendItems} box={box} />}
    </>
  );
}

function Kpi({ cfg, minimal, series }: RenderProps) {
  const { W, H, P } = usePlot();
  if (minimal && !series) {
    return (
      <>
        <rect x={P + 20} y={P + 18} width={W - 2 * P - 40} height={28} rx={6} fill="rgba(255,255,255,.08)" />
        <rect x={P + 20} y={P + 18} width={(W - 2 * P - 40) * 0.55} height={28} rx={6} fill={BRAND} opacity={0.9} />
      </>
    );
  }
  const showComparison = bool(cfg("KPI card", "Show comparison vs last period", true), true);
  const showUnit = bool(cfg("KPI card", "Show unit", true), true);
  const primary = series?.kpiPrimary ?? "84";
  const unit = showUnit ? (series?.kpiUnit ?? "%") : "";
  const comparison = series?.kpiComparison ?? "+6.2%";
  const color = colorFromCfg(cfg).color;
  return (
    <>
      <text x={W / 2} y={H / 2 + 2} fill={color} fontSize="40" fontWeight="500" textAnchor="middle">
        {primary}
        {unit}
      </text>
      {showComparison && (
        <text x={W / 2} y={H / 2 + 24} fill="rgba(255,255,255,.5)" fontSize="9" textAnchor="middle">
          {comparison}
        </text>
      )}
    </>
  );
}

function KpiGrid({ cfg, series }: RenderProps) {
  const { W, H, P } = usePlot();
  const tiles = series?.kpiTiles ?? [];
  const showPill = bool(cfg("KPI Grid", "Show status pill", true), true);
  const glow = bool(cfg("KPI Grid", "Highlight critical tiles (glow)", false), false);
  const accents = asRecord(
    Object.fromEntries(
      asRepeatable(cfg("Status", "Status → tile accent color", undefined)).map((r) => [
        r.label,
        withOpacity(r.color, r.opacity ?? 100),
      ]),
    ),
  );
  const gap = 8;
  const cardW = (W - 2 * P - gap) / 2;
  const cardH = (H - 2 * P - gap) / 2;
  const items = tiles.length ? tiles : [
    { label: "North", secondary: "Metro", value: "94", status: "On track" },
    { label: "East", secondary: "Coastal", value: "76", status: "At risk" },
  ];
  return (
    <>
      {items.slice(0, 4).map((t, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = P + col * (cardW + gap);
        const y = P + row * (cardH + gap);
        const accent = accents[t.status] || colorMode(cfg, i, Number(t.value), 100, t.status, 4);
        const critical = /risk|fail|critical/i.test(t.status);
        return (
          <g key={t.label}>
            <rect
              x={x}
              y={y}
              width={cardW}
              height={cardH}
              rx={6}
              fill="rgba(255,255,255,.06)"
              stroke={accent}
              strokeWidth={1.2}
              filter={glow && critical ? "url(#cp-glow)" : undefined}
            />
            <text x={x + 8} y={y + 14} fill="rgba(255,255,255,.5)" fontSize="7">
              {t.label}
            </text>
            <text x={x + 8} y={y + 32} fill="#fff" fontSize="14" fontWeight="500">
              {t.value}
            </text>
            {t.secondary && (
              <text x={x + 8} y={y + cardH - 8} fill="rgba(255,255,255,.35)" fontSize="7">
                {t.secondary}
              </text>
            )}
            {showPill && (
              <text x={x + cardW - 8} y={y + 14} fill={accent} fontSize="7" textAnchor="end">
                {t.status}
              </text>
            )}
          </g>
        );
      })}
      <defs>
        <filter id="cp-glow">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </>
  );
}

function Table({ minimal, series }: { minimal?: boolean; series?: PreviewSeries }) {
  const { W, H, P } = usePlot();
  if (minimal) {
    const rowH = (H - 2 * P) / 5;
    return (
      <>
        <rect x={P} y={P} width={W - 2 * P} height={rowH} rx={4} fill="rgba(255,255,255,.08)" />
        {Array.from({ length: 4 }).map((_, i) => {
          const y = P + rowH + 4 + i * (rowH + 4);
          return <rect key={i} x={P} y={y} width={W - 2 * P} height={rowH - 2} rx={3} fill="rgba(255,255,255,.05)" />;
        })}
      </>
    );
  }
  const table = series?.table;
  const header = table?.headers ?? table?.columns ?? ["Metric", "Value", "Status"];
  const bodyRows = table
    ? table.rows.slice(0, 4).map((row) => (table.columns ?? header).map((col) => String(row[col] ?? "")))
    : [
        ["Permits", "1,240", "Healthy"],
        ["Waste", "+15%", "Watch"],
      ];
  const rows = [header, ...bodyRows];
  const rowH = (H - 2 * P) / rows.length;
  return (
    <>
      {rows.map((cols, i) => (
        <g key={i}>
          {i > 0 && <line x1={P} y1={P + i * rowH} x2={W - P} y2={P + i * rowH} stroke="rgba(255,255,255,.08)" />}
          {cols.map((c, j) => (
            <text
              key={j}
              x={P + 6 + j * ((W - 2 * P) / Math.max(cols.length, 1))}
              y={P + i * rowH + rowH / 2 + 3}
              fill={i === 0 ? INK_STRONG : INK}
              fontSize={FS_TICK}
              fontWeight={i === 0 ? "600" : "500"}
            >
              {c}
            </text>
          ))}
        </g>
      ))}
    </>
  );
}

function StoryKpiUnit({ unit }: { unit: string }) {
  if (!unit) return null;
  const cubed = unit.match(/^(.*?)m\s*[³3]\s*$/i);
  if (cubed) {
    return (
      <span className="cp-preview__story-kpi-unit">
        {cubed[1]}m<sup>3</sup>
      </span>
    );
  }
  return <span className="cp-preview__story-kpi-unit">{unit}</span>;
}

type Props = {
  type: string;
  chartId: string;
  cfg?: Cfg;
  visualId?: string;
  minimal?: boolean;
  compact?: boolean;
  series?: PreviewSeries;
  chartTitle?: string;
  size?: ChartPreviewSize;
};

function useMeasuredPlot(size: ChartPreviewSize) {
  const ref = useRef<HTMLDivElement>(null);
  const [plot, setPlot] = useState(() => SIZE_PLOT[size]);

  useEffect(() => {
    setPlot(SIZE_PLOT[size]);
  }, [size]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr?.width || !cr?.height) return;
      const W = Math.max(120, Math.round(cr.width));
      const H = Math.max(80, Math.round(cr.height));
      const P = H >= 280 ? 22 : H >= 160 ? 18 : 12;
      setPlot((prev) => (prev.W === W && prev.H === H && prev.P === P ? prev : { W, H, P }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  return { ref, plot };
}

export default function ChartPreview({
  type,
  chartId,
  cfg = pickerCfg,
  visualId,
  minimal = false,
  compact = false,
  series,
  chartTitle,
  size = "medium",
}: Props) {
  const decorate = !minimal && !compact;
  const { ref, plot } = useMeasuredPlot(compact || minimal ? "small" : size);
  const [hover, setHover] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number; flip: boolean } | null>(null);
  const onMarkEnter = (index: number, e: ReactMouseEvent) => {
    setHover(index);
    setTipPos({ x: e.clientX, y: e.clientY, flip: e.clientY < 72 });
  };
  const onMarkLeave = () => {
    setHover(null);
    setTipPos(null);
  };
  const renderProps: RenderProps = {
    cfg,
    chartId,
    visualId,
    minimal,
    compact,
    series,
    decorate,
    hover,
    setHover,
    onMarkEnter,
    onMarkLeave,
  };
  const isMap = visualId ? MAP_IDS.has(visualId) : false;
  const storyUnitOnYAxis =
    !isMap &&
    ["bar", "line", "area", "scatter", "range"].includes(chartId);
  const tipText =
    decorate && hover != null
      ? isMap
        ? mapTooltip(cfg, series?.markTips?.[hover])
        : markTooltip(cfg, series?.markTips?.[hover], series?.labels?.[hover] ?? "", series?.values?.[hover])
      : "";

  let body: ReactNode;
  if (isMap)
    body = (
      <MapPreview
        cfg={cfg}
        visualId={visualId!}
        series={series}
        compact={compact || minimal}
        onMarkEnter={onMarkEnter}
        onMarkLeave={onMarkLeave}
      />
    );
  else if (chartId === "availability") body = <Availability {...renderProps} />;
  else if (chartId === "sankey") body = <Sankey {...renderProps} />;
  else if (chartId === "range") body = <RangeChart {...renderProps} />;
  else if (chartId === "kpiGrid") body = <KpiGrid {...renderProps} />;
  else if (chartId === "polar") body = <PolarRose {...renderProps} />;
  else if (chartId === "score" || chartId === "progress" || type === "horizontalBar") body = <HBars {...renderProps} />;
  else if (type === "line") body = <LineArea {...renderProps} />;
  else if (type === "donut") body = <PieDonut {...renderProps} />;
  else if (type === "gauge") body = <Gauge {...renderProps} />;
  else if (type === "scatter") body = <Scatter {...renderProps} />;
  else if (type === "kpi") body = <Kpi {...renderProps} />;
  else if (type === "table") body = <Table minimal={minimal} series={series} />;
  else body = <Bars {...renderProps} />;

  const title = chartTitle || series?.title;
  const showBadge =
    decorate &&
    Boolean(series?.badge) &&
    bool(cfg("Status badge", "Show status badge", true), true);

  const badgeStyle = series?.badge?.color ? { background: series.badge.color, color: "#0b1220" } : undefined;

  return (
    <PlotContext.Provider value={plot}>
      <div
        className={
          "cp-preview" +
          (minimal ? " cp-preview--minimal" : "") +
          (compact ? " cp-preview--compact" : "")
        }
      >
        {title && decorate && type !== "kpi" && type !== "table" && <p className="cp-preview__chart-title">{title}</p>}
        {decorate && series?.storyKpi && (
          <div className="cp-preview__story-kpi">
            <strong>{series.storyKpi.value}</strong>
            {!storyUnitOnYAxis && (
              <StoryKpiUnit unit={series.storyKpi.unit} />
            )}
          </div>
        )}
        {showBadge && series?.badge && (
          <span className={"cp-preview__badge cp-preview__badge--" + series.badge.tone} style={badgeStyle}>
            {series.badge.text}
          </span>
        )}
        <div className="cp-preview__plot" ref={ref}>
          <svg className="cp-svg" viewBox={`0 0 ${plot.W} ${plot.H}`} preserveAspectRatio="xMidYMid meet">
            {body}
          </svg>
        </div>
        {tipText &&
          tipPos &&
          createPortal(
            <div
              className="cp-preview__tip"
              style={{
                left: tipPos.x,
                top: tipPos.y,
                transform: tipPos.flip ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 10px))",
              }}
              role="tooltip"
            >
              {tipText.split("\n").map((line, i) => (
                <span key={`${i}-${line}`}>{line}</span>
              ))}
            </div>,
            document.body,
          )}
      </div>
    </PlotContext.Provider>
  );
}
