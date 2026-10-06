import { aggregate, cellText, isAdditive, parseNumber, type AggregationMode } from "../data/values";
import { formatExact } from "../format";
import { assignIdentities, firstAppearance, NEUTRAL_MARK, seriesColors } from "../identity";
import type { DataTableModel, DonutModel, PolarBin, PolarModel, SankeyLinkModel, SankeyModel, SankeyNodeModel } from "../model";
import {
  evaluateFlags,
  formatShare,
  headerFor,
  insightText,
  legendFor,
  statusBadge,
  storyKpi,
  tooltipConfig,
  type DeriveContext,
} from "./common";

const NO_VALUE = "(No value)";

function envelopeBase(ctx: DeriveContext, primary: string) {
  const kpi = storyKpi(ctx, primary);
  const badge = statusBadge(ctx, { valueText: kpi?.text });
  const flags = evaluateFlags(ctx);
  return {
    visualId: ctx.input.visualId,
    family: ctx.asset.family,
    header: headerFor(ctx, { kpi, badge, flags }),
    insight: insightText(ctx),
    flags,
    tooltip: tooltipConfig(ctx),
    showDataLabels: ctx.s.bool("Layout & visibility", "Show data labels"),
    cardOutline: ctx.s.bool("Layout & visibility", "Show card outline"),
  };
}

function groupAggregate(
  ctx: DeriveContext,
  keys: string[],
  values: (number | null)[],
  mode: AggregationMode,
  noun: string,
): { order: string[]; value: Map<string, number | null>; rows: Map<string, number[]> } {
  const rows = new Map<string, number[]>();
  const vals = new Map<string, (number | null)[]>();
  keys.forEach((k, i) => {
    if (!rows.has(k)) {
      rows.set(k, []);
      vals.set(k, []);
    }
    rows.get(k)!.push(i);
    vals.get(k)!.push(values[i]);
  });
  const order = firstAppearance(keys);
  const value = new Map<string, number | null>();
  let dupGroups = 0;
  let dupRows = 0;
  for (const k of order) {
    const v = vals.get(k)!;
    if (mode === "raw" && v.length > 1) {
      dupGroups++;
      dupRows += v.length - 1;
    }
    value.set(k, mode === "raw" ? v.find((x) => x !== null) ?? null : aggregate(v, mode, v.length));
  }
  if (dupGroups) {
    ctx.issue(
      "raw-duplicates",
      "warning",
      `Aggregation is None, but ${dupGroups} ${noun}${dupGroups === 1 ? "" : "s"} ${dupGroups === 1 ? "has" : "have"} several rows. Each shows its first value; ${dupRows} row${dupRows === 1 ? " is" : "s are"} not counted. Choose an aggregation.`,
      ["Mapping::Aggregation"],
    );
  }
  return { order, value, rows };
}

/* ---------------- Donut ---------------- */

