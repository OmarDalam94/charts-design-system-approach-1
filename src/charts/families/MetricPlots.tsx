import { useRef, useState, type CSSProperties } from "react";
import { arc as d3arc } from "d3-shape";
import type { AvailabilityModel, GaugeModel, KpiCardModel, KpiGridModel, ProgressModel, ScoreModel, TableModel } from "../model";
import { formatShare } from "../derive/common";
import { formatTimeExact } from "../format";
import { measureText, TEXT, truncateText } from "../textMeasure";
import type { Adaptation } from "../settings";
import type { TooltipContent } from "../primitives/Tooltip";
import { DataTableView } from "../primitives/DataTableView";
import { KpiLine } from "../primitives/ChartHeader";
import { useStableId } from "../primitives/hooks";
import { anchorFromSvg, PlotSurface, wrapIndex, type NavAction, type PlotProps } from "./shared";

function step(a: NavAction, cur: number | null, n: number): number | null {
  if (!n) return null;
  const c = cur ?? -1;
  if (a === "next" || a === "down") return wrapIndex(c + 1, n);
  if (a === "prev" || a === "up") return wrapIndex(c < 0 ? -1 : c - 1, n);
  if (a === "home") return 0;
  if (a === "end") return n - 1;
  return Math.max(0, c);
}

function anchorOfEl(el: Element | null | undefined) {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: 0, y: 0 };
}

/* ============================== Progress ============================== */

