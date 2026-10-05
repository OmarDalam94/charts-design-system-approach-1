import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { PreviewSeries } from "./componentPreviewProfiles";
import {
  heatmapColorAt,
  heatmapSettings,
  luminance,
  resolvedHeatmapPalette,
  type HeatmapSettings,
} from "./heatmapSettings";
import { mixHex } from "./previewTheme";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;
type MapPoint = NonNullable<PreviewSeries["mapPoints"]>[number];

type Props = {
  cfg: Cfg;
  points: MapPoint[];
  width: number;
  height: number;
  pad: number;
  zoomFactor: number;
  hit: (index: number) => {
    style?: { cursor: "pointer" };
    onMouseEnter?: (e: ReactMouseEvent) => void;
    onMouseMove?: (e: ReactMouseEvent) => void;
    onMouseLeave?: () => void;
  };
};

/** Kernel width in normalized map units. */
const SIGMA = 0.13;
const PRESENCE_MIN = 0.08;

type Field = {
  cols: number;
  rows: number;
  /** Real value per cell, NaN where there is no data. */
  value: Float64Array;
  nearest: Int32Array;
};

function buildField(points: MapPoint[], cols: number, rows: number, s: HeatmapSettings, blurCells: number): Field {
  const num = new Float64Array(cols * rows);
  const den = new Float64Array(cols * rows);
  const nearest = new Int32Array(cols * rows);
  const counting = s.rowsRepresent === "count";
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = (i + 0.5) / cols;
      const y = (j + 0.5) / rows;
      let n = 0;
      let d = 0;
      let best = 0;
      let bestD = Infinity;
      points.forEach((p, k) => {
        const dist = Math.hypot(p.x - x, p.y - y);
        const w = Math.exp(-((dist / SIGMA) ** 2));
        n += w * (counting ? 1 : p.value);
        d += w;
        if (dist < bestD) {
          bestD = dist;
          best = k;
        }
      });
      num[j * cols + i] = n;
      den[j * cols + i] = d;
      nearest[j * cols + i] = best;
    }
  }
  const sigma = blurCells * 0.55;
  const bn = sigma > 0.05 ? gaussianBlur(num, cols, rows, sigma) : num;
  const bd = sigma > 0.05 ? gaussianBlur(den, cols, rows, sigma) : den;
  const value = new Float64Array(cols * rows);
  let maxCount = 0;
  if (counting) for (let k = 0; k < bn.length; k += 1) maxCount = Math.max(maxCount, bn[k]);
  for (let k = 0; k < value.length; k += 1) {
    if (bd[k] < PRESENCE_MIN) value[k] = NaN;
    else value[k] = counting ? bn[k] / (maxCount || 1) : bn[k] / bd[k];
  }
  return { cols, rows, value, nearest };
}

function gaussianBlur(src: Float64Array, cols: number, rows: number, sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((a, b) => a + b, 0);
  const k = kernel.map((v) => v / sum);
  const pass = (input: Float64Array, horizontal: boolean) => {
    const out = new Float64Array(input.length);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        let acc = 0;
        for (let o = -radius; o <= radius; o += 1) {
          const ii = horizontal ? Math.min(cols - 1, Math.max(0, i + o)) : i;
          const jj = horizontal ? j : Math.min(rows - 1, Math.max(0, j + o));
          acc += input[jj * cols + ii] * k[o + radius];
        }
        out[j * cols + i] = acc;
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/** One pattern glyph centred on a lattice point; strokes join neighbours into continuous lines. */
function patternGlyph(key: string, kind: HeatmapSettings["fill"], x: number, y: number, spacing: number, width: number, color: string, opacity: number): ReactNode {
  const h = spacing / 2;
  const common = { stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: "butt" as const };
  switch (kind) {
    case "Diagonal":
      return <line key={key} x1={x - h} y1={y + h} x2={x + h} y2={y - h} {...common} />;
    case "Plus":
      return (
        <g key={key}>
          <line x1={x - h} y1={y} x2={x + h} y2={y} {...common} />
          <line x1={x} y1={y - h} x2={x} y2={y + h} {...common} />
        </g>
      );
    case "X":
      return (
        <g key={key}>
          <line x1={x - h * 0.7} y1={y - h * 0.7} x2={x + h * 0.7} y2={y + h * 0.7} {...common} />
          <line x1={x - h * 0.7} y1={y + h * 0.7} x2={x + h * 0.7} y2={y - h * 0.7} {...common} />
        </g>
      );
    case "Circle":
      return <circle key={key} cx={x} cy={y} r={spacing * 0.32} fill="none" {...common} />;
    case "Dot":
      return <circle key={key} cx={x} cy={y} r={width} fill={color} fillOpacity={opacity} />;
    default:
      return null;
  }
}

function contourLevels(lo: number, hi: number, s: HeatmapSettings): { value: number; bold: boolean }[] {
  const out: { value: number; bold: boolean }[] = [];
  if (!(hi > lo)) return out;
  if (s.contours.spacing === "log") {
    const start = Math.floor(Math.log10(Math.max(Math.abs(lo), 1e-6)));
    const end = Math.ceil(Math.log10(Math.max(Math.abs(hi), 1e-6)));
    for (let d = start; d <= end; d += 1) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** d;
        if (v > lo && v < hi) out.push({ value: v, bold: m === 1 });
      }
    }
  } else {
    const step = Math.max(s.contours.step, 1e-6);
    for (let v = Math.ceil(lo / step) * step; v < hi && out.length < 60; v += step) {
      if (v <= lo) continue;
      const n = Math.round(v / step);
      out.push({ value: v, bold: s.contours.majorEvery > 0 && n % s.contours.majorEvery === 0 });
    }
  }
  return out.slice(0, 40);
}

