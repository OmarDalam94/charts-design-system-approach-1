import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { scaleBand, scaleLinear, scalePoint, scaleUtc } from "d3-scale";
import {
  area as d3area,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  line as d3line,
  type CurveFactory,
} from "d3-shape";
import type { CartesianDatum, CartesianModel, CartesianSeries } from "../model";
import { distinctTickLabels, formatExact, formatTime, formatTimeExact } from "../format";
import { planNumericTicks, planTimeTicks, scatterRadius, thinCategoryLabels } from "../scales";
import { measureText, TEXT, truncateText } from "../textMeasure";
import { markerPath } from "../identity";
import type { Adaptation } from "../settings";
import type { TooltipContent, TooltipRow } from "../primitives/Tooltip";
import { useStableId } from "../primitives/hooks";
import { anchorFromSvg, applyTemplate, PlotSurface, wrapIndex, type NavAction, type PlotProps } from "./shared";

const CURVES: Record<string, CurveFactory> = {
  smooth: curveMonotoneX,
  linear: curveLinear,
  step: curveStep,
  "step before": curveStepBefore,
  "step after": curveStepAfter,
  natural: curveNatural,
};

export function curveFor(name: string): CurveFactory {
  return CURVES[name.toLowerCase()] ?? curveMonotoneX;
}

type Slot = { key: number; px: number; label: string };

function valueText(model: CartesianModel, sr: CartesianSeries, d: CartesianDatum | undefined): string {
  if (!d) return "No data";
  if (model.variant === "range") {
    const f = model.yAxis.format.format;
    if (d.low == null && d.high == null) return "No value";
    const t = `${d.low == null ? "—" : f(d.low)} – ${d.high == null ? "—" : f(d.high)}`;
    return d.invalid ? `${t} (low above high)` : t;
  }
  if (d.y === null) return "No value";
  const v = model.tooltip.format.format(d.y);
  return applyTemplate(model.tooltip.template, v, { category: d.xLabel, series: sr.identity.label, timestamp: d.xLabel, unit: d.meta?.unit, status: d.meta?.status });
}

export function CartesianPlot(props: PlotProps<CartesianModel>) {
  if (props.model.variant === "hbar") return <HBarPlot {...props} />;
  return <XYPlot {...props} />;
}

/* ============================== XY ============================== */

