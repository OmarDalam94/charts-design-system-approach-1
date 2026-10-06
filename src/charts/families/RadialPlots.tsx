import { useMemo, useRef, useState, type PointerEvent } from "react";
import { arc as d3arc, pie as d3pie, type PieArcDatum } from "d3-shape";
import { scaleSqrt } from "d3-scale";
import { sankey as d3sankey, type SankeyGraph, type SankeyLink, type SankeyNode } from "d3-sankey";
import type { DonutModel, DonutSlice, PolarModel, SankeyModel, SankeyNodeModel } from "../model";
import { formatExact } from "../format";
import { formatShare } from "../derive/common";
import { measureText, TEXT, truncateText } from "../textMeasure";
import type { Adaptation } from "../settings";
import type { TooltipContent } from "../primitives/Tooltip";
import { useStableId } from "../primitives/hooks";
import { anchorFromSvg, PlotSurface, wrapIndex, type NavAction, type PlotProps } from "./shared";

function navIndex(a: NavAction, cur: number | null, n: number): number | null {
  if (!n) return null;
  const c = cur ?? -1;
  if (a === "next" || a === "down") return wrapIndex(c + 1, n);
  if (a === "prev" || a === "up") return wrapIndex(c < 0 ? -1 : c - 1, n);
  if (a === "home") return 0;
  if (a === "end") return n - 1;
  return Math.max(0, c);
}

/* ============================== Donut ============================== */

