import type { MouseEvent as ReactMouseEvent } from "react";
import type { PreviewSeries } from "./componentPreviewProfiles";
import HeatmapPreview from "./HeatmapPreview";
import WaterSurfacesPreview from "./WaterSurfacesPreview";
import { valueFade } from "./heatmapSettings";
import { getPhosphorIcon } from "./phosphorIconCatalog";
import {
  BRAND,
  PALETTE,
  asColorMode,
  asRecord,
  asRepeatable,
  asZoomScaling,
  resolveColorMode,
  sampleZoomScale,
  sliderMapped,
  valueOpacityAt,
} from "./previewTheme";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

const W = 240;
const H = 150;
const P = 16;

const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

function mapPalette(cfg: Cfg) {
  return asColorMode(cfg("Color", "Palette", cfg("Color", "Solid color", BRAND)));
}

function colorsByType(cfg: Cfg): boolean {
  return str(cfg("Color", "Color Source", "Value"), "Value") === "Type";
}

function mapColor(cfg: Cfg, value: number, max: number, category: string, index: number): string {
  const mode = mapPalette(cfg);
  const t = max ? value / max : 0;
  const dist = str(cfg("Color", "Distribution", "Linear"), "Linear");
  const stepped = dist === "Quantize" ? Math.round(t * 4) / 4 : dist === "Quantile" ? Math.ceil(t * 3) / 3 : t;
  if (mode.style !== "Single") {
    return resolveColorMode(
      mode,
      stepped,
      index,
      category,
      mode.categoryLabels.length,
    );
  }
  if (colorsByType(cfg)) {
    const catMap = asRecord(cfg("Color", "Categorical color stops + Other", {}));
    if (category && catMap[category]) return catMap[category];
    return resolveColorMode(mode, 0, index, category, mode.categoryLabels.length);
  }
  return resolveColorMode(
    mode,
    stepped,
    index,
    category,
    mode.categoryLabels.length,
  );
}

function catColor(cfg: Cfg, category: string, fallback: string, index: number) {
  if (mapPalette(cfg).style !== "Single") return fallback;
  if (!colorsByType(cfg)) return fallback;
  const map = {
    ...asRecord(cfg("Color", "Categorical color stops + Other", {})),
    ...asRecord(cfg("Marker Shape", "Icon category field + mapping", {})),
  };
  if (category && map[category]) return map[category];
  return PALETTE(fallback)[index % 6];
}

type Props = {
  cfg: Cfg;
  visualId: string;
  series?: PreviewSeries;
  compact?: boolean;
  onMarkEnter?: (index: number, e: ReactMouseEvent) => void;
  onMarkLeave?: () => void;
};

function markHit(
  index: number,
  onMarkEnter?: (index: number, e: ReactMouseEvent) => void,
  onMarkLeave?: () => void,
) {
  if (!onMarkEnter) return {};
  return {
    style: { cursor: "pointer" as const },
    onMouseEnter: (e: ReactMouseEvent) => onMarkEnter(index, e),
    onMouseMove: (e: ReactMouseEvent) => onMarkEnter(index, e),
    onMouseLeave: () => onMarkLeave?.(),
  };
}

function Ground({ cfg }: { cfg: Cfg }) {
  const show = bool(cfg("Ground disc", "Show ground disc", true), true);
  if (!show) return <ellipse cx={W / 2} cy={H - 22} rx={92} ry={10} fill="rgba(255,255,255,.06)" />;
  const fill = str(cfg("Ground disc", "Fill style", "Solid"), "Solid");
  const color = str(cfg("Ground disc", "Disc color", BRAND), BRAND);
  const r = sliderMapped(cfg("Ground disc", "Disc radius multiplier", 30), 0.2, 4, 1.2);
  const op = sliderMapped(cfg("Ground disc", "Disc fill opacity", 18), 0, 1, 0.18);
  return (
    <ellipse
      cx={W / 2}
      cy={H - 22}
      rx={86 * r}
      ry={10 * r}
      fill={fill === "None" ? "none" : color}
      stroke={color}
      strokeWidth={fill === "None" ? 1.5 : 0}
      opacity={fill === "None" ? 0.7 : op}
    />
  );
}

function MarkerIcon({ name, color, size }: { name: string; color: string; size: number }) {
  const Icon = getPhosphorIcon(name);
  const props = { size, color, weight: "fill" as const };
  return <Icon {...props} />;
}

