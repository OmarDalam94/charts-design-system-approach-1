import { DEFAULT_COLOR_MODE, withOpacity, type ColorModeConfig } from "../previewTheme";

export type DomainStops = {
  stops: { value: number; color: string }[];
  rescaled: boolean;
};

/**
 * Palette stops are stored in data units (the editor rescales them to the
 * data range). Stops that miss the data domain entirely — e.g. untouched
 * defaults — are spread across the domain, keeping their relative spacing.
 */
export function stopsForDomain(mode: ColorModeConfig, domain: [number, number]): DomainStops {
  const source = (mode.stops.length ? mode.stops : DEFAULT_COLOR_MODE.stops)
    .map((s) => ({ value: Number(s.value), color: withOpacity(s.color, s.opacity ?? 100) }))
    .filter((s) => Number.isFinite(s.value))
    .sort((a, b) => a.value - b.value);
  if (!source.length) return { stops: [{ value: domain[0], color: mode.color }], rescaled: false };
  const lo = source[0].value;
  const hi = source[source.length - 1].value;
  const overlaps = hi >= domain[0] && lo <= domain[1];
  if (overlaps && hi > lo) return { stops: source, rescaled: false };
  const span = hi - lo || 1;
  return {
    stops: source.map((s, i) => ({
      value: hi > lo ? domain[0] + ((s.value - lo) / span) * (domain[1] - domain[0]) : domain[0] + (i / Math.max(source.length - 1, 1)) * (domain[1] - domain[0]),
      color: s.color,
    })),
    rescaled: true,
  };
}

function lerpColor(a: string, b: string, t: number): string {
  const parse = (c: string): [number, number, number, number] => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(",").map((x) => Number(x.trim()));
      return [p[0], p[1], p[2], p[3] ?? 1];
    }
    const h = c.replace("#", "");
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    ];
  };
  const [r1, g1, b1, a1] = parse(a);
  const [r2, g2, b2, a2] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const alpha = a1 + (a2 - a1) * t;
  return alpha >= 0.995 ? `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})` : `rgba(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)}, ${alpha.toFixed(3)})`;
}

export function colorAtValue(stops: { value: number; color: string }[], v: number, stepped: boolean): string {
  if (!stops.length) return "#888888";
  if (v <= stops[0].value) return stops[0].color;
  if (v >= stops[stops.length - 1].value) return stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (v >= a.value && v <= b.value) {
      if (stepped) return a.color;
      const t = (v - a.value) / (b.value - a.value || 1);
      return lerpColor(a.color, b.color, t);
    }
  }
  return stops[stops.length - 1].color;
}