export function DonutPlot({ model, width, height, ix, report }: PlotProps<DonutModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const descId = useStableId("lc-desc");
  const [active, setActive] = useState<number | null>(null);
  const adaptations: Adaptation[] = [];
  const drawn = model.slices.filter((s) => !ix.hidden.has(s.identity.id) && s.value !== null && s.value > 0);
  const r = Math.max(10, Math.min(width, height) / 2 - 4);
  const inner = r * Math.max(0, Math.min(0.95, model.innerRatio));
  const cx = width / 2;
  const cy = height / 2;
  const arcs = useMemo(
    () =>
      d3pie<DonutSlice>()
        .sort(null)
        .value((s) => s.value as number)
        .padAngle(drawn.length > 1 ? Math.min(0.02, 2 / r) : 0)(drawn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, ix.hidden, r],
  );
  const arcGen = d3arc<PieArcDatum<DonutSlice>>().innerRadius(inner).outerRadius(r).cornerRadius(Math.min(3, (r - inner) / 6));
  const hoverArc = d3arc<PieArcDatum<DonutSlice>>().innerRadius(inner).outerRadius(r + 4);
  const labelArc = d3arc<PieArcDatum<DonutSlice>>().innerRadius(inner + (r - inner) * 0.55).outerRadius(inner + (r - inner) * 0.55);

  const labelText = (s: DonutSlice) => {
    const pct = s.share === null ? null : formatShare(s.share);
    const val = model.format.format(s.value);
    return model.labelFormat === "value" ? val : model.labelFormat === "both" && pct ? `${val} · ${pct}` : pct ?? val;
  };

  let hiddenLabels = 0;
  const labels = model.showDataLabels
    ? arcs.flatMap((a, i) => {
        const text = labelText(a.data);
        const w = measureText(text, TEXT.tick);
        const span = (a.endAngle - a.startAngle) * (inner + (r - inner) * 0.55);
        if (span < w + 6 || r - inner < 14) {
          hiddenLabels++;
          return [];
        }
        const [lx, ly] = labelArc.centroid(a);
        return [
          <text key={i} className="lc-label" x={cx + lx} y={cy + ly} dy="0.32em" textAnchor="middle">
            {text}
          </text>,
        ];
      })
    : [];
  if (hiddenLabels) adaptations.push({ id: "labels-hidden", setting: "Pie / Donut::Label format", reason: `${hiddenLabels} slice label${hiddenLabels === 1 ? " does" : "s do"} not fit and ${hiddenLabels === 1 ? "is" : "are"} shown in the tooltip and legend instead.` });
  if (model.innerRatio < 0.3 && model.innerRatio > 0) adaptations.push({ id: "donut-thin-hole", setting: "Pie / Donut::Inner radius", reason: "The inner radius is too small for a centre total; the total is in the data view." });
  report(adaptations);

  const contentFor = (i: number): TooltipContent => {
    const s = arcs[i].data;
    return {
      title: s.identity.label,
      rows: [
        { id: "v", label: "Value", value: model.format.format(s.value), color: s.identity.color },
        { id: "s", label: "Share of total", value: s.share === null ? "—" : formatShare(s.share) },
      ],
      footer: drawn.length < model.slices.length ? [`Share uses all ${model.slices.filter((x) => x.share !== null).length} drawable slices, including hidden ones.`] : undefined,
    };
  };
  const showAt = (i: number, pin = false) => {
    if (!arcs[i]) return;
    setActive(i);
    const [ax, ay] = arcGen.centroid(arcs[i]);
    const c = contentFor(i);
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(c, anchorFromSvg(svgRef.current, cx + ax, cy + ay), { pin });
    ix.announce(`${c.title}: ${c.rows.map((x) => `${x.label} ${x.value}`).join(", ")}`);
  };
  const hit = (e: PointerEvent<HTMLDivElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    const d = Math.hypot(dx, dy);
    if (d < inner || d > r + 4) return -1;
    let ang = Math.atan2(dx, -dy);
    if (ang < 0) ang += Math.PI * 2;
    return arcs.findIndex((a) => ang >= a.startAngle && ang <= a.endAngle);
  };

  return (
    <PlotSurface
      label={`${model.summary} Use arrow keys to move between slices.`}
      describedBy={descId}
      onNav={(a) => {
        if (a === "escape") {
          ix.hide();
          setActive(null);
          return;
        }
        const i = navIndex(a, active, arcs.length);
        if (i !== null) showAt(i, a === "enter" || ix.pinned);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch" || ix.pinned) return;
        const i = hit(e);
        if (i < 0) {
          ix.hide();
          setActive(null);
        } else if (i !== active) showAt(i);
      }}
      onPointerLeave={() => !ix.pinned && (ix.hide(), setActive(null))}
      onPointerDown={(e) => {
        const i = hit(e);
        if (i >= 0) showAt(i, true);
        else ix.hide();
      }}
    >
      <span id={descId} className="lc-sr">
        Arrow keys move between slices, Enter pins details, Escape closes them.
      </span>
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={model.summary}>
        <g aria-hidden="true">
          {model.state === "all-zero" && <circle cx={cx} cy={cy} r={(r + inner) / 2} fill="none" className="lc-track" stroke="var(--lcc-track)" strokeWidth={Math.max(2, r - inner)} />}
          {arcs.map((a, i) => (
            <path
              key={a.data.identity.id}
              className={"lc-mark" + (active !== null && model.tooltip.highlight && active !== i ? " lc-mark--dim" : "")}
              transform={`translate(${cx},${cy})`}
              d={(active === i ? hoverArc(a) : arcGen(a)) ?? ""}
              fill={a.data.identity.color}
              stroke="var(--lc-bg-card)"
              strokeWidth={1}
            />
          ))}
          {labels}
          {model.centerText && inner >= 36 && (
            <g className="lc-donut-center">
              <text x={cx} y={cy - 2} textAnchor="middle" className="lc-donut-center__value">
                {truncateText(model.centerText.value, TEXT.kpiCompact, inner * 1.7)}
              </text>
              <text x={cx} y={cy + 14} textAnchor="middle" className="lc-donut-center__label">
                {truncateText(model.centerText.label, TEXT.micro, inner * 1.6)}
              </text>
            </g>
          )}
        </g>
      </svg>
    </PlotSurface>
  );
}

/* ============================== Polar wind rose ============================== */