export function deriveDonut(ctx: DeriveContext): DonutModel {
  const s = ctx.s;
  const catCol = ctx.col("Category");
  const valCol = ctx.measure("Value");
  const missing = ctx.missingRequired((o) => ctx.aggregation === "count" && o.name === "Value");
  const keys = ctx.rows.map((r) => cellText(r[catCol]).trim() || NO_VALUE);
  let invalid = 0;
  const values = ctx.rows.map((r) => {
    if (ctx.aggregation === "count") return 1;
    const p = parseNumber(r[valCol]);
    if (p.status === "invalid") invalid++;
    return p.value;
  });
  if (invalid) ctx.issue("invalid-values", "warning", `${invalid} value${invalid === 1 ? " is" : "s are"} not numbers and ${invalid === 1 ? "is" : "are"} excluded, not counted as zero.`);
  const g = missing.length ? { order: [], value: new Map(), rows: new Map() } : groupAggregate(ctx, keys, values, ctx.aggregation, "slice");
  const additive = isAdditive(ctx.aggregation);
  if (!additive && g.order.length) ctx.issue("donut-non-additive", "warning", "Slices show averages, minimums or maximums, which do not add up to a whole. Percentages are withheld.", ["Mapping::Aggregation"]);
  const mode = s.palette();
  const colors = seriesColors(mode, g.order);
  if (colors.note && g.order.length > 1) ctx.adapt({ id: "palette-series", setting: "Colors::Palette", requested: mode.style, effective: "Categorical per slice", reason: colors.note.replace("series", "slices") });
  const ids = assignIdentities(g.order, null, colors.colors);
  const excluded: DonutModel["excluded"] = [];
  let total = 0;
  for (const id of ids) {
    const v = g.value.get(id.key) as number | null;
    if (v === null) excluded.push({ label: id.label, value: null, reason: "No value" });
    else if (v < 0) excluded.push({ label: id.label, value: v, reason: "Negative values cannot be a share of a whole" });
    else total += v;
  }
  if (excluded.some((e) => e.value !== null)) ctx.issue("donut-negative", "warning", `${excluded.filter((e) => e.value !== null).length} slice${excluded.length === 1 ? " has" : "s have"} a negative value and ${excluded.length === 1 ? "is" : "are"} not drawn.`);
  const slices = ids.map((identity) => {
    const v = g.value.get(identity.key) as number | null;
    const drawable = v !== null && v >= 0;
    return {
      identity,
      value: v,
      share: drawable && additive && total > 0 ? v / total : null,
      rowIndexes: g.rows.get(identity.key) ?? [],
    };
  });
  const fmt = ctx.formatter();
  const innerRatio = s.slider("Pie / Donut", "Inner radius", 0.05);
  const lf = (s.str("Pie / Donut", "Label format") || "Percentage").toLowerCase();
  const labelFormat = lf.startsWith("both") ? "both" : lf.startsWith("value") ? "value" : "percentage";
  let state: DonutModel["state"] = "ready";
  let stateMessage: string | undefined;
  if (missing.length) {
    state = "missing-mapping";
    stateMessage = `Map ${missing.join(" and ")} to draw this chart.`;
  } else if (!ctx.rows.length) {
    state = "empty";
    stateMessage = "The data source returned no rows.";
  } else if (slices.every((sl) => sl.value === null)) {
    state = "all-null";
    stateMessage = "Every value is missing, so there is nothing to plot.";
  } else if (total === 0) {
    state = "all-zero";
    stateMessage = "All slices are zero, so there is no whole to divide. Values are listed in the legend and data view.";
  }
  const legend = legendFor(
    ctx,
    slices.map((sl) => ({ id: sl.identity.id, label: sl.identity.label, color: sl.identity.color, stat: sl.value })),
    { statLabel: "Value", additive: additive && total > 0, format: fmt },
  );
  // Percent denominator is the drawn total, not the sum including negatives.
  legend.items = legend.items.map((it, i) => {
    const sl = slices[i];
    if (!legend.showPercentages) return it;
    if (sl.share === null) return { ...it, percentText: undefined, percentReason: sl.value !== null && sl.value < 0 ? "Negative values have no share." : it.percentReason ?? "No share." };
    return { ...it, percentText: formatShare(sl.share), percentReason: undefined };
  });
  const table: DataTableModel = {
    caption: `${ctx.input.title || ctx.asset.label} data`,
    columns: [
      { key: "category", label: catCol ? ctx.label(catCol) : "Category" },
      { key: "value", label: valCol ? ctx.label(valCol) : "Value", numeric: true },
      { key: "share", label: "Share of total", numeric: true },
      { key: "rows", label: "Rows", numeric: true },
    ],
    rows: slices.map((sl) => ({
      category: { text: sl.identity.label, sort: sl.identity.index },
      value: { text: formatExact(sl.value), sort: sl.value },
      share: { text: sl.share === null ? "—" : `${(sl.share * 100).toFixed(2)}%`, sort: sl.share },
      rows: { text: String(sl.rowIndexes.length), sort: sl.rowIndexes.length },
    })),
    notes: [`Shares use the sum of non-negative slices (${formatExact(total)}) as the denominator; hiding a slice does not change it.`],
  };
  const top = [...slices].filter((x) => x.share !== null).sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
  return {
    kind: "donut",
    ...envelopeBase(ctx, valCol),
    state,
    stateMessage,
    legend,
    issues: ctx.issues,
    adaptations: ctx.adaptations,
    conflicts: ctx.conflicts,
    table,
    summary: state === "ready" ? `Donut chart with ${slices.length} slices totalling ${fmt.format(total)}.${top ? ` Largest: ${top.identity.label}, ${formatShare(top.share!)}.` : ""}` : stateMessage ?? "",
    reads: [...s.reads],
    slices,
    total,
    innerRatio,
    labelFormat,
    centerText: innerRatio >= 0.3 && state === "ready" ? { value: fmt.format(total), label: valCol ? ctx.label(valCol) : "Total" } : null,
    excluded,
    format: fmt,
  };
}

