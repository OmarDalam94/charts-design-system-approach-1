/**
 * Series identity: a stable id, label, color, dash pattern and marker per
 * series key. Identity is assigned in first-appearance order and never
 * depends on visibility, sorting, or the current value.
 */

import {
  DEFAULT_COLOR_MODE,
  expandPaletteToCount,
  resolveColorMode,
  withOpacity,
  type ColorModeConfig,
} from "../previewTheme";

/** Llumen categorical data palette (`--lc-dataviz-1…8`); identical in both themes. */
export const CATEGORICAL = ["#6a9ef0", "#7b6fe8", "#3ec4b8", "#59c96a", "#f0a830", "#f06840", "#d45090", "#e85868"];

/** Dash cues for series beyond the palette size: one pattern per palette cycle. */
export const DASHES = ["", "6 3", "2 3", "10 3 2 3", "1 4", "12 4", "4 2 1 2"];

export const MARKERS = ["circle", "square", "triangle", "diamond", "cross", "triangle-down"] as const;
export type MarkerShape = (typeof MARKERS)[number];

export type SeriesIdentity = {
  id: string;
  key: string;
  label: string;
  index: number;
  color: string;
  dash: string;
  marker: MarkerShape;
};

export type ColorAssignment = {
  colors: string[];
  /** Explains when the configured palette could not encode every series. */
  note?: string;
};

/**
 * Colors for `count` series or categories under a palette configuration.
 * Single color cannot distinguish multiple series, so 2+ series fall back
 * to the categorical palette starting with the chosen color.
 */
export function seriesColors(mode: ColorModeConfig | null, keys: string[]): ColorAssignment {
  const count = keys.length;
  if (!mode) return { colors: keys.map((_, i) => CATEGORICAL[i % CATEGORICAL.length]) };
  if (mode.style === "Single") {
    const base = withOpacity(mode.color, mode.opacity);
    if (count <= 1) return { colors: [base] };
    const rest = CATEGORICAL.filter((c) => c.toLowerCase() !== mode.color.toLowerCase());
    return {
      colors: keys.map((_, i) => (i === 0 ? base : rest[(i - 1) % rest.length])),
      note: `Single color applies to one series; ${count} series use the categorical palette so each stays distinguishable.`,
    };
  }
  if (mode.style === "Per Category") {
    return { colors: keys.map((k, i) => resolveColorMode(mode, 0, i, k, count)) };
  }
  // Gradient / Steps encode value; across series they sample by series order.
  const palette = expandPaletteToCount(mode.colors.length ? mode.colors : DEFAULT_COLOR_MODE.colors, Math.max(count, 2), mode.paletteFamily);
  const colors = keys.map((k, i) => {
    if (mode.categoryColors[k]) return withOpacity(mode.categoryColors[k], mode.opacity);
    const t = count <= 1 ? 0 : i / (count - 1);
    return mode.style === "Steps" ? withOpacity(palette[i % palette.length], mode.opacity) : resolveColorMode({ ...mode, sequentialBasis: "Value" }, mode.gradientReverse ? 1 - t : t, i, k, count);
  });
  return {
    colors,
    note:
      count > 1
        ? `${mode.style} palette is sampled in series order; it does not encode values when several series share a plot.`
        : undefined,
  };
}

/** Shared colour for marks that carry no category of their own (e.g. downstream Sankey nodes). */
export const NEUTRAL_MARK = "var(--lcc-mark-neutral)";

export function assignIdentities(keys: string[], labels: Record<string, string> | null, colors: string[]): SeriesIdentity[] {
  return keys.map((key, index) => ({
    id: `series:${key}`,
    key,
    label: labels?.[key] ?? key,
    index,
    color: colors[index] ?? CATEGORICAL[index % CATEGORICAL.length],
    dash: DASHES[Math.floor(index / CATEGORICAL.length) % DASHES.length],
    marker: MARKERS[index % MARKERS.length],
  }));
}

/** Unique keys in first-appearance order. */
export function firstAppearance(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Color for a value under Gradient/Steps palettes (t = position within the data range). */
export function valueColor(mode: ColorModeConfig, t: number, index: number, key: string, count: number): string {
  const exponential = mode.distribution.toLowerCase().startsWith("exp");
  const shaped = exponential ? Math.pow(Math.max(0, Math.min(1, t)), 2) : t;
  return resolveColorMode(mode, shaped, index, key, count);
}

export function markerPath(shape: MarkerShape, r: number): string {
  switch (shape) {
    case "square":
      return `M${-r},${-r}H${r}V${r}H${-r}Z`;
    case "triangle":
      return `M0,${-r * 1.15}L${r * 1.05},${r * 0.75}H${-r * 1.05}Z`;
    case "triangle-down":
      return `M0,${r * 1.15}L${r * 1.05},${-r * 0.75}H${-r * 1.05}Z`;
    case "diamond":
      return `M0,${-r * 1.25}L${r * 1.05},0L0,${r * 1.25}L${-r * 1.05},0Z`;
    case "cross": {
      const a = r * 0.38;
      return `M${-a},${-r}H${a}V${-a}H${r}V${a}H${a}V${r}H${-a}V${a}H${-r}V${-a}H${-a}Z`;
    }
    case "circle":
    default:
      return `M${r},0A${r},${r} 0 1,1 ${-r},0A${r},${r} 0 1,1 ${r},0Z`;
  }
}

/** WCAG relative luminance contrast between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "").slice(0, 6);
    if (h.length !== 6) return 0.5;
    const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