export function PolarPlot({ model, width, height, mode, ix, report }: PlotProps<PolarModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const descId = useStableId("lc-desc");
  const [active, setActive] = useState<number | null>(null);
  const adaptations: Adaptation[] = [];
  const st = model.style;
  const labelRoom = st.showDirections ? 18 : 4;
  const side = Math.min(width, height);
  const requestedR = side * st.outerRatio * 1.25;
  const outer = Math.max(16, Math.min(side / 2 - labelRoom, requestedR));
  if (requestedR > side / 2 - labelRoom) adaptations.push({ id: "polar-radius", setting: "Colors::Outer radius ratio", reason: "The outer radius is reduced so direction labels stay inside the card." });
  const hole = Math.min(outer * 0.5, Math.max(0, st.innerHole));
  const cx = width / 2;
  const cy = height / 2;
  const n = model.bins.length || 8;
  const step = (Math.PI * 2) / n;
  const visibleBands = model.bands.filter((b) => !ix.hidden.has(b.id));
  const totals = model.bins.map((b) => b.bands.filter((x) => !ix.hidden.has(x.identity.id)).reduce((a, x) => a + x.value, 0));
  const max = Math.max(model.maxTotal, 1e-9);
  const rScale = scaleSqrt().domain([0, max]).range([hole, outer]);
  const rings = Array.from({ length: model.rings }, (_, i) => (max * (i + 1)) / model.rings);
  const showDirLabels = st.showDirections && outer > 40;
  const dirEvery = n === 16 && (mode === "micro" || outer < 90) ? 2 : 1;
  if (st.showDirections && dirEvery > 1) adaptations.push({ id: "polar-dir-thinned", reason: "Only the 8 main compass labels are shown at this size." });
  report(adaptations);

  const wedge = (a0: number, a1: number, r0: number, r1: number) => d3arc()({ innerRadius: r0, outerRadius: r1, startAngle: a0, endAngle: a1 }) ?? "";

  const contentFor = (i: number): TooltipContent => {
    const b = model.bins[i];
    return {
      title: `From ${b.direction} (${b.angle}°)`,
      rows: b.bands
        .filter((x) => !ix.hidden.has(x.identity.id))
        .map((x) => ({ id: x.identity.id, label: x.band, value: model.format.format(x.value), color: x.identity.color })),
      footer: [`Total: ${model.format.format(totals[i])}`],
    };
  };
  const showAt = (i: number, pin = false) => {
    const b = model.bins[i];
    if (!b) return;
    setActive(i);
    const ang = (b.angle * Math.PI) / 180;
    const rr = rScale(totals[i]);
    const c = contentFor(i);
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(c, anchorFromSvg(svgRef.current, cx + Math.sin(ang) * rr, cy - Math.cos(ang) * rr), { pin });
    ix.announce(`${c.title}. ${c.rows.map((x) => `${x.label} ${x.value}`).join("; ")}. ${c.footer?.[0] ?? ""}`);
  };
  const hit = (e: PointerEvent<HTMLDivElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    if (Math.hypot(dx, dy) > outer + 6) return -1;
    let ang = Math.atan2(dx, -dy);
    if (ang < 0) ang += Math.PI * 2;
    return Math.round(ang / step) % n;
  };

  return (
    <PlotSurface
      label={`${model.summary} ${model.convention} Use arrow keys to move between directions.`}
      describedBy={descId}
      onNav={(a) => {
        if (a === "escape") {
          ix.hide();
          setActive(null);
          return;
        }
        const i = navIndex(a, active, model.bins.length);
        if (i !== null) showAt(i, a === "enter" || ix.pinned);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch" || ix.pinned) return;
        const i = hit(e);
        if (i < 0) {
          ix.hide();
          setActive(null);
        } else if (i !== active) showAt(i);
      }}
      onPointerLeave={() => !ix.pinned && (ix.hide(), setActive(null))}
      onPointerDown={(e) => {
        const i = hit(e);
        if (i >= 0) showAt(i, true);
        else ix.hide();
      }}
    >
      <span id={descId} className="lc-sr">
        {model.convention} Arrow keys move between directions, Enter pins details, Escape closes them.
      </span>
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={model.summary}>
        <g transform={`translate(${cx},${cy})`} aria-hidden="true">
          {st.showRings &&
            rings.map((v, i) => (
              <circle key={i} r={rScale(v)} fill="none" style={{ stroke: st.gridColor ?? "var(--lcc-grid)" }} strokeWidth={st.ringStroke} />
            ))}
          {st.innerRatio > 0 && <circle r={outer * Math.min(1, st.innerRatio)} fill="none" style={{ stroke: st.gridColor ?? "var(--lcc-grid)" }} strokeDasharray="2 3" strokeWidth={st.ringStroke} />}
          {Array.from({ length: n }, (_, i) => {
            const a = i * step;
            return <line key={i} x1={Math.sin(a) * hole} y1={-Math.cos(a) * hole} x2={Math.sin(a) * outer} y2={-Math.cos(a) * outer} style={{ stroke: st.spokeColor ?? "var(--lcc-grid)" }} strokeWidth={st.spokeStroke} />;
          })}
          {model.bins.map((b, i) => {
            const a = (b.angle * Math.PI) / 180;
            const half = (step * 0.84) / 2;
            let acc = 0;
            return (
              <g key={b.direction} className={"lc-mark" + (active !== null && model.tooltip.highlight && active !== i ? " lc-mark--dim" : "")}>
                {b.bands
                  .filter((x) => !ix.hidden.has(x.identity.id) && x.value > 0)
                  .map((x) => {
                    const r0 = rScale(acc);
                    acc += x.value;
                    const r1 = rScale(acc);
                    return <path key={x.identity.id} d={wedge(a - half, a + half, r0, r1)} fill={x.identity.color} stroke="var(--lc-bg-card)" strokeWidth={0.5} />;
                  })}
              </g>
            );
          })}
          {active !== null && model.bins[active] && (
            <path className="lc-focus-ring" d={wedge(((model.bins[active].angle * Math.PI) / 180) - step / 2, ((model.bins[active].angle * Math.PI) / 180) + step / 2, hole, Math.max(hole + 4, rScale(totals[active]) + 2))} />
          )}
          {showDirLabels &&
            model.bins.map((b, i) =>
              i % dirEvery ? null : (
                <text
                  key={`d${b.direction}`}
                  className="lc-axis-text"
                  x={Math.sin((b.angle * Math.PI) / 180) * (outer + 10)}
                  y={-Math.cos((b.angle * Math.PI) / 180) * (outer + 10)}
                  dy="0.32em"
                  textAnchor="middle"
                  style={st.directionColor ? { fill: st.directionColor } : undefined}
                >
                  {b.direction}
                </text>
              ),
            )}
          {st.showValues &&
            st.showRings &&
            outer > 60 &&
            rings.map((v, i) => (
              <text key={`rv${i}`} className="lc-label" x={4} y={-rScale(v) - 2} style={st.valueColor ? { fill: st.valueColor } : undefined}>
                {model.format.format(v)}
              </text>
            ))}
        </g>
        {!visibleBands.length && null}
      </svg>
    </PlotSurface>
  );
}