function XYPlot({ model, width, height, mode, ix, report }: PlotProps<CartesianModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const clipId = useStableId("lc-clip");
  const gradId = useStableId("lc-grad");
  const descId = useStableId("lc-desc");
  const [active, setActive] = useState<{ xi: number; si: number } | null>(null);
  const v = model.variant;
  const visible = model.series.filter((s) => !ix.hidden.has(s.identity.id));
  const adaptations: Adaptation[] = [];
  const isBarLike = v === "bar" || v === "range";

  // Top N auto (0 = fit by width)
  let categories = model.categories;
  let catMap: number[] = categories.map((_, i) => i);
  if (v === "bar" && model.bar.topN === 0 && categories.length) {
    const fit = Math.max(1, Math.floor((width - 40) / (model.series.length > 1 && !model.stacked ? 10 * model.series.length : 14)));
    if (fit < categories.length) {
      const totals = categories.map((_, ci) => model.series.reduce((a, sr) => a + Math.abs(sr.byX.get(ci)?.y ?? 0), 0));
      const keep = new Set([...catMap].sort((a, b) => totals[b] - totals[a] || a - b).slice(0, fit));
      catMap = catMap.filter((i) => keep.has(i));
      categories = catMap.map((i) => model.categories[i]);
      adaptations.push({ id: "top-n-auto", setting: "Bar::Top N categories", requested: "0 (auto)", effective: `${fit} of ${model.categories.length}`, reason: `Auto Top N fits ${fit} categories at ${width}px; the rest stay in the data view.` });
    }
  }

  const yDom = model.yDomain;
  const showYLabels = model.yAxis.showTickLabels;
  const showXLabels = model.xAxis.showTickLabels;
  const yTitle = model.yAxis.title;
  const xTitle = model.xAxis.title;
  const topPad = (v === "bar" && model.bar.showValues && model.bar.valuePosition === "above") || model.annotations.some((a) => a.showCaption) || (v === "range" && model.range.showValues) ? 16 : 6;
  const rot = model.xAxis.tickRotation;
  const rad = (Math.abs(rot) * Math.PI) / 180;

  // First pass sizes
  const estBottom = (showXLabels ? 18 : 4) + (xTitle ? 16 : 0) + Math.max(0, model.xAxis.offset);
  const yPlan = planNumericTicks(yDom, Math.max(20, height - topPad - estBottom), { requested: model.yAxis.tickCount, minSpacingPx: mode === "micro" ? 20 : 26, endpointsOnly: model.yAxis.tickMode === "endpoints" });
  const yLab = distinctTickLabels(yPlan.values, model.yAxis.format.format);
  const yLabelW = showYLabels ? Math.max(0, ...yLab.labels.map((l) => measureText(l, TEXT.tick))) : 0;
  const left = Math.ceil((showYLabels ? yLabelW + 8 : 2) + (yTitle ? 18 : 0));
  const right = v === "scatter" ? 10 : 8;
  const plotW = Math.max(10, width - left - right);
  if (yPlan.reason) adaptations.push({ id: "y-ticks", setting: "Scaling / axes::Tick count", requested: String(yPlan.requested), effective: String(yPlan.effective), reason: yPlan.reason });
  if (yLab.raisedPrecision) adaptations.push({ id: "y-precision", setting: "Scaling / axes::Format", reason: "Tick labels use more decimals so that distinct ticks never read the same." });

  // X axis
  let xTicks: { px: number; label: string }[] = [];
  let bottomLabelH = 0;
  let xPos: (x: number) => number;
  let band = 0;
  let slots: Slot[] = [];
  if (model.xKind === "category") {
    const n = categories.length;
    if (isBarLike) {
      const s = scaleBand<number>().domain(catMap.map((_, i) => i)).range([0, plotW]).paddingInner(v === "range" ? model.range.padding : mode === "micro" ? 0.12 : 0.22).paddingOuter(model.xAxis.trimEdgeTicks ? 0 : 0.1);
      band = s.bandwidth();
      xPos = (i) => (s(i) ?? 0) + band / 2;
    } else {
      const s = scalePoint<number>().domain(catMap.map((_, i) => i)).range([0, plotW]).padding(model.xAxis.trimEdgeTicks ? 0 : 0.5);
      xPos = (i) => s(i) ?? 0;
      band = n > 1 ? plotW / n : plotW;
    }
    const slotPx = n ? plotW / n : plotW;
    const widths = categories.map((c) => Math.min(measureText(c, TEXT.tick), 140));
    const footprint = widths.map((w) => (rot ? Math.cos(rad) * w + Math.sin(rad) * 11 : w));
    let { indices, step } = thinCategoryLabels(footprint, slotPx);
    if (model.xAxis.tickCount > 0 && indices.length > model.xAxis.tickCount) {
      const k = Math.ceil(n / model.xAxis.tickCount);
      indices = indices.filter((_, i) => i % Math.ceil(k / step) === 0);
      step = k;
    }
    if (step > 1) adaptations.push({ id: "x-thinned", reason: `Every ${step === 2 ? "second" : `${step}th`} category label is shown so labels do not overlap; all categories stay in the tooltip and data view.` });
    xTicks = indices.map((i) => ({ px: xPos(i), label: truncateText(categories[i], TEXT.tick, 140) }));
    const maxW = Math.max(0, ...indices.map((i) => widths[i]));
    bottomLabelH = showXLabels ? (rot ? Math.sin(rad) * maxW + Math.cos(rad) * 11 + 6 : 18) : 0;
    slots = catMap.map((_, i) => ({ key: i, px: xPos(i), label: categories[i] }));
  } else {
    const dom = model.xDomain ?? [0, 1];
    if (model.xKind === "time") {
      const s = scaleUtc().domain([new Date(dom[0]), new Date(dom[1])]).range([0, plotW]);
      xPos = (x) => s(new Date(x));
      const sample = model.xAxis.timePreset ? formatTime(dom[1], model.xAxis.timePreset) : "Sep 2024";
      const plan = planTimeTicks(dom, plotW, measureText(sample, TEXT.tick) + 14, model.xAxis.tickCount);
      if (plan.reason) adaptations.push({ id: "x-ticks", setting: "Scaling / axes::Tick count", requested: String(plan.requested), effective: String(plan.effective), reason: plan.reason });
      let values = plan.values;
      if (model.xAxis.trimEdgeTicks) values = values.filter((t) => xPos(t) > plotW * 0.03 && xPos(t) < plotW * 0.97);
      xTicks = values.map((t) => ({ px: xPos(t), label: model.xAxis.timePreset ? formatTime(t, model.xAxis.timePreset) : plan.format(t) }));
    } else {
      const s = scaleLinear().domain(dom).range([0, plotW]);
      xPos = (x) => s(x);
      const plan = planNumericTicks(dom, plotW, { requested: model.xAxis.tickCount, minSpacingPx: 56, endpointsOnly: model.xAxis.tickMode === "endpoints" });
      if (plan.reason) adaptations.push({ id: "x-ticks", setting: "Scaling / axes::Tick count", requested: String(plan.requested), effective: String(plan.effective), reason: plan.reason });
      const lab = distinctTickLabels(plan.values, model.xAxis.format.format);
      let values = plan.values.map((t, i) => ({ t, label: lab.labels[i] }));
      if (model.xAxis.trimEdgeTicks) values = values.filter(({ t }) => xPos(t) > plotW * 0.03 && xPos(t) < plotW * 0.97);
      xTicks = values.map(({ t, label }) => ({ px: xPos(t), label }));
    }
    const maxW = Math.max(0, ...xTicks.map((t) => measureText(t.label, TEXT.tick)));
    bottomLabelH = showXLabels ? (rot ? Math.sin(rad) * maxW + Math.cos(rad) * 11 + 6 : 18) : 0;
    const keys = new Set<number>();
    for (const sr of visible) for (const d of sr.data) keys.add(d.x);
    slots = [...keys].sort((a, b) => a - b).map((k) => ({ key: k, px: xPos(k), label: model.xKind === "time" ? formatTimeExact(k) : formatExact(k) }));
  }
  // Clamping edge labels can push them into a neighbour, so collisions are resolved on final positions.
  const xLabels: { px: number; x: number; label: string }[] = [];
  if (!rot) {
    let lastEnd = -Infinity;
    for (const t of xTicks) {
      const half = measureText(t.label, TEXT.tick) / 2;
      const x = clampLabel(left + t.px, t.label, width, left);
      if (x - half < lastEnd + 4) continue;
      xLabels.push({ ...t, x });
      lastEnd = x + half;
    }
    if (xLabels.length < xTicks.length && showXLabels && !adaptations.some((a) => a.id === "x-thinned")) adaptations.push({ id: "x-thinned", reason: `${xTicks.length - xLabels.length} X tick label${xTicks.length - xLabels.length === 1 ? " is" : "s are"} hidden where labels would overlap; ticks and values stay in the tooltip and data view.` });
  }
  if (rot && showXLabels) adaptations.push({ id: "x-rotation", setting: "Scaling / axes::Tick rotation", requested: `${rot}°`, effective: `${rot}°`, reason: `Rotated labels reserve ${Math.round(bottomLabelH)}px below the plot.` });
  const offset = model.xAxis.offset;
  const bottom = Math.ceil(bottomLabelH + (xTitle ? 16 : 0) + 4 + Math.max(0, offset));
  const plotH = Math.max(10, height - topPad - bottom);
  const y = scaleLinear().domain(yDom).range([topPad + plotH, topPad]);
  const baseline = y(Math.max(yDom[0], Math.min(yDom[1], 0)));
  const X = (x: number) => left + xPos(x);

  // Marks
  const curve = curveFor(model.curve);
  const single = visible.length === 1;
  const gradient = model.valueGradient && single ? model.valueGradient : null;
  const lineGen = (stacked: boolean) =>
    d3line<CartesianDatum>()
      .defined((d) => d.y !== null)
      .x((d) => X(d.x))
      .y((d) => y(stacked ? (d.y1 as number) : (d.y as number)))
      .curve(curve);
  const areaGen = (stacked: boolean) =>
    d3area<CartesianDatum>()
      .defined((d) => d.y !== null)
      .x((d) => X(d.x))
      .y0((d) => (stacked ? y(d.y0 ?? 0) : baseline))
      .y1((d) => y(stacked ? (d.y1 as number) : (d.y as number)))
      .curve(curve);

  // Hover / keyboard
  const activeSlot = active ? slots[active.xi] : undefined;
  const datumsAt = (key: number) =>
    visible.map((sr) => ({ sr, ds: model.xKind === "category" ? [sr.byX.get(catMap[key])].filter(Boolean) as CartesianDatum[] : sr.data.filter((d) => d.x === key) }));

  const contentFor = (xi: number, si: number): TooltipContent => {
    const slot = slots[xi];
    if (v === "scatter") {
      const pts = flatPoints[xi];
      const sr = pts?.sr;
      const d = pts?.d;
      if (!sr || !d) return { title: "", rows: [] };
      const f = model.tooltip.format.format;
      return {
        title: model.series.length > 1 ? sr.identity.label : "Point",
        rows: [
          { id: "x", label: model.xAxis.title ?? "X", value: model.xAxis.format.format(d.x) },
          { id: "y", label: model.yAxis.title ?? "Y", value: d.y === null ? "No value" : f(d.y) },
          ...(d.size != null ? [{ id: "size", label: "Size", value: formatExact(d.size) }] : []),
        ],
      };
    }
    const fields = model.tooltip.fields;
    const rows: TooltipRow[] = [];
    if (fields.includes("value") || !fields.length) {
      datumsAt(slot.key).forEach(({ sr, ds }, i) => {
        if (!ds.length) rows.push({ id: sr.identity.id, label: sr.identity.label, value: "No data", color: sr.identity.color, dash: sr.identity.dash, marker: sr.identity.marker, active: i === si });
        ds.forEach((d, k) =>
          rows.push({ id: `${sr.identity.id}:${k}`, label: ds.length > 1 ? `${sr.identity.label} (row ${d.rowIndexes[0] + 1})` : sr.identity.label, value: valueText(model, sr, d), color: sr.identity.color, dash: v === "line" || v === "area" ? sr.identity.dash : undefined, marker: v === "line" || v === "area" ? sr.identity.marker : undefined, active: i === si }),
        );
      });
    }
    const footer: string[] = [];
    const first = datumsAt(slot.key).flatMap((x) => x.ds)[0];
    if (fields.includes("unit") && first?.meta?.unit) footer.push(`Unit: ${first.meta.unit}`);
    if (fields.includes("status") && first?.meta?.status) footer.push(`Status: ${first.meta.status}`);
    if (model.stacked) {
      const total = datumsAt(slot.key).reduce((a, { ds }) => a + (ds[0]?.y ?? 0), 0);
      footer.push(`Stack total: ${model.tooltip.format.format(total)}`);
    }
    if (rows.length > 1 && visible.length > 1) {
      const vals = rows.map((r) => r.value);
      if (new Set(vals).size === 1 && vals[0] !== "No data") footer.push(`All ${rows.length} series have the same value here.`);
    }
    const showTitle = fields.includes("category") || fields.includes("timestamp") || !fields.length;
    return { title: showTitle ? slot.label : "", rows, footer };
  };

  // Scatter flat list
  const flatPoints = useMemo(() => {
    if (v !== "scatter") return [] as { sr: CartesianSeries; d: CartesianDatum }[];
    return visible.flatMap((sr) => sr.data.filter((d) => d.y !== null).map((d) => ({ sr, d })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, ix.hidden]);
  const navCount = v === "scatter" ? flatPoints.length : slots.length;

  const anchorFor = (xi: number) => {
    if (v === "scatter") {
      const p = flatPoints[xi];
      return anchorFromSvg(svgRef.current, X(p.d.x), y(p.d.y as number));
    }
    const slot = slots[xi];
    const ys = datumsAt(slot.key).flatMap(({ ds }) => ds.map((d) => (d.y1 ?? d.high ?? d.y) as number | null)).filter((n): n is number => n !== null);
    const yy = ys.length ? y(Math.max(...ys)) : topPad + plotH / 2;
    return anchorFromSvg(svgRef.current, left + slot.px, yy, isBarLike ? 0 : 0, 0);
  };

  const showAt = (xi: number, si: number, pin = false) => {
    if (!navCount) return;
    setActive({ xi, si });
    const c = contentFor(xi, si);
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(c, anchorFor(xi), { pin });
    ix.announce(`${c.title ? c.title + ". " : ""}${c.rows.slice(0, 6).map((r) => `${r.label} ${r.value}`).join("; ")}${c.rows.length > 6 ? `; and ${c.rows.length - 6} more` : ""}`);
  };

  const nearest = (e: PointerEvent<HTMLDivElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (v === "scatter") {
      let best = -1;
      let bestD = 28 * 28;
      flatPoints.forEach((p, i) => {
        const dx = X(p.d.x) - px;
        const dy = y(p.d.y as number) - py;
        const dd = dx * dx + dy * dy;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      });
      return best;
    }
    if (px < left - 4 || px > left + plotW + 4 || !slots.length) return -1;
    let lo = 0;
    let hi = slots.length - 1;
    const target = px - left;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (slots[mid].px < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(slots[lo - 1].px - target) < Math.abs(slots[lo].px - target)) lo--;
    return lo;
  };

  const onNav = (a: NavAction) => {
    if (!navCount) return;
    const cur = active ?? { xi: -1, si: 0 };
    if (a === "escape") {
      ix.hide();
      setActive(null);
      return;
    }
    if (a === "enter") return showAt(Math.max(0, cur.xi), cur.si, true);
    const xi = a === "next" ? wrapIndex(cur.xi + 1, navCount) : a === "prev" ? wrapIndex(cur.xi < 0 ? -1 : cur.xi - 1, navCount) : a === "home" ? 0 : a === "end" ? navCount - 1 : Math.max(0, cur.xi);
    const si = a === "down" ? wrapIndex(cur.si + 1, Math.max(1, visible.length)) : a === "up" ? wrapIndex(cur.si - 1, Math.max(1, visible.length)) : cur.si;
    showAt(xi, si, ix.pinned);
  };

  useEffect(() => {
    if (active && active.xi >= navCount) setActive(null);
  }, [navCount, active]);

  // Data labels with greedy collision avoidance
  const labelNodes: JSX.Element[] = [];
  let labelsHidden = 0;
  if (model.showDataLabels && (v === "line" || v === "area" || v === "scatter")) {
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const sr of visible)
      for (const d of sr.data) {
        if (d.y === null) continue;
        const text = model.tooltip.format.format(d.y);
        const w = measureText(text, TEXT.tick);
        const cx = X(d.x);
        const cy = y(model.stacked ? (d.y1 as number) : d.y) - 8;
        const box = { x0: cx - w / 2 - 2, x1: cx + w / 2 + 2, y0: cy - 11, y1: cy + 2 };
        if (box.x0 < 0 || box.x1 > width || box.y0 < 0 || placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) {
          labelsHidden++;
          continue;
        }
        placed.push(box);
        labelNodes.push(
          <text key={`${sr.identity.id}:${d.x}:${d.rowIndexes[0]}`} className="lc-label" x={cx} y={cy} textAnchor="middle">
            {text}
          </text>,
        );
      }
  }

  // Bars
  const barNodes: JSX.Element[] = [];
  if (v === "bar") {
    const grouped = !model.stacked && visible.length > 1;
    const inner = grouped ? band / visible.length : band;
    const placed: number[] = [];
    catMap.forEach((orig, i) => {
      const cx = left + xPos(i);
      const x0 = cx - band / 2;
      if (model.bar.track !== "none") {
        const yTop = y(yDom[1]);
        const yBot = y(Math.max(yDom[0], 0));
        if (model.bar.track === "full") barNodes.push(<rect key={`t${i}`} className="lc-track" x={x0} width={band} y={yTop} height={Math.max(0, yBot - yTop)} rx={Math.min(4, band / 4)} />);
        else
          for (let k = 0; k < 10; k++) {
            const h = (yBot - yTop) / 10;
            barNodes.push(<rect key={`t${i}:${k}`} className="lc-track" x={x0} width={band} y={yTop + k * h + 1} height={Math.max(0, h - 2)} rx={1} />);
          }
      }
      visible.forEach((sr, si) => {
        const d = sr.byX.get(orig);
        if (!d) return;
        if (d.total != null) {
          const tTop = y(d.total);
          barNodes.push(<rect key={`tt${i}:${si}`} x={grouped ? x0 + si * inner : x0} width={Math.max(1, inner - (grouped ? 1 : 0))} y={Math.min(tTop, baseline)} height={Math.abs(baseline - tTop)} fill="none" stroke={sr.identity.color} strokeOpacity={0.45} strokeDasharray="3 2" />);
        }
        if (d.y === null) return;
        const a = model.stacked ? y(d.y0 ?? 0) : baseline;
        const b = y(model.stacked ? (d.y1 as number) : d.y);
        const color = model.barColors?.[orig] ?? sr.identity.color;
        const bx = grouped ? x0 + si * inner : x0;
        const bw = Math.max(1, inner - (grouped ? 1 : 0));
        const dim = active && model.tooltip.highlight && active.xi !== i;
        barNodes.push(
          <rect
            key={`b${i}:${si}`}
            className={"lc-mark" + (dim ? " lc-mark--dim" : "")}
            x={bx}
            width={bw}
            y={Math.min(a, b)}
            height={Math.max(d.y === 0 ? 0 : 1, Math.abs(a - b))}
            fill={color}
            fillOpacity={model.bar.strokeWidth > 0 ? 0.78 : 1}
            stroke={model.bar.strokeWidth > 0 ? color : undefined}
            strokeWidth={model.bar.strokeWidth || undefined}
            rx={Math.min(2, bw / 4)}
          />,
        );
        if (model.bar.showValues && !model.stacked) {
          const text = model.tooltip.format.format(d.y);
          const w = measureText(text, TEXT.tick);
          if (w > bw + 6 && grouped) {
            labelsHidden++;
            return;
          }
          const inside = model.bar.valuePosition === "inline" && Math.abs(a - b) > 16 && w < bw;
          const ly = inside ? (d.y >= 0 ? b + 12 : b - 4) : d.y >= 0 ? b - 4 : b + 12;
          const lx = bx + bw / 2;
          if (placed.some((p) => Math.abs(p - lx) < w * 0.9) && !grouped) {
            labelsHidden++;
            return;
          }
          placed.push(lx);
          labelNodes.push(
            <text key={`l${i}:${si}`} className={"lc-label" + (inside ? " lc-label--inside" : "")} x={lx} y={ly} textAnchor="middle">
              {text}
            </text>,
          );
        }
      });
    });
  }
  if (labelsHidden) adaptations.push({ id: "labels-hidden", setting: "Layout & visibility::Show data labels", reason: `${labelsHidden} value label${labelsHidden === 1 ? " is" : "s are"} hidden to avoid overlap; values are in the tooltip and data view.` });

  // Range bars
  const rangeNodes: JSX.Element[] = [];
  if (v === "range" && model.range.showBars) {
    const sr = visible[0];
    if (sr)
      catMap.forEach((orig, i) => {
        const d = sr.byX.get(orig);
        if (!d) return;
        const cx = left + xPos(i);
        const w = Math.max(2, band * model.range.widthRatio);
        if (d.low == null || d.high == null) {
          const only = (d.low ?? d.high) as number | null;
          if (only != null) rangeNodes.push(<circle key={`p${i}`} cx={cx} cy={y(only)} r={Math.min(5, w / 2)} fill={sr.identity.color} />);
          return;
        }
        const top = y(Math.max(d.low, d.high));
        const bot = y(Math.min(d.low, d.high));
        const r = Math.min(model.range.maxRadius, w / 2, (bot - top) / 2);
        rangeNodes.push(
          <rect
            key={`r${i}`}
            className="lc-mark"
            x={cx - w / 2}
            width={w}
            y={top}
            height={Math.max(1, bot - top)}
            rx={r}
            fill={d.invalid ? "none" : model.range.gradient.length > 1 ? `url(#${gradId}-range)` : model.barColors?.[orig] ?? sr.identity.color}
            fillOpacity={model.range.opacity}
            stroke={d.invalid ? "var(--lc-text-negative)" : undefined}
            strokeDasharray={d.invalid ? "3 2" : undefined}
          />,
        );
        if (model.range.showValues) {
          const f = model.yAxis.format.format;
          labelNodes.push(
            <text key={`rh${i}`} className="lc-label" x={cx} y={top - 4} textAnchor="middle">
              {f(d.high)}
            </text>,
            <text key={`rl${i}`} className="lc-label" x={cx} y={bot + 12} textAnchor="middle">
              {f(d.low)}
            </text>,
          );
        }
      });
  }

  // Lines / areas
  const pathNodes: JSX.Element[] = [];
  const pointNodes: JSX.Element[] = [];
  if (v === "line" || v === "area") {
    const drawOrder = model.stacked ? [...visible].reverse() : visible;
    for (const sr of drawOrder) {
      const color = gradient ? `url(#${gradId})` : sr.identity.color;
      const dash = sr.dashed ? "6 4" : sr.identity.dash || undefined;
      if (model.areaFill) {
        pathNodes.push(<path key={`a:${sr.identity.id}`} className="lc-mark" d={areaGen(model.stacked)(sr.data) ?? ""} fill={color} fillOpacity={model.fillOpacity} stroke="none" />);
      }
      if (model.strokeWidth > 0) {
        pathNodes.push(<path key={`l:${sr.identity.id}`} className="lc-mark" d={lineGen(model.stacked)(sr.data) ?? ""} fill="none" stroke={color} strokeWidth={model.strokeWidth} strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" />);
      }
      sr.data.forEach((d, k) => {
        if (d.y === null) return;
        const prev = sr.data[k - 1];
        const next = sr.data[k + 1];
        const isolated = (!prev || prev.y === null) && (!next || next.y === null);
        if (!model.points.show && !isolated) return;
        const r = model.points.show ? model.points.radius : Math.max(2.5, model.strokeWidth * 1.4);
        pointNodes.push(
          <path
            key={`p:${sr.identity.id}:${k}`}
            d={markerPath(sr.identity.marker, r)}
            transform={`translate(${X(d.x)},${y(model.stacked ? (d.y1 as number) : d.y)})`}
            fill={model.points.fill ?? sr.identity.color}
            stroke={model.points.stroke ?? "var(--lc-bg-base)"}
            strokeWidth={model.points.show ? model.points.strokeWidth : 1}
          />,
        );
      });
    }
  }

  // Scatter
  if (v === "scatter") {
    const sd = model.scatter.sizeDomain;
    const rFor = (s: number | null | undefined) => scatterRadius(s, sd, model.scatter.minR, model.scatter.maxR);
    const shape = model.scatter.shape === "square" ? "square" : model.scatter.shape === "triangle" ? "triangle" : "circle";
    flatPoints.forEach(({ sr, d }, i) => {
      const dim = active && model.tooltip.highlight && flatPoints[active.xi]?.sr !== sr;
      pointNodes.push(
        <path
          key={`s${i}`}
          className={"lc-mark" + (dim ? " lc-mark--dim" : "")}
          d={markerPath(shape, rFor(d.size))}
          transform={`translate(${X(d.x)},${y(d.y as number)})`}
          fill={model.scatter.fill ?? sr.identity.color}
          fillOpacity={model.scatter.fill ? 1 : 0.62}
          stroke={sr.identity.color}
          strokeWidth={1}
        />,
      );
    });
  }

  // Annotations and reference
  const annNodes: JSX.Element[] = [];
  const caption = (key: string, x: number, yy: number, text: string, anchor: "start" | "end" = "end") => (
    <text key={key} x={x} y={Math.max(11, yy - 4)} textAnchor={anchor}>
      {text}
    </text>
  );
  const clipNote: string[] = [];
  for (const [i, a] of model.annotations.entries()) {
    if (a.value !== undefined && (a.kind === "average" || a.kind === "maximum" || a.kind === "minimum" || a.kind === "manual-y") && !a.followCategories) {
      const inRange = a.value >= yDom[0] && a.value <= yDom[1];
      if (!inRange) {
        clipNote.push(`${a.label} is outside the visible range.`);
        continue;
      }
      const yy = y(a.value);
      annNodes.push(
        <g key={`an${i}`} className="lc-annotation">
          <line x1={left} x2={left + plotW} y1={yy} y2={yy} strokeDasharray={a.dash || undefined} strokeWidth={a.strokeWidth} />
          {a.showCaption && caption("c", left + plotW, yy, a.label)}
        </g>,
      );
    } else if (a.followCategories && a.value !== undefined) {
      const pts = slots.map((s) => {
        const vals = datumsAt(s.key).flatMap(({ ds }) => ds.map((d) => d.y)).filter((n): n is number => n !== null);
        if (!vals.length) return null;
        const stat = a.kind === "maximum" ? Math.max(...vals) : a.kind === "minimum" ? Math.min(...vals) : vals.reduce((p, q) => p + q, 0) / vals.length;
        return [left + s.px, y(stat)] as [number, number];
      });
      const d = d3line<[number, number] | null>().defined((p) => p !== null).x((p) => p![0]).y((p) => p![1])(pts);
      annNodes.push(
        <g key={`an${i}`} className="lc-annotation">
          <path d={d ?? ""} strokeDasharray={a.dash || undefined} strokeWidth={a.strokeWidth} />
          {a.showCaption && caption("c", left + plotW, (pts.filter(Boolean).pop()?.[1] ?? topPad) as number, `${a.kind === "average" ? "Average" : a.kind === "maximum" ? "Maximum" : "Minimum"} across series`)}
        </g>,
      );
    } else if (a.kind === "trend" && a.slope !== undefined && a.intercept !== undefined && slots.length > 1) {
      const xa = model.xKind === "category" ? 0 : slots[0].key;
      const xb = model.xKind === "category" ? model.categories.length - 1 : slots[slots.length - 1].key;
      const pa = model.xKind === "category" ? X(0) : X(xa);
      const pb = model.xKind === "category" ? X(categories.length - 1) : X(xb);
      const ya = y(a.slope * xa + a.intercept);
      const yb = y(a.slope * xb + a.intercept);
      annNodes.push(
        <g key={`an${i}`} className="lc-annotation" clipPath={`url(#${clipId})`}>
          <line x1={pa} x2={pb} y1={ya} y2={yb} strokeDasharray={a.dash || undefined} strokeWidth={a.strokeWidth} />
          {a.showCaption && caption("c", pb, Math.min(ya, yb), a.label)}
        </g>,
      );
    } else if (a.kind === "manual-x" || a.kind === "manual-xy") {
      let px: number | null = null;
      if (model.xKind === "category") {
        const idx = categories.indexOf(a.xKey ?? "");
        px = idx >= 0 ? X(idx) : null;
      } else {
        const n = model.xKind === "time" ? Date.parse(a.xKey ?? "") : Number(a.xKey);
        px = Number.isFinite(n) && model.xDomain && n >= model.xDomain[0] && n <= model.xDomain[1] ? X(n) : null;
      }
      if (px === null) {
        clipNote.push(`Annotation “${a.xKey}” does not match a position on the X axis.`);
        continue;
      }
      annNodes.push(
        <g key={`an${i}`} className="lc-annotation">
          <line x1={px} x2={px} y1={topPad} y2={topPad + plotH} strokeDasharray={a.dash || undefined} strokeWidth={a.strokeWidth} />
          {a.kind === "manual-xy" && a.value !== undefined && <line x1={left} x2={left + plotW} y1={y(a.value)} y2={y(a.value)} strokeDasharray={a.dash || undefined} strokeWidth={a.strokeWidth} />}
          {a.showCaption && caption("c", px + 4, topPad + 10, a.label, "start")}
        </g>,
      );
    }
  }
  if (model.reference && (v !== "range" || model.range.showReference)) {
    const ref = model.reference;
    if (ref.value >= yDom[0] && ref.value <= yDom[1]) {
      const yy = y(ref.value);
      annNodes.push(
        <g key="ref" className="lc-annotation">
          <line x1={left} x2={left + plotW} y1={yy} y2={yy} strokeDasharray="2 3" strokeWidth={v === "range" ? model.range.refStroke : 1.25} strokeOpacity={v === "range" ? model.range.refOpacity : 0.9} />
          {caption("c", left + 2, yy, `${ref.label}: ${model.yAxis.format.format(ref.value)}`, "start")}
        </g>,
      );
    }
  }
  if (clipNote.length) adaptations.push({ id: "annotation-clipped", setting: "Annotations::Show annotations", reason: clipNote.join(" ") });

  report(adaptations);

  // Focus markers for active slot
  const focusNodes: JSX.Element[] = [];
  if (activeSlot && v !== "scatter") {
    if (model.tooltip.crosshair || v === "line" || v === "area") {
      if (model.tooltip.crosshair) focusNodes.push(<line key="ch" className="lc-crosshair" x1={left + activeSlot.px} x2={left + activeSlot.px} y1={topPad} y2={topPad + plotH} />);
      datumsAt(activeSlot.key).forEach(({ sr, ds }, i) =>
        ds.forEach((d, k) => {
          const yy = v === "range" ? null : d.y === null ? null : y(model.stacked ? (d.y1 as number) : d.y);
          if (yy === null) return;
          focusNodes.push(<circle key={`f${i}:${k}`} cx={left + activeSlot.px} cy={yy} r={i === active?.si ? 5 : 3.5} fill={sr.identity.color} stroke="var(--lc-bg-base)" strokeWidth={2} />);
        }),
      );
    }
    if (isBarLike) focusNodes.push(<rect key="fb" className="lc-focus-ring" x={left + activeSlot.px - band / 2 - 2} y={topPad} width={band + 4} height={plotH} rx={3} strokeOpacity={0.35} />);
  } else if (active && v === "scatter" && flatPoints[active.xi]) {
    const p = flatPoints[active.xi];
    focusNodes.push(<circle key="fs" className="lc-focus-ring" cx={X(p.d.x)} cy={y(p.d.y as number)} r={model.scatter.maxR / 2 + 4} />);
  }

  const zeroLine = yDom[0] < 0 && yDom[1] > 0;
  const gridColor = model.yAxis.gridColor;
  const label = `${model.summary} ${navCount ? "Use arrow keys to move between data points." : ""}`;

  return (
    <PlotSurface
      ref={surfaceRef}
      label={label}
      describedBy={descId}
      onNav={onNav}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        if (ix.pinned) return;
        const i = nearest(e);
        if (i < 0) {
          if (!ix.pinned) ix.hide();
          setActive(null);
          return;
        }
        if (!active || active.xi !== i) showAt(i, active?.si ?? 0);
      }}
      onPointerLeave={() => {
        if (!ix.pinned) {
          ix.hide();
          setActive(null);
        }
      }}
      onPointerDown={(e) => {
        const i = nearest(e);
        if (i < 0) {
          ix.hide();
          setActive(null);
          return;
        }
        showAt(i, active?.si ?? 0, true);
      }}
    >
      <span id={descId} className="lc-sr">
        Arrow keys move between points, Up and Down switch series, Enter pins details, Escape closes them.
      </span>
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={model.summary}>
        <defs>
          <clipPath id={clipId}>
            <rect x={left} y={topPad - 1} width={plotW} height={plotH + 2} />
          </clipPath>
          {gradient && (
            <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={y(yDom[0])} y2={y(yDom[1])}>
              {gradient.stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          )}
          {v === "range" && model.range.gradient.length > 1 && (
            <linearGradient id={`${gradId}-range`} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={y(yDom[0])} y2={y(yDom[1])}>
              {model.range.gradient.map((s, i) => (
                <stop key={i} offset={`${s.at}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          )}
        </defs>
        {model.yAxis.showGrid && (
          <g className="lc-grid" aria-hidden="true">
            {yPlan.values.map((t, i) => (
              <line key={i} x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} style={gridColor ? { stroke: gridColor } : undefined} />
            ))}
          </g>
        )}
        {model.xAxis.showGrid && (
          <g className="lc-grid" aria-hidden="true">
            {xTicks.map((t, i) => (
              <line key={i} x1={left + t.px} x2={left + t.px} y1={topPad} y2={topPad + plotH} />
            ))}
          </g>
        )}
        <g aria-hidden="true">{barNodes}</g>
        <g clipPath={`url(#${clipId})`} aria-hidden="true">
          {rangeNodes}
          {pathNodes}
        </g>
        {zeroLine && <line className="lc-zero" x1={left} x2={left + plotW} y1={y(0)} y2={y(0)} aria-hidden="true" />}
        <g aria-hidden="true">{annNodes}</g>
        <g clipPath={`url(#${clipId})`} aria-hidden="true">
          {pointNodes}
        </g>
        <g aria-hidden="true">{labelNodes}</g>
        <g className="lc-axis" aria-hidden="true">
          {showYLabels &&
            yPlan.values.map((t, i) => (
              <text key={i} x={left - 6 - (0)} y={y(t)} dy="0.32em" textAnchor="end">
                {yLab.labels[i]}
              </text>
            ))}
          {model.yAxis.showTicks && yPlan.values.map((t, i) => <line key={`yt${i}`} className="lc-axis__tick" x1={left - 3} x2={left} y1={y(t)} y2={y(t)} />)}
          <g transform={`translate(0,${offset})`}>
            {model.xAxis.showTicks && <line className="lc-axis__line" x1={left} x2={left + plotW} y1={topPad + plotH} y2={topPad + plotH} />}
            {model.xAxis.showTicks && xTicks.map((t, i) => <line key={`xt${i}`} className="lc-axis__tick" x1={left + t.px} x2={left + t.px} y1={topPad + plotH} y2={topPad + plotH + 3} />)}
            {showXLabels &&
              (rot
                ? xTicks.map((t, i) => (
                    <text key={i} transform={`translate(${left + t.px},${topPad + plotH + 8}) rotate(${rot})`} textAnchor={rot > 0 ? "start" : "end"} dy="0.32em">
                      {t.label}
                    </text>
                  ))
                : xLabels.map((t, i) => (
                    <text key={i} x={t.x} y={topPad + plotH + 15} textAnchor="middle">
                      {t.label}
                    </text>
                  )))}
          </g>
          {yTitle && (
            <text className="lc-axis__title" transform={`translate(11,${topPad + plotH / 2}) rotate(-90)`} textAnchor="middle" style={{ fill: model.yAxis.titleColor, opacity: model.yAxis.titleOpacity }}>
              {truncateText(yTitle, TEXT.micro, plotH)}
            </text>
          )}
          {xTitle && (
            <text className="lc-axis__title" x={left + plotW / 2} y={height - 3} textAnchor="middle" style={{ fill: model.xAxis.titleColor, opacity: model.xAxis.titleOpacity }}>
              {truncateText(xTitle, TEXT.micro, plotW)}
            </text>
          )}
        </g>
        <g aria-hidden="true">{focusNodes}</g>
      </svg>
    </PlotSurface>
  );
}

/** Keeps a centred tick label inside [minX, width] so it never runs into the Y-label gutter or off the card. */
function clampLabel(x: number, label: string, width: number, minX = 0): number {
  const w = measureText(label, TEXT.tick) / 2;
  return Math.max(minX + w + 1, Math.min(width - w - 1, x));
}

/* ============================== Horizontal bar ============================== */

function HBarPlot({ model, width, height, mode, ix, report }: PlotProps<CartesianModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const descId = useStableId("lc-desc");
  const [active, setActive] = useState<number | null>(null);
  const visible = model.series.filter((s) => !ix.hidden.has(s.identity.id));
  const adaptations: Adaptation[] = [];
  const inline = model.bar.layout === "inline";
  const grouped = !model.stacked && visible.length > 1;
  const barH = inline ? (mode === "micro" ? 8 : 10) : grouped ? Math.max(6, 16 / visible.length) * visible.length : 14;
  const rowH = inline ? barH + (grouped ? (visible.length - 1) * (barH + 2) : 0) + 22 : barH + 10;

  let categories = model.categories;
  let catMap = categories.map((_, i) => i);
  if (model.bar.topN === 0 && categories.length) {
    const fit = Math.max(1, Math.floor(height / rowH));
    if (fit < categories.length) {
      const totals = categories.map((_, ci) => model.series.reduce((a, sr) => a + Math.abs(sr.byX.get(ci)?.y ?? 0), 0));
      const keep = new Set([...catMap].sort((a, b) => totals[b] - totals[a] || a - b).slice(0, fit));
      catMap = catMap.filter((i) => keep.has(i));
      categories = catMap.map((i) => model.categories[i]);
      adaptations.push({ id: "top-n-auto", setting: "Bar::Top N categories", requested: "0 (auto)", effective: `${fit} of ${model.categories.length}`, reason: `Auto Top N fits ${fit} rows in ${height}px; the rest stay in the data view.` });
    }
  }
  const contentH = Math.max(height, categories.length * rowH + (inline ? 0 : 22));
  if (contentH > height) adaptations.push({ id: "hbar-scroll", reason: `${categories.length} rows need ${Math.round(contentH)}px; the plot scrolls inside the card at a fixed row height.` });

  const labelColor = model.bar.labelColor ?? undefined;
  const f = model.tooltip.format.format;
  const unit = model.bar.unitSuffix;
  const showValueText = (n: number) => `${model.yAxis.format.source === "notation" ? f(n) : model.yAxis.format.format(n)}${unit ? (/^[%°]/.test(unit) ? unit : ` ${unit}`) : ""}`;
  const catLabelW = inline ? 0 : Math.min(width * 0.4, Math.max(0, ...categories.map((c) => measureText(c, TEXT.small))) + 8);
  const valueLabelW = model.bar.showValues ? Math.max(0, ...visible.flatMap((sr) => sr.data.map((d) => (d.y === null ? 0 : measureText(showValueText(d.y), TEXT.tick))))) + 6 : 0;
  const left = inline ? 0 : catLabelW;
  const right = model.bar.valuePosition === "above" || inline ? 4 : valueLabelW + 4;
  const plotW = Math.max(20, width - left - right);
  const x = scaleLinear().domain(model.yDomain).range([left, left + plotW]);
  const zero = x(Math.max(model.yDomain[0], Math.min(model.yDomain[1], 0)));
  const ticks = planNumericTicks(model.yDomain, plotW, { requested: model.xAxis.tickCount || model.yAxis.tickCount, minSpacingPx: 56, endpointsOnly: model.yAxis.tickMode === "endpoints" });
  const tickLabels = distinctTickLabels(ticks.values, model.yAxis.format.format);
  if (ticks.reason) adaptations.push({ id: "x-ticks", setting: "Scaling / axes::Tick count", requested: String(ticks.requested), effective: String(ticks.effective), reason: ticks.reason });
  report(adaptations);

  const contentFor = (i: number): TooltipContent => {
    const orig = catMap[i];
    return {
      title: categories[i],
      rows: visible.map((sr) => {
        const d = sr.byX.get(orig);
        return { id: sr.identity.id, label: sr.identity.label, value: valueText(model, sr, d), color: sr.identity.color };
      }),
      footer: model.stacked ? [`Stack total: ${f(visible.reduce((a, sr) => a + (sr.byX.get(orig)?.y ?? 0), 0))}`] : undefined,
    };
  };
  const showAt = (i: number, pin = false) => {
    if (!categories.length) return;
    setActive(i);
    const c = contentFor(i);
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(c, anchorFromSvg(svgRef.current, Math.min(width - 10, zero + 40), i * rowH + rowH / 2), { pin });
    ix.announce(`${c.title}. ${c.rows.map((r) => `${r.label} ${r.value}`).join("; ")}`);
    const el = svgRef.current?.parentElement;
    if (el && el.scrollHeight > el.clientHeight) {
      const top = i * rowH;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight;
    }
  };
  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return -1;
    const i = Math.floor((e.clientY - r.top) / rowH);
    return i >= 0 && i < categories.length ? i : -1;
  };

  const rows: JSX.Element[] = [];
  categories.forEach((cat, i) => {
    const orig = catMap[i];
    const top = i * rowH;
    const barTop = inline ? top + 18 : top + (rowH - barH) / 2;
    if (inline) {
      rows.push(
        <text key={`c${i}`} className="lc-cat-label" x={0} y={top + 12} style={labelColor ? { fill: labelColor } : undefined}>
          {truncateText(cat, TEXT.small, width - valueLabelW - 8)}
        </text>,
      );
    } else {
      rows.push(
        <text key={`c${i}`} className="lc-cat-label" x={left - 8} y={barTop + barH / 2} dy="0.32em" textAnchor="end" style={labelColor ? { fill: labelColor } : undefined}>
          {truncateText(cat, TEXT.small, catLabelW - 8)}
        </text>,
      );
    }
    if (model.bar.track !== "none") {
      rows.push(<rect key={`t${i}`} className="lc-track" x={left} y={barTop} width={plotW} height={inline || !grouped ? barH : barH} rx={barH / 2} />);
    }
    let stackPos = zero;
    let stackNeg = zero;
    visible.forEach((sr, si) => {
      const d = sr.byX.get(orig);
      if (!d) return;
      const color = model.barColors?.[orig] ?? sr.identity.color;
      const h = grouped ? (inline ? barH : barH / visible.length - 1) : barH;
      const yy = grouped ? (inline ? barTop + si * (barH + 2) : barTop + si * (barH / visible.length)) : barTop;
      if (d.total != null) rows.push(<rect key={`tt${i}:${si}`} x={Math.min(zero, x(d.total))} y={yy} width={Math.abs(x(d.total) - zero)} height={h} rx={h / 2} fill="none" stroke={color} strokeOpacity={0.45} strokeDasharray="3 2" />);
      if (d.y === null) return;
      let a = zero;
      let b = x(d.y);
      if (model.stacked) {
        a = x(d.y0 ?? 0);
        b = x(d.y1 ?? d.y);
        if (d.y >= 0) stackPos = b;
        else stackNeg = b;
      }
      rows.push(<rect key={`b${i}:${si}`} className="lc-mark" x={Math.min(a, b)} y={yy} width={Math.max(d.y === 0 ? 0 : 1, Math.abs(b - a))} height={h} rx={Math.min(h / 2, 4)} fill={color} stroke={model.bar.strokeWidth ? color : undefined} strokeWidth={model.bar.strokeWidth || undefined} fillOpacity={model.bar.strokeWidth ? 0.78 : 1} />);
      if (model.stacked && Math.abs(b - a) > measureText(sr.identity.label, TEXT.micro) + 8 && h >= 10) {
        rows.push(
          <text key={`sl${i}:${si}`} className="lc-label lc-label--inside" x={Math.min(a, b) + 4} y={yy + h / 2} dy="0.32em" style={{ fontSize: 10 }}>
            {sr.identity.label}
          </text>,
        );
      }
      if (model.bar.showValues && !model.stacked) {
        const text = showValueText(d.y);
        const above = model.bar.valuePosition === "above";
        const lx = inline ? width : above ? Math.max(a, b) : Math.max(a, b) + 4;
        const ly = inline ? top + 12 : above ? yy - 3 : yy + h / 2;
        rows.push(
          <text key={`v${i}:${si}`} className="lc-label" x={lx} y={ly} dy={inline || above ? undefined : "0.32em"} textAnchor={inline ? "end" : "start"}>
            {grouped && inline ? `${sr.identity.label}: ${text}` : text}
          </text>,
        );
      }
    });
    if (model.stacked && model.bar.showValues) {
      const total = visible.reduce((acc, sr) => acc + (sr.byX.get(orig)?.y ?? 0), 0);
      rows.push(
        <text key={`st${i}`} className="lc-label" x={inline ? width : stackPos + 4} y={inline ? top + 12 : barTop + barH / 2} dy={inline ? undefined : "0.32em"} textAnchor={inline ? "end" : "start"}>
          {showValueText(total)}
        </text>,
      );
      void stackNeg;
    }
    if (active === i) rows.push(<rect key="focus" className="lc-focus-ring" x={1} y={top + 1} width={width - 2} height={rowH - 2} rx={4} strokeOpacity={0.35} />);
  });

  const axisY = categories.length * rowH + 4;
  return (
    <PlotSurface
      label={`${model.summary} Use arrow keys to move between bars.`}
      describedBy={descId}
      scroll
      onNav={(a) => {
        const n = categories.length;
        if (!n) return;
        if (a === "escape") {
          ix.hide();
          setActive(null);
          return;
        }
        if (a === "enter") return showAt(active ?? 0, true);
        const cur = active ?? -1;
        const i = a === "down" || a === "next" ? wrapIndex(cur + 1, n) : a === "up" || a === "prev" ? wrapIndex(cur < 0 ? -1 : cur - 1, n) : a === "home" ? 0 : a === "end" ? n - 1 : Math.max(0, cur);
        showAt(i, ix.pinned);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch" || ix.pinned) return;
        const i = indexAt(e);
        if (i < 0) {
          ix.hide();
          setActive(null);
        } else if (i !== active) showAt(i);
      }}
      onPointerLeave={() => {
        if (!ix.pinned) {
          ix.hide();
          setActive(null);
        }
      }}
      onPointerDown={(e) => {
        const i = indexAt(e);
        if (i >= 0) showAt(i, true);
      }}
    >
      <span id={descId} className="lc-sr">
        Arrow keys move between bars, Enter pins details, Escape closes them.
      </span>
      <svg ref={svgRef} width={width} height={contentH} role="img" aria-label={model.summary}>
        {!inline && model.yAxis.showGrid && (
          <g className="lc-grid" aria-hidden="true">
            {ticks.values.map((t, i) => (
              <line key={i} x1={x(t)} x2={x(t)} y1={0} y2={categories.length * rowH} />
            ))}
          </g>
        )}
        <g aria-hidden="true">{rows}</g>
        {model.yDomain[0] < 0 && <line className="lc-zero" x1={zero} x2={zero} y1={0} y2={categories.length * rowH} aria-hidden="true" />}
        {!inline && model.yAxis.showTickLabels && (
          <g className="lc-axis" aria-hidden="true">
            {ticks.values.map((t, i) => (
              <text key={i} x={clampLabel(x(t), tickLabels.labels[i], width)} y={axisY + 10} textAnchor="middle">
                {tickLabels.labels[i]}
              </text>
            ))}
          </g>
        )}
      </svg>
    </PlotSurface>
  );
}