export default function MapPreview({ cfg, visualId, series, compact, onMarkEnter, onMarkLeave }: Props) {
  const points = series?.mapPoints ?? [];
  const arcs = series?.mapArcs ?? [];
  const max = Math.max(...points.map((p) => p.value), 1);
  const solid = mapPalette(cfg).color;
  const showLegend = !compact && bool(cfg("Map Legend", "Show legend in Map Data", true), true);
  const lod = sliderMapped(cfg("Advanced", "Level of distance (zoom visibility)", 0), 0, 100, 0);
  const visible = lod <= 0 ? points : points.filter((_, i) => i % Math.max(1, Math.round(lod / 25 + 1)) === 0);
  const highlight = bool(cfg("Advanced", "Highlight borders", false), false);
  const hit = (index: number) => markHit(index, onMarkEnter, onMarkLeave);
  const orig = (p: (typeof points)[number]) => Math.max(0, points.findIndex((pt) => pt.id === p.id));
  const legacyZoom =
    visualId === "fences"
      ? cfg("Zoom Scaling", "Fence zoom scaling", cfg("Advanced", "Fence zoom scaling", undefined))
      : visualId === "pillars"
        ? cfg("Size", "Zoom scaling", undefined)
        : visualId === "discs"
          ? cfg("Disc Scaling", "Disc scaling", undefined)
          : undefined;
  const zoomScaling = asZoomScaling(cfg("Zoom Scaling", "Zoom scaling", legacyZoom));
  const zoomScale = sampleZoomScale(zoomScaling, 350);
  const zoomFactor = Math.max(0.5, Math.min(2, 1 + zoomScale * 0.025));
  const fade =
    visualId === "heatmap" || visualId === "water-surfaces" ? null : valueFade(cfg);
  const faded = (base: number, value: number) =>
    fade ? base * (valueOpacityAt(max ? value / max : 0, fade) / 100) : base;

  let layer: React.ReactNode = null;

  if (visualId === "arcs") {
    const stroke = sliderMapped(cfg("Color", "Border Thickness", 40), 0, 10, 3);
    const ends = bool(cfg("Disc ring", "Show endpoint discs", false), false);
    const indicator = bool(cfg("Line Customization", "Source → Destination Indicator", false), false);
    const endScale = sliderMapped(cfg("Disc ring", "Endpoint disc scaling", 30), 0.2, 4, 1.2);
    const endR = 6 * endScale + zoomScale * 0.1;
    layer = (
      <>
        <Ground cfg={cfg} />
        {arcs.map((a, i) => {
          const from = points.find((p) => p.label === a.from) ?? points[i];
          const to = points.find((p) => p.label === a.to) ?? points[(i + 1) % Math.max(points.length, 1)];
          if (!from || !to) return null;
          const x1 = P + from.x * (W - 2 * P);
          const y1 = P + from.y * (H - 2 * P);
          const x2 = P + to.x * (W - 2 * P);
          const y2 = P + to.y * (H - 2 * P);
          const color = mapColor(cfg, a.value, max, from.category, i);
          const d = `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 28} ${x2} ${y2}`;
          const sw = Math.max(1, stroke + zoomScale * 0.15);
          return (
            <g key={i} {...hit(orig(from))}>
              <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" opacity={faded(1, a.value)} />
              {indicator && (
                <path
                  className="map-arc-shimmer"
                  d={d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={Math.max(1.5, sw * 0.7)}
                  strokeLinecap="round"
                  strokeDasharray="14 72"
                  opacity="0.85"
                />
              )}
              {ends && (
                <>
                  <circle cx={x1} cy={y1} r={endR} fill={color} opacity={0.85} />
                  <circle cx={x2} cy={y2} r={endR} fill={color} opacity={0.85} />
                </>
              )}
            </g>
          );
        })}
      </>
    );
  } else if (visualId === "fences") {
    const exaggerate = bool(cfg("Height", "Height Exaggeration", false), false);
    const h = sliderMapped(cfg("Height", "Fence height", 40), 0, 5000, 2000);
    const width = (exaggerate ? 10 : 6) + h / 900 + zoomScale * 0.35;
    const d = visible
      .map((p, i) => `${i ? "L" : "M"} ${P + p.x * (W - 2 * P)} ${P + p.y * (H - 2 * P)}`)
      .join(" ");
    const fenceColor = mapColor(
      cfg,
      visible.reduce((sum, point) => sum + point.value, 0) /
        Math.max(visible.length, 1),
      max,
      visible[0]?.category ?? "",
      0,
    );
    layer = (
      <>
        <Ground cfg={cfg} />
        <path d={d} fill="none" stroke={fenceColor} strokeWidth={width} strokeLinecap="round" opacity={faded(0.85, visible.reduce((sum, point) => sum + point.value, 0) / Math.max(visible.length, 1))} />
        {visible.map((p) => (
          <circle
            key={p.id}
            cx={P + p.x * (W - 2 * P)}
            cy={P + p.y * (H - 2 * P)}
            r={Math.max(8, width / 2)}
            fill="transparent"
            {...hit(orig(p))}
          />
        ))}
      </>
    );
  } else if (visualId === "pillars") {
    const maxH = sliderMapped(cfg("Size", "Max Height", 38), 0, 8000, 3000);
    const normalize = bool(cfg("Color", "Normalize values", true), true);
    const peak = normalize ? max : Math.max(max, 80);
    layer = (
      <>
        <Ground cfg={cfg} />
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const bh = (p.value / peak) * (28 + maxH / 220 + zoomScale * 0.4);
          const color = mapColor(cfg, p.value, max, p.category, i);
          return <rect key={p.id} x={x - 7} y={H - 32 - bh} width={14} height={bh} rx={3} fill={color} opacity={faded(0.86, p.value)} {...hit(orig(p))} />;
        })}
      </>
    );
  } else if (visualId === "discs") {
    const mult = sliderMapped(
      cfg("Disc Scaling", "Disc radius multiplier", cfg("Disc ring", "Disc radius multiplier", 30)),
      0.2,
      4,
      1.2,
    );
    layer = (
      <>
        <Ground cfg={cfg} />
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const y = P + p.y * (H - 2 * P);
          const r = (6 + (p.value / max) * 16 + zoomScale * 0.35) * mult;
          const color = mapColor(cfg, p.value, max, p.category, i);
          return (
            <ellipse
              key={p.id}
              cx={x}
              cy={y}
              rx={r}
              ry={r * 0.38}
              fill={color}
              stroke={color}
              opacity={faded(0.7, p.value)}
              {...hit(orig(p))}
            />
          );
        })}
      </>
    );
  } else if (visualId === "map-area") {
    const extrusion = str(cfg("Extrusion", "Extrusion mode", "None"), "None");
    const extScaleRaw = Number(cfg("Extrusion", "Extrusion scaling", 50));
    const extScale = Number.isFinite(extScaleRaw) ? Math.max(0, Math.min(100, extScaleRaw)) : 50;
    const dataRange = asZoomScaling(cfg("Extrusion", "Data range", undefined));
    layer = (
      <>
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const y = P + p.y * (H - 2 * P);
          const halfWidth = 28 * zoomFactor;
          const topHeight = 18 * zoomFactor;
          const bottomHeight = 16 * zoomFactor;
          const lift =
            extrusion === "None"
              ? 0
              : extrusion === "Fixed height" || extrusion === "Height"
                ? 4 + (extScale / 100) * 20
                : 4 + sampleZoomScale(dataRange, p.value) * 0.8;
          const color = catColor(cfg, p.category, mapColor(cfg, p.value, max, p.category, i), i);
          return (
            <polygon
              key={p.id}
              points={`${x},${y - topHeight - lift} ${x + halfWidth},${y - lift} ${x},${y + bottomHeight - lift} ${x - halfWidth},${y - lift}`}
              fill={color}
              stroke={highlight ? "#fff" : "none"}
              strokeWidth={highlight ? 1.5 : 0}
              opacity={faded(0.45, p.value)}
              {...hit(orig(p))}
            />
          );
        })}
      </>
    );
  } else if (visualId === "heatmap") {
    layer = (
      <HeatmapPreview
        cfg={cfg}
        points={visible}
        width={W}
        height={H}
        pad={P}
        zoomFactor={zoomFactor}
        hit={(i) => hit(orig(visible[i]))}
      />
    );
  } else if (visualId === "water-surfaces") {
    layer = (
      <WaterSurfacesPreview
        cfg={cfg}
        points={visible}
        width={W}
        height={H}
        pad={P}
        hit={(i) => hit(orig(visible[i]))}
      />
    );
  } else if (visualId === "wind") {
    const density = sliderMapped(cfg("Animation", "Particle Density", 50), 2000, 32000, 16384);
    const trail = sliderMapped(cfg("Animation", "Trail Length", 50), 0.9, 1, 0.996);
    const speed = sliderMapped(cfg("Animation", "Animation Speed", 50), 0.05, 0.6, 0.2);
    const count = Math.max(8, Math.round(density / 1400));
    layer = (
      <>
        <Ground cfg={cfg} />
        {Array.from({ length: count }).map((_, i) => {
          const p = visible[i % Math.max(visible.length, 1)];
          const x = P + (p?.x ?? 0.2 + (i % 5) * 0.15) * (W - 2 * P);
          const y = P + (p?.y ?? 0.3) * (H - 2 * P) + (i % 4) * 6;
          const len = 10 + trail * 28 + zoomScale * 0.8;
          const color = mapColor(cfg, p?.value ?? 1, max, p?.category ?? "", i);
          return (
            <line
              key={i}
              className="cp-wind-particle"
              x1={x}
              y1={y}
              x2={x + len}
              y2={y - 6}
              stroke={color}
              strokeWidth={1.2 + zoomScale * 0.04}
              opacity={faded(1, p?.value ?? 1)}
              strokeLinecap="round"
              {...(p ? hit(orig(p)) : {})}
              style={{
                cursor: p ? "pointer" : undefined,
                animationDuration: `${1.6 / Math.max(speed, 0.05)}s`,
                animationDelay: `${(i % 7) * 0.12}s`,
              }}
            />
          );
        })}
      </>
    );
  } else {
    const size = sliderMapped(cfg("Marker appearance", "Point Size", 30), 0.2, 8, 1.2);
    const kind = str(cfg("Marker Shape", "Marker type", "2D"), "2D");
    const shape2d = str(cfg("Marker Shape", "2D shape", "Circle"), "Circle");
    const shape3d = str(cfg("Marker Shape", "3D shape", "Sphere"), "Sphere");
    const empty = bool(cfg("Marker Shape", "Empty filled shape (no icon)", false), false);
    const iconMode = str(cfg("Marker Shape", "Icon mode", "Static"), "Static");
    const icon = str(
      cfg("Marker Shape", "Icons", cfg("Marker Shape", "Static Phosphor icon", "MapPin")),
      "MapPin",
    );
    const sizeRows = asRepeatable(cfg("Marker appearance", "Marker size by data", undefined));
    layer = (
      <>
        <Ground cfg={cfg} />
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const y = P + p.y * (H - 2 * P);
          const r = (4 + size * 2 + (p.value / max) * (2 + sizeRows.length) + zoomScale * 0.3);
          const color = catColor(cfg, p.category, mapColor(cfg, p.value, max, p.category, i), i);
          const shape = kind === "3D" ? shape3d : shape2d;
          return (
            <g key={p.id} transform={`translate(${x} ${y})`} {...hit(orig(p))}>
              {shape === "Square" || shape === "Cube" ? (
                <rect x={-r} y={-r - (kind === "3D" ? 3 : 0)} width={r * 2} height={r * 2} rx={1} fill={empty ? "none" : color} stroke={color} opacity={faded(1, p.value)} />
              ) : shape === "Diamond" || shape === "Cone" ? (
                <polygon points={`0,${-r - 2} ${r},${r} ${-r},${r}`} fill={empty ? "none" : color} stroke={color} opacity={faded(1, p.value)} />
              ) : (
                <circle cx={0} cy={0} r={r} fill={empty ? "none" : color} stroke={color} opacity={faded(kind === "3D" ? 0.95 : 0.88, p.value)} />
              )}
              {kind === "3D" && shape === "Sphere" && <circle cx={-r * 0.3} cy={-r * 0.3} r={r * 0.25} fill="#fff" opacity={0.35} />}
              {!empty && iconMode !== "By category" && (
                <foreignObject x={-7} y={-18} width={14} height={14}>
                  <MarkerIcon name={icon} color={color} size={12} />
                </foreignObject>
              )}
            </g>
          );
        })}
      </>
    );
  }

  return (
    <>
      {layer}
      {showLegend && (
        <g>
          <rect x={P} y={H - 12} width={9} height={9} rx={2} fill={solid} />
          <text x={P + 13} y={H - 4} fill="rgba(255,255,255,.55)" fontSize="8">
            {series?.legend ?? "Value"}
          </text>
        </g>
      )}
    </>
  );
}