export function ProgressPlot({ model, width, height, mode, ix, report }: PlotProps<ProgressModel>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const adaptations: Adaptation[] = [];
  const barH = mode === "micro" ? 6 : 8;
  const rowH = model.valuePosition === "above" || model.rows.length > 1 ? barH + 22 : barH + 8;
  if (model.rows.length * rowH > height) adaptations.push({ id: "progress-scroll", reason: `${model.rows.length} rows scroll inside the card at a fixed row height.` });
  report(adaptations);

  const valueOf = (r: ProgressModel["rows"][number]) => (model.mode === "percentage" ? (r.share === null ? "—" : formatShare(r.share)) : `${model.format.format(r.value)}${r.max !== null ? ` / ${model.format.format(r.max)}` : ""}`);
  const contentFor = (i: number): TooltipContent => {
    const r = model.rows[i];
    return {
      title: r.label,
      rows: [
        { id: "v", label: "Value", value: model.format.format(r.value), color: r.color },
        { id: "m", label: "Max", value: r.max === null ? "Not set (scale 0–100)" : model.format.format(r.max) },
        { id: "s", label: "Progress", value: r.share === null ? "—" : formatShare(r.share) },
      ],
    };
  };
  const showAt = (i: number, pin = false) => {
    const el = listRef.current?.children[i] as HTMLElement | undefined;
    setActive(i);
    el?.scrollIntoView?.({ block: "nearest" });
    const c = contentFor(i);
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(c, anchorOfEl(el), { pin });
    ix.announce(`${c.title}: ${c.rows.map((x) => `${x.label} ${x.value}`).join(", ")}`);
  };
  const segments = model.track === "segmented" || model.separators ? 10 : 0;

  return (
    <PlotSurface
      label={`${model.summary} Use arrow keys to move between rows.`}
      scroll
      onNav={(a) => {
        if (a === "escape") return ix.hide(), setActive(null);
        const i = step(a, active, model.rows.length);
        if (i !== null) showAt(i, a === "enter" || ix.pinned);
      }}
      onPointerLeave={() => !ix.pinned && (ix.hide(), setActive(null))}
    >
      <div ref={listRef} className="lc-progress" style={{ width }}>
        {model.rows.map((r, i) => {
          const pct = r.share === null ? 0 : Math.max(0, Math.min(1, r.share)) * 100;
          const text = valueOf(r);
          const inlineFits = model.valuePosition === "inline" && measureText(text, TEXT.tick) + 8 < (width * pct) / 100;
          return (
            <div
              key={i}
              className={"lc-progress__row" + (active === i ? " is-active" : "")}
              onPointerEnter={(e) => e.pointerType !== "touch" && !ix.pinned && showAt(i)}
              onPointerDown={() => showAt(i, true)}
            >
              <div className="lc-progress__meta">
                <span className="lc-progress__label">{r.label}</span>
                {model.showValues && !inlineFits && <span className="lc-progress__value">{text}</span>}
              </div>
              <div className="lc-progress__track" data-track={model.track} style={{ height: barH }}>
                <div className="lc-progress__fill" style={{ width: `${pct}%`, background: r.color }}>
                  {model.showValues && inlineFits && <span className="lc-progress__inline">{text}</span>}
                </div>
                {segments > 0 && (
                  <div className="lc-progress__seps" aria-hidden="true">
                    {Array.from({ length: segments - 1 }, (_, k) => (
                      <span key={k} style={{ left: `${((k + 1) * 100) / segments}%` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {model.omitted > 0 && <div className="lc-progress__more">{model.omitted} more rows in the data view</div>}
      </div>
    </PlotSurface>
  );
}

/* ============================== Gauge ============================== */

export function GaugePlot({ model, width, height, mode, ix, report }: PlotProps<GaugeModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const adaptations: Adaptation[] = [];
  const f = model.format.format;
  const pos = model.position;
  const valueText = `${f(model.value)}${model.unit ? ` ${model.unit}` : ""}`;
  const arrow = model.movement === "Rising" ? "▲" : model.movement === "Falling" ? "▼" : "■";
  const content: TooltipContent = {
    title: "Gauge",
    rows: [
      { id: "v", label: "Value", value: valueText, color: model.color },
      { id: "s", label: "Scale", value: `${f(model.min)} – ${f(model.max)}` },
      ...(model.status ? [{ id: "st", label: "Status", value: model.status }] : []),
      { id: "m", label: "Movement", value: model.movement },
    ],
    footer: model.outOfRange ? [`Value is ${model.outOfRange} the scale; the marker is held at the ${model.outOfRange === "above" ? "maximum" : "minimum"}.`] : undefined,
  };
  let body: JSX.Element;
  if (model.type === "circular") {
    const r = Math.max(20, Math.min(width / 2, height / 1.6) - 8);
    const thick = Math.max(6, r * 0.16);
    const cx = width / 2;
    const cy = Math.min(height - 8, r + 8 + r * 0.1) ;
    const a0 = -Math.PI * 0.75;
    const a1 = Math.PI * 0.75;
    const track = d3arc()({ innerRadius: r - thick, outerRadius: r, startAngle: a0, endAngle: a1, cornerRadius: thick / 2 } as never) ?? "";
    const fill = pos === null ? "" : d3arc()({ innerRadius: r - thick, outerRadius: r, startAngle: a0, endAngle: a0 + (a1 - a0) * pos, cornerRadius: thick / 2 } as never) ?? "";
    const maxTicks = Math.max(2, Math.floor((r * 1.5 * Math.PI) / 6));
    const ticks = Math.min(model.subdivisions, maxTicks);
    if (ticks < model.subdivisions) adaptations.push({ id: "gauge-ticks", setting: "Meter & Labels::Tick subdivisions", requested: String(model.subdivisions), effective: String(ticks), reason: "Tick marks are reduced so they stay at least 6px apart." });
    const valueStyle = r > 70 ? TEXT.kpi : TEXT.kpiCompact;
    body = (
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={model.summary}>
        <g transform={`translate(${cx},${cy})`} aria-hidden="true">
          <path d={track} className="lc-track" />
          {fill && <path d={fill} fill={model.color} className="lc-mark" />}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const a = a0 + ((a1 - a0) * i) / ticks;
            const major = i % Math.max(1, Math.round(ticks / 4)) === 0;
            const r1 = r + 3;
            const r2 = r + (major ? 8 : 5);
            return <line key={i} className="lc-axis__tick" x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1} x2={Math.sin(a) * r2} y2={-Math.cos(a) * r2} />;
          })}
          {model.showCenter && (
            <>
              <text className="lc-gauge__value" textAnchor="middle" y={4} style={{ fontSize: valueStyle.size }}>
                {truncateText(valueText, valueStyle, (r - thick) * 1.8)}
              </text>
              <text className="lc-gauge__sub" textAnchor="middle" y={22}>
                {arrow} {model.movement}
              </text>
            </>
          )}
          <text className="lc-axis-text" textAnchor="middle" x={Math.sin(a0) * (r - thick / 2)} y={-Math.cos(a0) * (r - thick / 2) + 16}>
            {f(model.min)}
          </text>
          <text className="lc-axis-text" textAnchor="middle" x={Math.sin(a1) * (r - thick / 2)} y={-Math.cos(a1) * (r - thick / 2) + 16}>
            {f(model.max)}
          </text>
        </g>
      </svg>
    );
  } else {
    const barW = Math.max(12, Math.min(28, width * 0.18));
    const top = 10;
    const bottom = height - 10;
    const h = Math.max(10, bottom - top);
    const labelW = Math.max(measureText(f(model.max), TEXT.tick), measureText(f(model.min), TEXT.tick)) + 10;
    const showSide = width > barW + labelW * 2 + 40;
    const x = showSide ? labelW + 6 : (width - barW) / 2;
    const maxTicks = Math.max(2, Math.floor(h / 5));
    const ticks = Math.min(model.subdivisions, maxTicks);
    if (ticks < model.subdivisions) adaptations.push({ id: "gauge-ticks", setting: "Meter & Labels::Tick subdivisions", requested: String(model.subdivisions), effective: String(ticks), reason: "Tick marks are reduced so they stay at least 5px apart." });
    const yv = pos === null ? null : bottom - h * pos;
    body = (
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={model.summary}>
        <g aria-hidden="true">
          <rect className="lc-track" x={x} y={top} width={barW} height={h} rx={barW / 2} />
          {yv !== null && <rect className="lc-mark" x={x} y={yv} width={barW} height={bottom - yv} rx={barW / 2} fill={model.color} />}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const yy = bottom - (h * i) / ticks;
            const major = i % Math.max(1, Math.round(ticks / 4)) === 0;
            return <line key={i} className="lc-axis__tick" x1={x + barW + 3} x2={x + barW + (major ? 9 : 6)} y1={yy} y2={yy} />;
          })}
          {showSide && (
            <>
              <text className="lc-axis-text" x={x - 6} y={top + 4} textAnchor="end">
                {f(model.max)}
              </text>
              <text className="lc-axis-text" x={x - 6} y={bottom} textAnchor="end">
                {f(model.min)}
              </text>
            </>
          )}
          {model.showCenter && yv !== null && width > barW + 80 && (
            <text className="lc-gauge__value" x={x + barW + 14} y={Math.max(top + 14, Math.min(bottom - 4, yv + 6))} style={{ fontSize: mode === "micro" ? 16 : 20 }}>
              {valueText} <tspan className="lc-gauge__sub">{arrow}</tspan>
            </text>
          )}
          {model.outOfRange && yv !== null && <path d={`M${x + barW / 2 - 5},${model.outOfRange === "above" ? top - 2 : bottom + 2} l5,${model.outOfRange === "above" ? -6 : 6} l5,${model.outOfRange === "above" ? 6 : -6}z`} fill="var(--lc-text-warning)" />}
        </g>
      </svg>
    );
  }
  report(adaptations);
  const show = (pin: boolean) => {
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(content, anchorFromSvg(svgRef.current, width / 2, height / 3), { pin });
    ix.announce(`${content.rows.map((r) => `${r.label} ${r.value}`).join(", ")}`);
  };
  return (
    <PlotSurface
      label={model.summary}
      onNav={(a) => (a === "escape" ? ix.hide() : show(a === "enter" || ix.pinned))}
      onPointerMove={(e) => e.pointerType !== "touch" && !ix.pinned && show(false)}
      onPointerLeave={() => !ix.pinned && ix.hide()}
      onPointerDown={() => show(true)}
    >
      {body}
    </PlotSurface>
  );
}

/* ============================== Score indicator ============================== */

export function ScorePlot({ model, width, height, ix, report }: PlotProps<ScoreModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const st = model.style;
  const f = model.format.format;
  const trackH = Math.max(st.trackMin, Math.min(st.trackMax, height * 0.25 * st.heightRatio));
  const y = Math.min(st.yMax, height * st.yRatio) + Math.max(0, (height - trackH - (st.showScale ? 18 : 0)) / 2);
  const x0 = 6;
  const w = Math.max(20, width - 12);
  const pos = model.position;
  const mx = pos === null ? null : x0 + w * pos;
  const segW = w / model.colors.length;
  const gradId = useStableId("lc-score");
  report([]);
  const content: TooltipContent = {
    title: "Score",
    rows: [
      { id: "v", label: "Value", value: f(model.value), color: pos === null ? undefined : model.colors[Math.min(model.colors.length - 1, Math.floor(pos * model.colors.length))] },
      { id: "s", label: "Scale", value: `${f(model.min)} – ${f(model.max)}` },
    ],
    footer: model.outOfRange ? [`Value is ${model.outOfRange} the scale; the marker is held at the edge.`] : undefined,
  };
  const show = (pin: boolean) => {
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(content, anchorFromSvg(svgRef.current, mx ?? width / 2, y), { pin });
    ix.announce(content.rows.map((r) => `${r.label} ${r.value}`).join(", "));
  };
  return (
    <PlotSurface
      label={model.summary}
      onNav={(a) => (a === "escape" ? ix.hide() : show(a === "enter" || ix.pinned))}
      onPointerMove={(e) => e.pointerType !== "touch" && !ix.pinned && show(false)}
      onPointerLeave={() => !ix.pinned && ix.hide()}
      onPointerDown={() => show(true)}
    >
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={model.summary}>
        <defs>
          <clipPath id={gradId}>
            <rect x={x0} y={y} width={w} height={trackH} rx={trackH / 2} />
          </clipPath>
        </defs>
        <g aria-hidden="true">
          <rect x={x0} y={y} width={w} height={trackH} rx={trackH / 2} fill={st.emptyFill ?? "var(--lcc-track)"} stroke={st.emptyStroke ?? undefined} strokeWidth={st.emptyStrokeWidth || undefined} />
          <g clipPath={`url(#${gradId})`}>
            {model.colors.map((c, i) => {
              const sx = x0 + i * segW;
              const ex = st.fillToMarker && mx !== null ? Math.min(sx + segW, mx) : sx + segW;
              if (ex <= sx) return null;
              return <rect key={i} x={sx} y={y} width={ex - sx} height={trackH} fill={c} opacity={st.fillToMarker || mx === null ? 1 : 0.9} />;
            })}
          </g>
          {st.showMarker && mx !== null && (
            <g transform={`translate(${mx},${y + trackH / 2})`}>
              <circle r={trackH / 2 + 3} fill="var(--lc-bg-card)" stroke="var(--lc-text-primary)" strokeWidth={2} />
              {model.outOfRange && <circle r={2} fill="var(--lc-text-warning)" />}
            </g>
          )}
          {st.showScale && (
            <>
              <text className="lc-axis-text" x={x0} y={y + trackH + 14}>
                {f(model.min)}
              </text>
              <text className="lc-axis-text" x={x0 + w} y={y + trackH + 14} textAnchor="end">
                {f(model.max)}
              </text>
            </>
          )}
        </g>
      </svg>
    </PlotSurface>
  );
}

/* ============================== KPI card ============================== */

export function KpiCardView({ model, ix, report }: PlotProps<KpiCardModel>) {
  report([]);
  return (
    <div className="lc-kpicard" role="group" aria-label={model.summary}>
      <span className="lc-kpicard__label">{model.label}</span>
      <KpiLine kpi={model.kpi} compact={false} />
      {void ix}
    </div>
  );
}

/* ============================== KPI grid ============================== */

export function KpiGridView({ model, width, mode, ix, report }: PlotProps<KpiGridModel>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const minTile = mode === "micro" ? 120 : mode === "compact" ? 132 : 150;
  const cols = Math.max(1, Math.floor((width + 8) / (minTile + 8)));
  report([]);
  const contentFor = (i: number): TooltipContent => {
    const t = model.tiles[i];
    return {
      title: t.label,
      rows: [
        { id: "v", label: "Value", value: t.valueText, color: t.accent ?? undefined },
        ...(t.status ? [{ id: "s", label: "Status", value: t.status }] : []),
        ...(t.secondary ? [{ id: "x", label: "Detail", value: t.secondary }] : []),
      ],
      footer: model.showHover && t.tooltip ? [t.tooltip] : undefined,
    };
  };
  const showAt = (i: number, pin = false) => {
    const el = gridRef.current?.children[i] as HTMLElement | undefined;
    setActive(i);
    el?.scrollIntoView?.({ block: "nearest" });
    const c = contentFor(i);
    if (ix.tooltipsEnabled && (model.showHover || pin) && (pin || !ix.clickOnly)) ix.show(c, anchorOfEl(el), { pin });
    ix.announce(`${c.title}: ${c.rows.map((r) => `${r.label} ${r.value}`).join(", ")}`);
  };
  return (
    <PlotSurface
      label={`${model.summary} Use arrow keys to move between tiles.`}
      scroll
      onNav={(a) => {
        const n = model.tiles.length;
        if (a === "escape") return ix.hide(), setActive(null);
        if (!n) return;
        const c = active ?? -1;
        let i: number | null;
        if (a === "down") i = Math.min(n - 1, c < 0 ? 0 : c + cols);
        else if (a === "up") i = Math.max(0, c < 0 ? 0 : c - cols);
        else i = step(a, active, n);
        if (i !== null) showAt(i, a === "enter" || ix.pinned);
      }}
      onPointerLeave={() => !ix.pinned && (ix.hide(), setActive(null))}
    >
      <div ref={gridRef} className="lc-kpigrid" style={{ "--tile-min": `${minTile}px` } as CSSProperties}>
        {model.tiles.map((t, i) => (
          <div
            key={t.id}
            className={"lc-tile" + (model.glow && t.critical ? " lc-tile--glow" : "") + (active === i ? " is-active" : "")}
            style={t.accent ? ({ "--tile-accent": t.accent } as CSSProperties) : undefined}
            onPointerEnter={(e) => e.pointerType !== "touch" && !ix.pinned && showAt(i)}
            onPointerDown={() => showAt(i, true)}
          >
            <span className="lc-tile__label" title={t.label}>
              {t.label}
            </span>
            {model.showValue && <span className="lc-tile__value">{t.valueText}</span>}
            {t.secondary && <span className="lc-tile__secondary">{t.secondary}</span>}
            {model.showStatus && t.status && (
              <span className="lc-badge" data-tone={t.critical ? "negative" : "neutral"}>
                <span>{t.status}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </PlotSurface>
  );
}

/* ============================== Availability ============================== */

export function AvailabilityPlot({ model, width, height, ix, report }: PlotProps<AvailabilityModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const adaptations: Adaptation[] = [];
  const n = model.segments.length;
  const st = model.style;
  let gap = st.gap;
  let segW = n ? (width - gap * (n - 1)) / n : 0;
  if (segW < 2 && n) {
    gap = Math.max(0, Math.min(gap, 1));
    segW = (width - gap * (n - 1)) / n;
    adaptations.push({ id: "availability-gap", setting: "Bar::Segment gap", requested: `${st.gap}px`, effective: `${gap}px`, reason: `${n} segments need narrower gaps to fit ${width}px.` });
  }
  const barH = Math.max(12, Math.min(40, height - 22, st.width * 8));
  const y = Math.max(0, (height - barH - 18) / 2);
  const r = Math.min(segW / 2, barH / 2, (st.radius / 100) * Math.min(segW, barH));
  report(adaptations);
  const contentFor = (i: number): TooltipContent => {
    const s = model.segments[i];
    return {
      title: s.label,
      rows: [
        { id: "state", label: "State", value: s.state[0].toUpperCase() + s.state.slice(1), color: s.color },
        ...(s.value !== null ? [{ id: "v", label: "Value", value: String(s.value) }] : []),
        { id: "rows", label: "Rows", value: s.rowIndexes.length ? String(s.rowIndexes.length) : "No data" },
      ],
      footer: s.rowIndexes.length > 1 ? ["Combined segments show the worst state in the period."] : undefined,
    };
  };
  const showAt = (i: number, pin = false) => {
    if (!model.segments[i]) return;
    setActive(i);
    const c = contentFor(i);
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(c, anchorFromSvg(svgRef.current, i * (segW + gap) + segW / 2, y), { pin });
    ix.announce(`${c.title}: ${c.rows.map((x) => `${x.label} ${x.value}`).join(", ")}`);
  };
  const first = model.segments[0];
  const last = model.segments[n - 1];
  const startLabel = model.axis === "time" && first?.start != null ? formatTimeExact(first.start) : "Oldest";
  const endLabel = model.axis === "time" && last?.end != null ? formatTimeExact(last.end) : "Latest";
  return (
    <PlotSurface
      label={`${model.summary} Use arrow keys to move between segments.`}
      onNav={(a) => {
        if (a === "escape") return ix.hide(), setActive(null);
        const i = step(a, active, n);
        if (i !== null) showAt(i, a === "enter" || ix.pinned);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch" || ix.pinned) return;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const i = Math.floor((e.clientX - rect.left) / (segW + gap));
        if (i >= 0 && i < n && i !== active) showAt(i);
      }}
      onPointerLeave={() => !ix.pinned && (ix.hide(), setActive(null))}
      onPointerDown={(e) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const i = Math.floor((e.clientX - rect.left) / (segW + gap));
        if (i >= 0 && i < n) showAt(i, true);
      }}
    >
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={model.summary}>
        <g aria-hidden="true">
          {model.segments.map((s, i) => (
            <rect key={i} className={"lc-mark" + (active !== null && active !== i && model.tooltip.highlight ? " lc-mark--dim" : "")} x={i * (segW + gap)} y={y} width={Math.max(0.5, segW)} height={barH} rx={r} fill={s.color} data-state={s.state} />
          ))}
          {active !== null && <rect className="lc-focus-ring" x={active * (segW + gap) - 2} y={y - 2} width={segW + 4} height={barH + 4} rx={r + 1} />}
          <text className="lc-axis-text" x={0} y={y + barH + 14}>
            {truncateText(startLabel, TEXT.tick, width / 2 - 8)}
          </text>
          <text className="lc-axis-text" x={width} y={y + barH + 14} textAnchor="end">
            {truncateText(endLabel, TEXT.tick, width / 2 - 8)}
          </text>
        </g>
      </svg>
    </PlotSurface>
  );
}

/* ============================== Table ============================== */

export function TablePlot({ model, report }: PlotProps<TableModel>) {
  report([]);
  return <DataTableView table={{ caption: model.table.caption, columns: model.columns, rows: model.rows, notes: model.table.notes }} />;
}