/* ============================== Sankey ============================== */

type SNode = SankeyNodeModel & { stageIndex: number };
type SLink = { source: string; target: string; value: number; idx: number };

export function SankeyPlot({ model, width, height, mode, ix, report }: PlotProps<SankeyModel>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const descId = useStableId("lc-desc");
  const [active, setActive] = useState<number | null>(null);
  const adaptations: Adaptation[] = [];
  const st = model.style;
  const lastStage = model.stages.length - 1;
  const stageCount = model.stages.length;
  // Each column pitch holds a node plus the label after it (the last column too), so labels never share a gap.
  const minPitch = st.showLabels ? (mode === "micro" ? 84 : 104) : 32;
  const needW = minPitch * stageCount;
  const contentW = Math.max(width, needW);
  const scrolls = contentW > width + 0.5;
  const pitch = Math.max(minPitch, (contentW - 2) / stageCount);
  if (scrolls) adaptations.push({ id: "sankey-scroll", reason: `${stageCount} stages need at least ${Math.ceil(needW)}px to keep labels readable, so the diagram scrolls horizontally inside the card.` });
  const scrollbar = scrolls ? 12 : 0;
  const plotH = Math.max(40, height - scrollbar);
  const maxPerStage = Math.max(1, ...model.stages.map((_, i) => model.nodes.filter((nd) => nd.stage === i).length));
  const gap = Math.max(1, Math.min(st.nodeGap, (plotH * 0.45) / Math.max(1, maxPerStage - 1)));
  if (gap < st.nodeGap) adaptations.push({ id: "sankey-gap", setting: "Sankey::Node gap", requested: `${st.nodeGap}px`, effective: `${Math.round(gap)}px`, reason: "Node gaps are reduced so every node keeps a visible height." });
  const nodeW = Math.max(4, Math.min(st.nodeWidth, pitch / 4));
  if (nodeW < st.nodeWidth) adaptations.push({ id: "sankey-node-width", setting: "Sankey::Node width", requested: `${st.nodeWidth}px`, effective: `${Math.round(nodeW)}px`, reason: "Nodes are narrowed so flows have room between stages." });
  const labelW = st.showLabels ? Math.max(0, pitch - nodeW - 14) : 0;
  const drawW = pitch * Math.max(1, stageCount - 1) + nodeW + 2;

  const graph = useMemo(() => {
    if (!model.nodes.length || !model.links.length) return null;
    const gen = d3sankey<SNode, SLink>()
      .nodeId((d) => d.id)
      .nodeAlign((d) => (d as SNode).stage)
      .nodeWidth(nodeW)
      .nodePadding(gap)
      .nodeSort(null)
      .extent([
        [1, 2],
        [drawW - 1, Math.max(10, plotH - 2)],
      ]);
    try {
      return gen({
        nodes: model.nodes.map((nd) => ({ ...nd, stageIndex: nd.stage })),
        links: model.links.map((l, idx) => ({ source: l.source, target: l.target, value: l.value, idx })),
      }) as SankeyGraph<SNode, SLink>;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, drawW, plotH, nodeW, gap]);
  report(adaptations);
  if (!graph) return <div className="lc-state">Flows could not be laid out.</div>;

  const links = graph.links as SankeyLink<SNode, SLink>[];
  const nodes = graph.nodes as SankeyNode<SNode, SLink>[];
  const total = nodes.filter((nd) => nd.stage === 0).reduce((a, nd) => a + (nd.value ?? 0), 0);
  const linkPath = (l: SankeyLink<SNode, SLink>) => {
    const s = l.source as SankeyNode<SNode, SLink>;
    const t = l.target as SankeyNode<SNode, SLink>;
    const x0 = s.x1 ?? 0;
    const x1 = t.x0 ?? 0;
    const k = Math.max(0.05, Math.min(0.95, st.curvature));
    const xi = x0 + (x1 - x0) * k;
    const xj = x1 - (x1 - x0) * k;
    return `M${x0},${l.y0}C${xi},${l.y0} ${xj},${l.y1} ${x1},${l.y1}`;
  };
  const items: ({ kind: "node"; n: SankeyNode<SNode, SLink> } | { kind: "link"; l: SankeyLink<SNode, SLink> })[] = [...nodes.map((n) => ({ kind: "node" as const, n })), ...links.map((l) => ({ kind: "link" as const, l }))];

  const contentFor = (i: number): TooltipContent => {
    const it = items[i];
    if (it.kind === "node") {
      const inflow = (it.n.targetLinks ?? []).reduce((a, l) => a + l.value, 0);
      const outflow = (it.n.sourceLinks ?? []).reduce((a, l) => a + l.value, 0);
      return {
        title: `${it.n.label} · ${model.stages[it.n.stage] ?? `Stage ${it.n.stage + 1}`}`,
        rows: [
          ...(it.n.stage > 0 ? [{ id: "in", label: "Inflow", value: model.format.format(inflow), color: it.n.identity.color }] : []),
          ...(it.n.stage < lastStage ? [{ id: "out", label: "Outflow", value: model.format.format(outflow), color: it.n.identity.color }] : []),
          ...(total > 0 && it.n.stage === 0 ? [{ id: "share", label: "Share of first stage", value: formatShare(outflow / total) }] : []),
        ],
      };
    }
    const s = it.l.source as SankeyNode<SNode, SLink>;
    const t = it.l.target as SankeyNode<SNode, SLink>;
    const sOut = (s.sourceLinks ?? []).reduce((a, l) => a + l.value, 0);
    return {
      title: `${s.label} → ${t.label}`,
      rows: [
        { id: "v", label: "Flow", value: model.format.format(it.l.value), color: s.identity.color },
        { id: "s", label: `Share of ${s.label}`, value: sOut > 0 ? formatShare(it.l.value / sOut) : "—" },
      ],
    };
  };
  const anchorOf = (i: number) => {
    const it = items[i];
    if (it.kind === "node") return anchorFromSvg(svgRef.current, it.n.x1 ?? 0, ((it.n.y0 ?? 0) + (it.n.y1 ?? 0)) / 2);
    const s = it.l.source as SankeyNode<SNode, SLink>;
    const t = it.l.target as SankeyNode<SNode, SLink>;
    return anchorFromSvg(svgRef.current, ((s.x1 ?? 0) + (t.x0 ?? 0)) / 2, ((it.l.y0 ?? 0) + (it.l.y1 ?? 0)) / 2);
  };
  const showAt = (i: number, pin = false) => {
    if (!items[i]) return;
    setActive(i);
    const c = contentFor(i);
    if (ix.tooltipsEnabled && (pin || !ix.clickOnly)) ix.show(c, anchorOf(i), { pin });
    ix.announce(`${c.title}. ${c.rows.map((x) => `${x.label} ${x.value}`).join("; ")}`);
  };
  // One label per 13px of column height: a label is kept only when it clears the previous kept label.
  const labelled = new Set<string>();
  if (st.showLabels) {
    for (let k = 0; k < stageCount; k++) {
      let lastY = -Infinity;
      for (const nd of nodes.filter((n) => n.stage === k).sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0))) {
        const cy = ((nd.y0 ?? 0) + (nd.y1 ?? 0)) / 2;
        if ((nd.y1 ?? 0) - (nd.y0 ?? 0) >= 6 && cy - lastY >= 13) {
          labelled.add(nd.id);
          lastY = cy;
        }
      }
    }
    const hiddenLabels = nodes.length - labelled.size;
    if (hiddenLabels > 0) adaptations.push({ id: "sankey-labels-thinned", reason: `${hiddenLabels} node label${hiddenLabels === 1 ? " is" : "s are"} hidden where nodes are too close; every node is named in its tooltip and the data view.` });
  }
  const activeItem = active !== null ? items[active] : null;
  const related = (l: SankeyLink<SNode, SLink>) => {
    if (!activeItem) return true;
    if (activeItem.kind === "link") return activeItem.l === l;
    return l.source === activeItem.n || l.target === activeItem.n;
  };

  return (
    <PlotSurface
      label={`${model.summary} Use arrow keys to move between nodes and flows.`}
      describedBy={descId}
      scroll={scrolls}
      onNav={(a) => {
        if (a === "escape") {
          ix.hide();
          setActive(null);
          return;
        }
        const i = navIndex(a, active, items.length);
        if (i !== null) showAt(i, a === "enter" || ix.pinned);
      }}
      onPointerLeave={() => !ix.pinned && (ix.hide(), setActive(null))}
    >
      <span id={descId} className="lc-sr">
        Arrow keys move through nodes, then flows. Enter pins details, Escape closes them.
      </span>
      <svg ref={svgRef} width={contentW} height={plotH} role="img" aria-label={model.summary}>
        <g fill="none" aria-hidden="true">
          {links.map((l, i) => {
            const s = l.source as SankeyNode<SNode, SLink>;
            const idx = nodes.length + i;
            return (
              <path
                key={i}
                className="lc-mark"
                d={linkPath(l)}
                stroke={s.identity.color}
                strokeOpacity={activeItem ? (related(l) ? Math.min(1, st.linkOpacity + 0.3) : st.linkOpacity * 0.3) : st.linkOpacity}
                strokeWidth={Math.max(1, l.width ?? 1)}
                onPointerEnter={(e) => e.pointerType !== "touch" && !ix.pinned && showAt(idx)}
                onPointerDown={() => showAt(idx, true)}
              />
            );
          })}
        </g>
        <g aria-hidden="true">
          {nodes.map((nd, i) => (
            <g key={nd.id}>
              <rect
                className="lc-mark"
                x={nd.x0}
                y={nd.y0}
                width={Math.max(1, (nd.x1 ?? 0) - (nd.x0 ?? 0))}
                height={Math.max(1, (nd.y1 ?? 0) - (nd.y0 ?? 0))}
                fill={nd.identity.color}
                rx={2}
                onPointerEnter={(e) => e.pointerType !== "touch" && !ix.pinned && showAt(i)}
                onPointerDown={() => showAt(i, true)}
              />
              {labelled.has(nd.id) && (
                <text
                  className="lc-cat-label lc-flow-label"
                  x={(nd.x1 ?? 0) + 6}
                  data-full={nd.label}
                  y={((nd.y0 ?? 0) + (nd.y1 ?? 0)) / 2}
                  dy="0.32em"
                  textAnchor="start"
                >
                  {truncateText(nd.label, TEXT.small, labelW)}
                </text>
              )}
            </g>
          ))}
          {activeItem?.kind === "node" && <rect className="lc-focus-ring" x={(activeItem.n.x0 ?? 0) - 2} y={(activeItem.n.y0 ?? 0) - 2} width={(activeItem.n.x1 ?? 0) - (activeItem.n.x0 ?? 0) + 4} height={(activeItem.n.y1 ?? 0) - (activeItem.n.y0 ?? 0) + 4} rx={3} />}
        </g>
      </svg>
      {model.dropped.length > 0 && <p className="lc-notice">{model.dropped.map((d) => `${d.count} ${d.reason.toLowerCase()} not drawn`).join(" · ")}</p>}
      <span className="lc-sr">Total {formatExact(total)}</span>
    </PlotSurface>
  );
}