/* ---------------- Polar wind rose ---------------- */

const COMPASS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const COMPASS_NAMES: Record<string, string> = { NORTH: "N", EAST: "E", SOUTH: "S", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW" };

export function directionAngle(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const p = parseNumber(raw as string | number);
  if (p.status === "ok") return ((p.value % 360) + 360) % 360;
  const label = String(raw).trim().toUpperCase().replace(/[\s-]/g, "");
  const key = COMPASS_NAMES[label] ?? label;
  const i = COMPASS16.indexOf(key);
  return i >= 0 ? i * 22.5 : null;
}

export function derivePolar(ctx: DeriveContext): PolarModel {
  const s = ctx.s;
  const dirCol = ctx.col("Direction");
  const speedCol = ctx.col("Wind speed");
  const bandCol = ctx.col("Band");
  const freqCol = ctx.measure("Frequency");
  const missing = ctx.missingRequired();
  const rows = missing.length ? [] : ctx.rows;
  // Resolution: 8 sectors when every label is a cardinal/intercardinal; else 16.
  const angles = rows.map((r) => directionAngle(r[dirCol]));
  const unknownDir = angles.filter((a) => a === null).length;
  if (unknownDir) ctx.issue("polar-direction", "warning", `${unknownDir} row${unknownDir === 1 ? " has" : "s have"} a direction that is not a compass label or degree value and ${unknownDir === 1 ? "is" : "are"} not plotted.`, ["Mapping::Direction"]);
  const sectors = angles.every((a) => a === null || a % 45 === 0) ? 8 : 16;
  const step = 360 / sectors;
  const labels = sectors === 8 ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] : COMPASS16;
  const sectorOf = (a: number) => Math.round(a / step) % sectors;
  // Bands
  const speeds = rows.map((r) => parseNumber(r[speedCol]).value);
  let bandKeys: string[];
  let bandOf: (i: number) => string | null;
  if (bandCol) {
    bandKeys = firstAppearance(rows.map((r) => cellText(r[bandCol]).trim() || NO_VALUE));
    bandOf = (i) => cellText(rows[i][bandCol]).trim() || NO_VALUE;
  } else {
    const valid = speeds.filter((v): v is number => v !== null);
    const max = valid.length ? Math.max(...valid) : 0;
    const width = max <= 0 ? 1 : niceStep(max / 4);
    const edges = [0, width, width * 2, width * 3];
    bandKeys = edges.map((e, i) => (i === edges.length - 1 ? `≥ ${e}` : `${e}–${edges[i + 1]}`));
    bandOf = (i) => {
      const v = speeds[i];
      if (v === null) return null;
      const k = Math.min(edges.length - 1, Math.max(0, Math.floor(v / width)));
      return bandKeys[k];
    };
  }
  const noSpeed = speeds.filter((v) => v === null).length;
  if (noSpeed && !bandCol) ctx.issue("polar-speed", "info", `${noSpeed} row${noSpeed === 1 ? " has" : "s have"} no wind speed and ${noSpeed === 1 ? "is" : "are"} not assigned to a band.`, ["Mapping::Wind speed"]);
  const mode = s.has("Colors", "Palette") ? s.palette() : null;
  const bandIds = assignIdentities(bandKeys, null, seriesColors(mode, bandKeys).colors);
  const cells = new Map<string, number>();
  let counted = 0;
  rows.forEach((r, i) => {
    const a = angles[i];
    const b = bandOf(i);
    if (a === null || b === null) return;
    const f = freqCol ? parseNumber(r[freqCol]).value : 1;
    if (f === null) return;
    const key = `${sectorOf(a)}|${b}`;
    cells.set(key, (cells.get(key) ?? 0) + f);
    counted++;
  });
  const bins: PolarBin[] = labels.map((direction, si) => {
    const bands = bandIds.map((identity) => ({ band: identity.key, value: cells.get(`${si}|${identity.key}`) ?? 0, identity }));
    return { direction, angle: si * step, bands, total: bands.reduce((a, b) => a + b.value, 0) };
  });
  const maxTotal = Math.max(0, ...bins.map((b) => b.total));
  const fmt = ctx.formatter();
  let state: PolarModel["state"] = "ready";
  let stateMessage: string | undefined;
  if (missing.length) {
    state = "missing-mapping";
    stateMessage = `Map ${missing.join(" and ")} to draw this chart.`;
  } else if (!ctx.rows.length) {
    state = "empty";
    stateMessage = "The data source returned no rows.";
  } else if (!counted) {
    state = "all-null";
    stateMessage = "No row has both a readable direction and a wind speed or band.";
  } else if (maxTotal === 0) {
    state = "all-zero";
    stateMessage = "Every frequency is zero.";
  }
  const grand = bins.reduce((a, b) => a + b.total, 0);
  const legend = legendFor(
    ctx,
    bandIds.map((id) => ({ id: id.id, label: id.label, color: id.color, stat: bins.reduce((a, b) => a + (b.bands.find((x) => x.band === id.key)?.value ?? 0), 0) })),
    { statLabel: freqCol ? "Total frequency" : "Rows", additive: true, format: fmt },
  );
  const peak = [...bins].sort((a, b) => b.total - a.total)[0];
  return {
    kind: "polar",
    ...envelopeBase(ctx, speedCol),
    state,
    stateMessage,
    legend,
    issues: ctx.issues,
    adaptations: ctx.adaptations,
    conflicts: ctx.conflicts,
    table: {
      caption: `${ctx.input.title || ctx.asset.label} data`,
      columns: [{ key: "direction", label: "Direction (from)" }, ...bandIds.map((b) => ({ key: b.id, label: b.label, numeric: true })), { key: "total", label: "Total", numeric: true }],
      rows: bins.map((b, i) => ({
        direction: { text: `${b.direction} (${b.angle}°)`, sort: i },
        ...Object.fromEntries(b.bands.map((x) => [x.identity.id, { text: formatExact(x.value), sort: x.value }])),
        total: { text: formatExact(b.total), sort: b.total },
      })),
      notes: [
        "Directions are where the wind blows from, clockwise from north (0°).",
        `Rows are binned into ${sectors} sectors of ${step}° centred on each compass point.`,
        freqCol ? `Bar length is the sum of ${ctx.label(freqCol)}.` : "Frequency is unmapped, so each row counts as 1.",
      ],
    },
    summary: state === "ready" ? `Wind rose with ${sectors} directions and ${bandIds.length} bands; ${fmt.format(grand)} total. Most frequent: ${peak.direction}.` : stateMessage ?? "",
    reads: [...s.reads],
    bins,
    bands: bandIds,
    maxTotal,
    rings: Math.max(1, Math.min(12, Math.round(s.num("Colors", "Ring count") ?? 5))),
    style: {
      gridColor: s.explicitColor("Colors", "Grid color"),
      spokeColor: s.explicitColor("Colors", "Spoke color"),
      showDirections: s.bool("Colors", "Show direction labels", true),
      showRings: s.bool("Colors", "Show concentric rings", true),
      showValues: s.bool("Colors", "Show value labels", true),
      ringStroke: s.slider("Colors", "Ring stroke width", 0.55),
      spokeStroke: s.slider("Colors", "Spoke stroke width", 0.5),
      innerRatio: s.slider("Colors", "Inner circle ratio", 0.36),
      innerHole: s.num("Colors", "Inner hole radius") ?? 20,
      outerRatio: s.slider("Colors", "Outer radius ratio", 0.4),
      directionColor: s.explicitColor("Colors", "Direction label color"),
      valueColor: s.explicitColor("Colors", "Value label color"),
    },
    format: fmt,
    convention: "Meteorological: direction the wind comes from, 0° = north, clockwise.",
  };
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/* ---------------- Sankey ---------------- */

export function deriveSankey(ctx: DeriveContext): SankeyModel {
  const s = ctx.s;
  const stageCount = Math.max(2, Math.min(8, Number(s.str("Mapping", "Number of stages") || "2")));
  const stageFields = ["Source", ...Array.from({ length: stageCount - 2 }, (_, i) => `Stage ${i + 2}`), "Target"];
  const stageCols = stageFields.map((f) => ctx.col(f));
  const valCol = ctx.col("Value");
  const missing = ctx.missingRequired((o) => ctx.aggregation === "count" && o.name === "Value");
  const linkVals = new Map<string, { vals: (number | null)[]; rows: number[] }>();
  let skippedValue = 0;
  let skippedBlank = 0;
  if (!missing.length) {
    ctx.rows.forEach((r, i) => {
      const v = ctx.aggregation === "count" ? 1 : parseNumber(r[valCol]).value;
      if (v === null) {
        skippedValue++;
        return;
      }
      for (let k = 0; k < stageCols.length - 1; k++) {
        const a = cellText(r[stageCols[k]]).trim();
        const b = cellText(r[stageCols[k + 1]]).trim();
        if (!a || !b) {
          skippedBlank++;
          continue;
        }
        const key = `${k}:${a}\u0000${k + 1}:${b}`;
        if (!linkVals.has(key)) linkVals.set(key, { vals: [], rows: [] });
        linkVals.get(key)!.vals.push(v);
        linkVals.get(key)!.rows.push(i);
      }
    });
  }
  const mode: AggregationMode = ctx.aggregation === "raw" ? "sum" : ctx.aggregation;
  if (ctx.aggregation === "raw" && [...linkVals.values()].some((l) => l.vals.length > 1)) {
    ctx.adapt({ id: "sankey-raw-sum", setting: "Mapping::Aggregation", requested: "None (raw value)", effective: "Sum", reason: "Rows that share a link are added together; link width is additive by definition." });
  }
  const dropped: SankeyModel["dropped"] = [];
  const links: SankeyLinkModel[] = [];
  let nonPositive = 0;
  for (const [key, l] of linkVals) {
    const [src, tgt] = key.split("\u0000");
    const v = aggregate(l.vals, mode, l.rows.length);
    if (v === null || v <= 0) {
      nonPositive++;
      continue;
    }
    links.push({ source: src, target: tgt, value: v, rowIndexes: l.rows });
  }
  if (skippedValue) dropped.push({ reason: "Rows without a numeric value", count: skippedValue });
  if (skippedBlank) dropped.push({ reason: "Steps with a blank stage", count: skippedBlank });
  if (nonPositive) dropped.push({ reason: "Links with zero or negative totals", count: nonPositive });
  for (const d of dropped) ctx.issue(`sankey-drop:${d.reason}`, "info", `${d.count} ${d.reason.toLowerCase()} ${d.count === 1 ? "is" : "are"} not drawn.`);
  const nodeIds = firstAppearance(links.flatMap((l) => [l.source, l.target]));
  const stageOf = (id: string) => Number(id.split(":")[0]);
  const labelOf = (id: string) => id.slice(id.indexOf(":") + 1);
  const firstStage = nodeIds.filter((id) => stageOf(id) === 0);
  const pm = s.has("Colors", "Palette") ? s.palette() : null;
  const sourceColors = seriesColors(pm, firstStage.map(labelOf));
  const others = nodeIds.filter((id) => stageOf(id) !== 0);
  // Colour encodes the first-stage category (the legend); downstream nodes share one neutral mark colour.
  const identities = assignIdentities(
    [...firstStage, ...others],
    Object.fromEntries(nodeIds.map((id) => [id, labelOf(id)])),
    [...sourceColors.colors, ...others.map(() => NEUTRAL_MARK)],
  );
  const nodes: SankeyNodeModel[] = identities.map((identity) => {
    const inflow = links.filter((l) => l.target === identity.key).reduce((a, l) => a + l.value, 0);
    const outflow = links.filter((l) => l.source === identity.key).reduce((a, l) => a + l.value, 0);
    return { id: identity.key, label: identity.label, stage: stageOf(identity.key), identity, value: Math.max(inflow, outflow) };
  });
  const fmt = ctx.formatter();
  let state: SankeyModel["state"] = "ready";
  let stateMessage: string | undefined;
  if (missing.length) {
    state = "missing-mapping";
    stateMessage = `Map ${missing.join(", ")} to draw this chart.`;
  } else if (!ctx.rows.length) {
    state = "empty";
    stateMessage = "The data source returned no rows.";
  } else if (!links.length) {
    state = "all-null";
    stateMessage = "No row produced a positive flow between stages.";
  }
  const legend = legendFor(
    ctx,
    nodes.filter((n) => n.stage === 0).map((n) => ({ id: n.identity.id, label: n.label, color: n.identity.color, stat: n.value })),
    { statLabel: "Outflow", additive: isAdditive(mode), format: fmt },
  );
  const total = nodes.filter((n) => n.stage === 0).reduce((a, n) => a + n.value, 0);
  return {
    kind: "sankey",
    ...envelopeBase(ctx, valCol),
    state,
    stateMessage,
    legend,
    issues: ctx.issues,
    adaptations: ctx.adaptations,
    conflicts: ctx.conflicts,
    table: {
      caption: `${ctx.input.title || ctx.asset.label} flows`,
      columns: [
        { key: "from", label: "From" },
        { key: "to", label: "To" },
        { key: "step", label: "Step", numeric: true },
        { key: "value", label: valCol ? ctx.label(valCol) : "Value", numeric: true },
      ],
      rows: links.map((l) => ({
        from: { text: labelOf(l.source), sort: labelOf(l.source) },
        to: { text: labelOf(l.target), sort: labelOf(l.target) },
        step: { text: `${stageOf(l.source) + 1} → ${stageOf(l.target) + 1}`, sort: stageOf(l.source) },
        value: { text: formatExact(l.value), sort: l.value },
      })),
      notes: ["The same label in different stages is a different node, so flows cannot form cycles.", ...dropped.map((d) => `${d.count} ${d.reason.toLowerCase()} not drawn.`)],
    },
    summary: state === "ready" ? `Sankey diagram with ${stageCount} stages, ${nodes.length} nodes and ${links.length} flows; ${fmt.format(total)} leaves the first stage.` : stateMessage ?? "",
    reads: [...s.reads],
    stages: stageFields.map((f, i) => (stageCols[i] ? ctx.label(stageCols[i]) : f)),
    nodes,
    links,
    style: {
      nodeWidth: s.slider("Sankey", "Node width", 14),
      nodeGap: s.slider("Sankey", "Node gap", 12),
      linkOpacity: s.slider("Sankey", "Link opacity", 55) / 100,
      curvature: s.slider("Sankey", "Link curvature", 55) / 100,
      showLabels: s.bool("Sankey", "Show node labels", true),
    },
    format: fmt,
    dropped,
  };
}