/** Marching squares over cell centres; returns an SVG path for one level. */
function contourPath(f: Field, level: number, cw: number, ch: number, ox: number, oy: number, lift: (k: number) => number): string {
  const parts: string[] = [];
  const at = (i: number, j: number) => f.value[j * f.cols + i];
  for (let j = 0; j < f.rows - 1; j += 1) {
    for (let i = 0; i < f.cols - 1; i += 1) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      if ([a, b, c, d].some((v) => Number.isNaN(v))) continue;
      const corners: [number, number, number, number][] = [
        [i, j, a, j * f.cols + i],
        [i + 1, j, b, j * f.cols + i + 1],
        [i + 1, j + 1, c, (j + 1) * f.cols + i + 1],
        [i, j + 1, d, (j + 1) * f.cols + i],
      ];
      const pts: [number, number][] = [];
      for (let e = 0; e < 4; e += 1) {
        const [x1, y1, v1, k1] = corners[e];
        const [x2, y2, v2, k2] = corners[(e + 1) % 4];
        if ((v1 < level) === (v2 < level)) continue;
        const u = (level - v1) / (v2 - v1);
        const gx = x1 + (x2 - x1) * u;
        const gy = y1 + (y2 - y1) * u;
        const h = lift(k1) + (lift(k2) - lift(k1)) * u;
        pts.push([ox + (gx + 0.5) * cw, oy + (gy + 0.5) * ch - h]);
      }
      for (let p = 0; p + 1 < pts.length; p += 2) {
        parts.push(`M${pts[p][0].toFixed(1)} ${pts[p][1].toFixed(1)}L${pts[p + 1][0].toFixed(1)} ${pts[p + 1][1].toFixed(1)}`);
      }
    }
  }
  return parts.join("");
}

