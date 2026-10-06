/**
 * Text measurement with the Llumen fonts. Uses a shared canvas in the
 * browser and a width-per-character estimate elsewhere (tests, SSR).
 */

export const FONT_SANS = '"Innovator Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export type TextStyle = { size: number; weight?: number; mono?: boolean };

export const TEXT = {
  title: { size: 14, weight: 500 },
  titleLarge: { size: 16, weight: 500 },
  body: { size: 13 },
  small: { size: 12 },
  micro: { size: 11 },
  tick: { size: 11, mono: true },
  kpi: { size: 24, weight: 600 },
  kpiCompact: { size: 20, weight: 600 },
} satisfies Record<string, TextStyle>;

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();
let version = 0;

function context(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  if (typeof document === "undefined") return (ctx = null);
  try {
    ctx = document.createElement("canvas").getContext("2d");
  } catch {
    ctx = null;
  }
  return ctx;
}

export function fontString(style: TextStyle): string {
  return `${style.weight ?? 400} ${style.size}px ${style.mono ? FONT_MONO : FONT_SANS}`;
}

/** Clear cached widths after web fonts finish loading. */
export function invalidateTextMetrics() {
  cache.clear();
  version++;
}

export function textMetricsVersion() {
  return version;
}

export function measureText(text: string, style: TextStyle): number {
  if (!text) return 0;
  const key = `${fontString(style)}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = context();
  let w: number;
  if (c) {
    c.font = fontString(style);
    w = c.measureText(text).width;
  } else {
    w = text.length * style.size * (style.mono ? 0.6 : 0.55) * ((style.weight ?? 400) >= 500 ? 1.04 : 1);
  }
  cache.set(key, w);
  return w;
}

/** Greedy word wrap; returns line count for `maxWidth`. */
export function wrapLines(text: string, style: TextStyle, maxWidth: number): number {
  if (!text) return 0;
  if (maxWidth <= 0) return 1;
  const words = text.split(/\s+/);
  let lines = 1;
  let current = 0;
  const space = measureText(" ", style);
  for (const w of words) {
    const ww = measureText(w, style);
    if (current === 0) current = ww;
    else if (current + space + ww <= maxWidth) current += space + ww;
    else {
      lines++;
      current = ww;
    }
    while (current > maxWidth) {
      lines++;
      current -= maxWidth;
    }
  }
  return lines;
}

/** Truncate with an ellipsis to fit `maxWidth`. */
export function truncateText(text: string, style: TextStyle, maxWidth: number): string {
  if (measureText(text, style) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(text.slice(0, mid) + "…", style) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? "…" : text.slice(0, lo).trimEnd() + "…";
}
