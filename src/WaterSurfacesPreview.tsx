import type { MouseEvent as ReactMouseEvent } from "react";
import type { PreviewSeries } from "./componentPreviewProfiles";
import { valueOpacityAt } from "./previewTheme";
import { waterSurfaceSettings, type WaterSurfaceSettings } from "./waterSurfaceSettings";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;
type MapPoint = NonNullable<PreviewSeries["mapPoints"]>[number];

type Props = {
  cfg: Cfg;
  points: MapPoint[];
  width: number;
  height: number;
  pad: number;
  hit: (index: number) => {
    style?: { cursor: "pointer" };
    onMouseEnter?: (e: ReactMouseEvent) => void;
    onMouseMove?: (e: ReactMouseEvent) => void;
    onMouseLeave?: () => void;
  };
};

/** A bay: corners are land, the middle is water. Marks clip to this. */
function waterPath(w: number, h: number): string {
  return [
    `M ${w * 0.08} ${h * 0.42}`,
    `Q ${w * 0.22} ${h * 0.18} ${w * 0.48} ${h * 0.14}`,
    `Q ${w * 0.78} ${h * 0.1} ${w * 0.92} ${h * 0.32}`,
    `Q ${w * 0.98} ${h * 0.55} ${w * 0.84} ${h * 0.72}`,
    `Q ${w * 0.66} ${h * 0.92} ${w * 0.4} ${h * 0.86}`,
    `Q ${w * 0.12} ${h * 0.78} ${w * 0.08} ${h * 0.42}`,
    "Z",
  ].join(" ");
}

function xy(p: MapPoint, w: number, h: number, pad: number) {
  return { x: pad + p.x * (w - 2 * pad), y: pad + p.y * (h - 2 * pad) };
}

function fadeOf(s: WaterSurfaceSettings, value: number, max: number): number {
  if (!s.fade) return s.opacity;
  return s.opacity * (valueOpacityAt(max ? value / max : 0, s.fade) / 100);
}

export default function WaterSurfacesPreview({ cfg, points, width, height, pad, hit }: Props) {
  const s = waterSurfaceSettings(cfg);
  const max = Math.max(...points.map((p) => p.value), 1);
  const maskId = "water-surface-mask";
  const bay = waterPath(width, height);
  const placed = points.map((p) => ({ p, ...xy(p, width, height, pad) }));

  let marks: React.ReactNode = null;
  if (s.mode === "Plume") {
    marks = placed.map(({ p, x, y }, i) => {
      const t = p.value / max;
      const radius = 10 + (s.plume.radiusMeters / 2000) * 28 * (s.plume.radiusFromValue ? 0.45 + t : 1);
      const warp = (s.plume.distortion / 120) * 10;
      const color = s.palette.color;
      const opacity = fadeOf(s, p.value, max);
      const stem = s.stems.show ? 10 + (s.stems.maxHeightMeters / 120000) * 36 * (0.35 + t * 0.65) : 0;
      return (
        <g key={p.id} opacity={opacity} {...hit(i)}>
          {stem > 0 && (
            <line x1={x} y1={y} x2={x} y2={y - stem} stroke={s.stems.color} strokeWidth={Math.max(1, s.stems.widthPixels * 0.6)} strokeLinecap="round" />
          )}
          <ellipse cx={x + warp * 0.3} cy={y} rx={radius + warp} ry={radius * 0.62} fill={color} opacity={0.28} />
          <ellipse cx={x} cy={y} rx={radius * 0.72} ry={radius * 0.4} fill={color} opacity={0.85} />
        </g>
      );
    });
  } else if (s.mode === "Spill") {
    const ordered = [...placed].sort((a, b) => a.x - b.x);
    const d = ordered.map((q, i) => `${i ? "L" : "M"} ${q.x} ${q.y}`).join(" ");
    const widthPx = 8 + (s.spill.cohesionMeters / 4000) * 22;
    marks = (
      <g opacity={s.opacity}>
        <path d={d} fill="none" stroke={s.spill.fillColor} strokeWidth={widthPx} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        {s.spill.rimSheen && (
          <path
            className={s.spill.animateSheen ? "water-sheen" : undefined}
            d={d}
            fill="none"
            stroke="url(#water-sheen)"
            strokeWidth={Math.max(2, widthPx * 0.28)}
            strokeLinecap="round"
            style={{ animationDuration: `${2.4 / Math.max(s.spill.sheenSpeed, 0.05)}s` }}
          />
        )}
        {s.spill.trailStreaks > 0 &&
          ordered.map((q, i) => (
            <line
              key={q.p.id}
              x1={q.x - 8}
              y1={q.y + (i % 2 ? 3 : -3)}
              x2={q.x + 10}
              y2={q.y}
              stroke="#d7e4ea"
              strokeWidth={1}
              opacity={s.spill.trailStreaks * s.spill.trailStrength}
            />
          ))}
        {s.spill.showPathway && (
          <path d={d} fill="none" stroke="#f4f7fb" strokeWidth={1.4} strokeDasharray="3 5" opacity={s.spill.pathwayOpacity} />
        )}
        {s.stems.show && ordered[0] && (
          <line
            x1={ordered[0].x}
            y1={ordered[0].y}
            x2={ordered[0].x}
            y2={ordered[0].y - 8 - (s.stems.maxHeightMeters / 120000) * 40}
            stroke={s.stems.color}
            strokeWidth={Math.max(1, s.stems.widthPixels * 0.6)}
            strokeLinecap="round"
          />
        )}
        {ordered.map((q, i) => (
          <circle key={q.p.id} cx={q.x} cy={q.y} r={14} fill="transparent" {...hit(points.indexOf(q.p) >= 0 ? points.indexOf(q.p) : i)} />
        ))}
      </g>
    );
  } else {
    const count = Math.max(8, Math.round(s.current.particleDensity / 18000));
    marks = (
      <g>
        {Array.from({ length: count }).map((_, i) => {
          const src = placed[i % Math.max(placed.length, 1)];
          const x = src?.x ?? pad + 40;
          const y = (src?.y ?? height / 2) + ((i % 5) - 2) * 7;
          const len = 12 + s.current.trailLength * 26;
          const color = s.palette.color;
          const opacity = fadeOf(s, src?.p.value ?? max * 0.5, max);
          return (
            <path
              key={i}
              className="water-current"
              d={`M ${x - len} ${y} Q ${x} ${y - 8} ${x + len * 0.6} ${y + 2}`}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(1, s.current.particleSize)}
              strokeLinecap="round"
              opacity={opacity}
              style={{ animationDuration: `${1.8 / Math.max(s.current.animationSpeed, 0.05)}s`, animationDelay: `${(i % 6) * 0.15}s` }}
              {...(src ? hit(points.indexOf(src.p)) : {})}
            />
          );
        })}
      </g>
    );
  }

  return (
    <g>
      <defs>
        <clipPath id={maskId}>
          <path d={bay} />
        </clipPath>
        <linearGradient id="water-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7cf4c2" />
          <stop offset="0.35" stopColor="#f6e27a" />
          <stop offset="0.7" stopColor="#ff8ad4" />
          <stop offset="1" stopColor="#9fd4ff" />
        </linearGradient>
      </defs>
      <path d={bay} fill="#14344a" opacity={0.55} />
      <g clipPath={`url(#${maskId})`}>{marks}</g>
    </g>
  );
}