export default function HeatmapPreview({ cfg, points, width, height, pad, zoomFactor, hit }: Props) {
  if (!points.length) return null;
  const settings = heatmapSettings(cfg);
  const values = points.map((p) => p.value);
  const s = {
    ...settings,
    palette: resolvedHeatmapPalette(settings.palette, settings.fade, {
      min: Math.min(...values),
      max: Math.max(...values),
    }),
  };
  const stops = [...s.palette.stops].sort((a, b) => a.value - b.value);
  const lo = stops[0]?.value ?? 0;
  const hi = stops[stops.length - 1]?.value ?? 1;
  const span = hi - lo || 1;
  const counting = s.rowsRepresent === "count";
  const pMin = Math.min(...values);
  const pSpan = Math.max(...values) - pMin || 1;
  // Preview points are sample data, so place them on the stop range by relative position.
  const real = (v: number) => lo + (counting ? v : (v - pMin) / pSpan) * span;
  const tOf = (v: number) => Math.max(0, Math.min(1, (real(v) - lo) / span));
  const shade = (v: number) => {
    const { color, opacity } = heatmapColorAt(s.palette, real(v));
    return { color, opacity: opacity * s.opacity };
  };
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const liftPx = s.extrude ? 4 + (s.maxHeightMeters / 80000) * 26 : 0;

  const patterned = s.fill !== "Solid" && s.mode !== "Particles";
  const spacing = s.patternSpacing * 0.6 * zoomFactor;
  const strokeAt = (t: number) => Math.max(0.25, (s.sizeFromData ? t : 1) * s.patternStroke * 0.45);

  if (s.mode === "Cells") {
    const cols = Math.max(6, Math.min(22, Math.round(24 - s.cellSizeMeters / 250)));
    const rows = Math.max(4, Math.round((cols * innerH) / innerW));
    const field = buildField(points, cols, rows, s, 0);
    const cw = innerW / cols;
    const ch = innerH / rows;
    const hex = s.cellShape === "hex";
    const hexR = (Math.min(cw, ch) * s.hexSizeCells) / 1.6;
    const centres: { x: number; y: number; k: number }[] = [];
    if (hex) {
      const dx = Math.sqrt(3) * hexR;
      const dy = 1.5 * hexR;
      for (let r = 0, y = pad; y <= pad + innerH + dy * 0.5; r += 1, y += dy) {
        for (let x = pad + (r % 2 ? dx / 2 : 0); x <= pad + innerW + dx * 0.5; x += dx) {
          const i = Math.min(cols - 1, Math.max(0, Math.floor((x - pad) / cw)));
          const j = Math.min(rows - 1, Math.max(0, Math.floor((y - pad) / ch)));
          centres.push({ x, y, k: j * cols + i });
        }
      }
    } else {
      for (let j = 0; j < rows; j += 1) {
        for (let i = 0; i < cols; i += 1) centres.push({ x: pad + (i + 0.5) * cw, y: pad + (j + 0.5) * ch, k: j * cols + i });
      }
    }
    centres.sort((a, b) => a.y - b.y);
    const half = (hex ? hexR : Math.min(cw, ch) / 2) * s.coverage;
    return (
      <>
        {centres.map(({ x, y, k }, idx) => {
          const v = field.value[k];
          if (Number.isNaN(v)) return null;
          const t = tOf(v);
          const { color, opacity } = shade(v);
          const lift = liftPx * t;
          const top = y - lift;
          const shape = (cy: number, fill: string, fillOpacity: number, key: string) =>
            hex ? (
              <polygon key={key} points={hexPoints(x, cy, half)} fill={fill} fillOpacity={fillOpacity} />
            ) : (
              <rect key={key} x={x - half} y={cy - half} width={half * 2} height={half * 2} fill={fill} fillOpacity={fillOpacity} />
            );
          const glyphs: ReactNode[] = [];
          if (patterned) {
            for (let gy = Math.ceil((top - half) / spacing) * spacing; gy <= top + half; gy += spacing) {
              for (let gx = Math.ceil((x - half) / spacing) * spacing; gx <= x + half; gx += spacing) {
                glyphs.push(patternGlyph(`${gx}:${gy}`, s.fill, gx, gy, spacing, strokeAt(t), color, opacity));
              }
            }
          }
          return (
            <g key={idx} {...hit(field.nearest[k])}>
              {lift > 0.5 && (
                <rect x={x - half} y={top} width={half * 2} height={lift + (hex ? half * 0.5 : half)} fill={mixHex(color, "#000000", 0.45)} fillOpacity={opacity} />
              )}
              {shape(top, color, patterned ? opacity * 0.12 : opacity, "top")}
              {glyphs}
            </g>
          );
        })}
      </>
    );
  }

  const cols = 56;
  const rows = Math.max(20, Math.round((cols * innerH) / innerW));
  const blur = s.mode === "Particles" ? Math.min(s.blurCells, 1.5) : s.blurCells * 2.5;
  const field = buildField(points, cols, rows, s, blur);
  const cw = innerW / cols;
  const ch = innerH / rows;
  const heightAt = (k: number) => {
    const v = field.value[k];
    if (Number.isNaN(v)) return 0;
    const t = tOf(v);
    return liftPx * (s.mode === "Particles" ? t ** s.heightExponent : t);
  };

  if (s.mode === "Particles") {
    const baseR = (s.particleSizeMeters / 2400) * 1.1 * zoomFactor;
    const maxR = s.maxParticlePixels / 14;
    const drift = s.placement === "flow" ? (s.windDrift / 2000) * 3 * (s.windConvention === "from" ? 1 : -1) : 0;
    const step = 2;
    const dots: ReactNode[] = [];
    for (let j = 0; j < rows; j += step) {
      for (let i = 0; i < cols; i += step) {
        const k = j * cols + i;
        const v = field.value[k];
        if (Number.isNaN(v)) continue;
        const t = tOf(v);
        const { color, opacity } = shade(v);
        const r = Math.min(maxR, baseR * (1 - s.sizeFromIntensity + s.sizeFromIntensity * t));
        for (let n = 0; n < s.particlesPerCell; n += 1) {
          const seed = k * 13 + n * 7;
          const jitter = s.placement === "flow" ? 1 : 0;
          const lx = s.placement === "locked" ? ((n % 2) + 0.5) / 2 : hash(seed);
          const ly = s.placement === "locked" ? (Math.floor(n / 2) % 2 + 0.5) / 2 : hash(seed + 1);
          const rise = heightAt(k) * (1 + s.turbulence * (hash(seed + 2) - 0.5) * jitter);
          dots.push(
            <circle
              key={`${k}:${n}`}
              cx={pad + (i + lx * step) * cw + drift * t}
              cy={pad + (j + ly * step) * ch - rise}
              r={r}
              fill={color}
              fillOpacity={opacity}
              {...hit(field.nearest[k])}
            />,
          );
        }
      }
    }
    return <>{dots}</>;
  }

  const cells: ReactNode[] = [];
  const linesOnly = s.contours.enabled && s.contours.linesOnly;
  if (!linesOnly && patterned) {
    for (let gy = pad + spacing / 2; gy < pad + innerH; gy += spacing) {
      for (let gx = pad + spacing / 2; gx < pad + innerW; gx += spacing) {
        const i = Math.min(cols - 1, Math.floor((gx - pad) / cw));
        const j = Math.min(rows - 1, Math.floor((gy - pad) / ch));
        const k = j * cols + i;
        const v = field.value[k];
        if (Number.isNaN(v)) continue;
        const { color, opacity } = shade(v);
        cells.push(patternGlyph(`p${k}:${gx}`, s.fill, gx, gy - heightAt(k), spacing, strokeAt(tOf(v)), color, opacity));
      }
    }
  } else if (!linesOnly) {
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        const v = field.value[k];
        if (Number.isNaN(v)) continue;
        const shaded = shade(v);
        const { opacity } = shaded;
        let { color } = shaded;
        if (s.extrude) {
          const up = j > 0 ? heightAt(k - cols) : heightAt(k);
          const slope = (heightAt(k) - up) / Math.max(ch, 1);
          color = slope > 0 ? mixHex(color, "#ffffff", Math.min(0.35, slope * 0.25)) : mixHex(color, "#000000", Math.min(0.4, -slope * 0.3));
        }
        const y = pad + j * ch - heightAt(k);
        cells.push(
          <rect key={k} x={pad + i * cw - 0.3} y={y - 0.3} width={cw + 0.6} height={ch + 0.6} fill={color} fillOpacity={opacity} {...hit(field.nearest[k])} />,
        );
      }
    }
  }

  const lines: ReactNode[] = [];
  if (s.contours.enabled) {
    let fmin = Infinity;
    let fmax = -Infinity;
    field.value.forEach((v) => {
      if (Number.isNaN(v)) return;
      fmin = Math.min(fmin, real(v));
      fmax = Math.max(fmax, real(v));
    });
    const realField: Field = { ...field, value: field.value.map((v) => (Number.isNaN(v) ? NaN : real(v))) };
    contourLevels(fmin, fmax, s).forEach(({ value, bold }) => {
      const fill = heatmapColorAt(s.palette, value).color;
      const stroke =
        s.contours.style === "custom"
          ? s.contours.color
          : s.contours.style === "darker" || (s.contours.style === "auto" && luminance(fill) > 0.5)
            ? mixHex(fill, "#000000", 0.6)
            : mixHex(fill, "#ffffff", 0.6);
      lines.push(
        <path
          key={value}
          d={contourPath(realField, value, cw, ch, pad, pad, heightAt)}
          fill="none"
          stroke={stroke}
          strokeOpacity={s.contours.opacity}
          strokeWidth={s.contours.width * 0.6 * (bold ? 1.8 : 1)}
          strokeLinejoin="round"
          strokeLinecap="round"
        />,
      );
    });
  }

  return (
    <>
      <defs>
        <filter id="heatmap-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={patterned ? 0 : 1.2} />
        </filter>
      </defs>
      <g filter={patterned ? undefined : "url(#heatmap-soft)"}>{cells}</g>
      {lines}
    </>
  );
}
