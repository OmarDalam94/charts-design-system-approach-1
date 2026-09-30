/** Shared helpers so settings and the live preview interpret values the same way. */

export const BRAND = "#73adf5";
export const PALETTE = (base: string) => [base, "#c6a7ff", "#ffd58a", "#7ee0c0", "#f0888c", "#9bd1ff"];

export type RepeatableRow = {
  min: string;
  max: string;
  color: string;
  label: string;
  opacity?: number;
};

export type GradientStop = { color: string; at: number };

export const DEFAULT_REPEATABLE: RepeatableRow[] = [
  { min: "0", max: "50", color: "#34d399", label: "Low" },
  { min: "51", max: "100", color: "#fbbf24", label: "High" },
];

export const DEFAULT_GRADIENT: GradientStop[] = [
  { color: "#9bd1ff", at: 0 },
  { color: "#73adf5", at: 50 },
  { color: "#1FCE7A", at: 100 },
];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [115, 173, 245];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function hexAlpha(hex: string): number {
  const normalized = hex.replace("#", "").trim();
  return normalized.length === 8
    ? parseInt(normalized.slice(6, 8), 16) / 255
    : 1;
}

export function opacityPercentFromColor(hex: string): number {
  return Math.round(hexAlpha(hex) * 100);
}

export function stripHexAlpha(hex: string): string {
  const normalized = hex.replace("#", "").trim();
  const rgb = normalized.length >= 6 ? normalized.slice(0, 6) : normalized.padEnd(6, "0").slice(0, 6);
  return `#${rgb}`;
}

export function colorWithOpacityPercent(hex: string, opacityPct: number): string {
  const base = stripHexAlpha(hex);
  const pct = Math.max(0, Math.min(100, Math.round(opacityPct)));
  if (pct >= 100) return base;
  return `${base}${Math.round((pct / 100) * 255).toString(16).padStart(2, "0")}`;
}

export function isOpacityPalette(colors: string[]): boolean {
  return colors.some((color) => /^#[0-9a-f]{8}$/i.test(color));
}

/** Opacity palettes repeat the base color; only the opacity changes. */
export function paletteColorAt(
  colors: string[],
  index: number,
): { color: string; opacity: number } {
  const source = colors.length ? colors : DEFAULT_COLOR_MODE.colors;
  if (!isOpacityPalette(source)) {
    const color = source[Math.max(0, index) % source.length];
    return { color: stripHexAlpha(color), opacity: opacityPercentFromColor(color) };
  }
  const base = stripHexAlpha(source[0]);
  const levels = source.map((color) => opacityPercentFromColor(color));
  if (index < levels.length) return { color: base, opacity: levels[index] };
  const previous = levels[levels.length - 2] ?? 100;
  const step = Math.max(1, previous - levels[levels.length - 1]);
  return {
    color: base,
    opacity: Math.max(0, levels[levels.length - 1] - (index - (levels.length - 1)) * step),
  };
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  const mixed = rgbToHex(
    ar + (br - ar) * u,
    ag + (bg - ag) * u,
    ab + (bb - ab) * u,
  );
  const alpha = hexAlpha(a) + (hexAlpha(b) - hexAlpha(a)) * u;
  if (alpha >= 0.995) return mixed;
  return `${mixed}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export function sequentialRamp(base: string, steps: number): string[] {
  const light = mixHex("#ffffff", base, 0.28);
  const dark = mixHex(base, "#0b1220", 0.45);
  if (steps <= 1) return [base];
  return Array.from({ length: steps }, (_, i) => mixHex(light, dark, i / Math.max(steps - 1, 1)));
}

export function rampFromStops(stops: GradientStop[], t: number): string {
  if (!stops.length) return BRAND;
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  const x = Math.max(0, Math.min(1, t)) * 100;
  if (x <= sorted[0].at) return sorted[0].color;
  for (let i = 1; i < sorted.length; i++) {
    if (x <= sorted[i].at) {
      const span = sorted[i].at - sorted[i - 1].at || 1;
      return mixHex(sorted[i - 1].color, sorted[i].color, (x - sorted[i - 1].at) / span);
    }
  }
  return sorted[sorted.length - 1].color;
}

export function asRecord(v: unknown): Record<string, string> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, String(val)]));
  }
  return {};
}

export function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return v.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

export function asColorPair(v: unknown): { stroke: string; fill: string } {
  if (v && typeof v === "object") {
    const o = v as { stroke?: string; fill?: string };
    return { stroke: o.stroke || BRAND, fill: o.fill || o.stroke || BRAND };
  }
  return { stroke: BRAND, fill: BRAND };
}

export function asRepeatable(v: unknown): RepeatableRow[] {
  if (Array.isArray(v) && v.length) {
    return v.map((row, i) => {
      const r = row as Partial<RepeatableRow>;
      return {
        min: String(r.min ?? ""),
        max: String(r.max ?? ""),
        color: String(r.color ?? PALETTE(BRAND)[i % 6]),
        label: String(r.label ?? `Stop ${i + 1}`),
        opacity: Number.isFinite(Number(r.opacity)) ? Number(r.opacity) : 100,
      };
    });
  }
  return DEFAULT_REPEATABLE;
}

export const ZOOM_RATES = ["Linear", "Exponential", "Custom"] as const;
export type ZoomRate = (typeof ZOOM_RATES)[number];

export type ZoomScalingStop = { zoom: string; scale: string };
export type ZoomStyleCurveConfig = {
  dataField: string;
  rate: ZoomRate;
  stops: ZoomScalingStop[];
};
export type ZoomStyleStop = {
  zoom: string;
  curve: "linear" | "ease";
  curveConfig?: ZoomStyleCurveConfig;
};

export type ZoomScalingValue = {
  dataField: string;
  rate: ZoomRate;
  styleAcrossZoom: boolean;
  stops: ZoomScalingStop[];
  styleStops: ZoomStyleStop[];
};

export const DEFAULT_ZOOM_SCALING: ZoomScalingValue = {
  dataField: "",
  rate: "Linear",
  styleAcrossZoom: false,
  stops: [
    { zoom: "194", scale: "1" },
    { zoom: "300", scale: "5" },
    { zoom: "350", scale: "10" },
    { zoom: "600", scale: "20" },
  ],
  styleStops: [
    { zoom: "0", curve: "linear" },
    { zoom: "22", curve: "ease" },
  ],
};

export type ParsedZoomStop = { zoom: number; scale: number };

function isZoomRate(v: unknown): v is ZoomRate {
  return v === "Linear" || v === "Exponential" || v === "Custom";
}

function cloneZoomScaling(v: ZoomScalingValue): ZoomScalingValue {
  return {
    dataField: v.dataField,
    rate: v.rate,
    styleAcrossZoom: v.styleAcrossZoom,
    stops: v.stops.map((s) => ({ zoom: s.zoom, scale: s.scale })),
    styleStops: v.styleStops.map((s) => ({
      zoom: s.zoom,
      curve: s.curve,
      curveConfig: s.curveConfig
        ? {
            dataField: s.curveConfig.dataField,
            rate: s.curveConfig.rate,
            stops: s.curveConfig.stops.map((stop) => ({ ...stop })),
          }
        : undefined,
    })),
  };
}

function parseStopPair(zoom: unknown, scale: unknown): ZoomScalingStop {
  return { zoom: String(zoom ?? ""), scale: String(scale ?? "") };
}

function fromLegacyRepeatable(rows: RepeatableRow[]): ZoomScalingStop[] {
  const isStockDefault =
    rows.length === DEFAULT_REPEATABLE.length &&
    rows.every(
      (r, i) =>
        r.min === DEFAULT_REPEATABLE[i].min &&
        r.max === DEFAULT_REPEATABLE[i].max &&
        r.label === DEFAULT_REPEATABLE[i].label,
    );
  if (isStockDefault) return DEFAULT_ZOOM_SCALING.stops.map((s) => ({ ...s }));
  return rows.map((r) => parseStopPair(r.min, r.max));
}

export function asZoomScaling(v: unknown): ZoomScalingValue {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Partial<ZoomScalingValue> & { stops?: unknown };
    if (Array.isArray(o.stops) && o.stops.length) {
      return {
        dataField: typeof o.dataField === "string" ? o.dataField : "",
        rate: isZoomRate(o.rate) ? o.rate : "Linear",
        styleAcrossZoom: o.styleAcrossZoom === true,
        stops: o.stops.map((s, i) => {
          const row = (s ?? {}) as Partial<ZoomScalingStop> & Partial<RepeatableRow>;
          return parseStopPair(row.zoom ?? row.min ?? i, row.scale ?? row.max ?? "");
        }),
        styleStops:
          Array.isArray(o.styleStops) && o.styleStops.length
            ? o.styleStops.map((s, i) => {
                const row = (s ?? {}) as Partial<ZoomStyleStop>;
              const curveConfig = row.curveConfig;
                return {
                  zoom: String(row.zoom ?? i * 22),
                  curve: row.curve === "ease" ? "ease" : "linear",
                curveConfig:
                  curveConfig &&
                  typeof curveConfig === "object" &&
                  isZoomRate(curveConfig.rate) &&
                  Array.isArray(curveConfig.stops) &&
                  curveConfig.stops.length
                    ? {
                        dataField:
                          typeof curveConfig.dataField === "string"
                            ? curveConfig.dataField
                            : "",
                        rate: curveConfig.rate,
                        stops: curveConfig.stops.map((stop, stopIndex) =>
                          parseStopPair(stop?.zoom ?? stopIndex, stop?.scale ?? ""),
                        ),
                      }
                    : undefined,
                };
              })
            : DEFAULT_ZOOM_SCALING.styleStops.map((s) => ({ ...s })),
      };
    }
  }
  if (Array.isArray(v) && v.length) {
    const first = v[0] as Partial<ZoomScalingStop> & Partial<RepeatableRow>;
    if (first && typeof first === "object" && ("zoom" in first || "scale" in first)) {
      return {
        dataField: "",
        rate: "Linear",
        styleAcrossZoom: false,
        stops: v.map((s, i) => {
          const row = (s ?? {}) as Partial<ZoomScalingStop> & Partial<RepeatableRow>;
          return parseStopPair(row.zoom ?? row.min ?? i, row.scale ?? row.max ?? "");
        }),
        styleStops: DEFAULT_ZOOM_SCALING.styleStops.map((s) => ({ ...s })),
      };
    }
    return {
      ...cloneZoomScaling(DEFAULT_ZOOM_SCALING),
      stops: fromLegacyRepeatable(asRepeatable(v)),
    };
  }
  return cloneZoomScaling(DEFAULT_ZOOM_SCALING);
}

export function parsedZoomStops(value: ZoomScalingValue): ParsedZoomStop[] {
  return value.stops
    .map((s) => ({ zoom: Number(s.zoom), scale: Number(s.scale) }))
    .filter((s) => Number.isFinite(s.zoom) && Number.isFinite(s.scale))
    .sort((a, b) => a.zoom - b.zoom);
}

export function sampleZoomScale(value: ZoomScalingValue, zoom: number): number {
  const pts = parsedZoomStops(value);
  if (!pts.length) return 1;
  if (pts.length === 1) return pts[0].scale;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (zoom <= first.zoom) return first.scale;
  if (zoom >= last.zoom) return last.scale;

  if (value.rate === "Custom") {
    for (let i = 1; i < pts.length; i++) {
      if (zoom <= pts[i].zoom) {
        const span = pts[i].zoom - pts[i - 1].zoom || 1;
        const t = (zoom - pts[i - 1].zoom) / span;
        return pts[i - 1].scale + (pts[i].scale - pts[i - 1].scale) * t;
      }
    }
    return last.scale;
  }

  const t = (zoom - first.zoom) / (last.zoom - first.zoom || 1);
  const eased = value.rate === "Exponential" ? (8 ** t - 1) / 7 : t;
  return first.scale + (last.scale - first.scale) * eased;
}

export function repeatableToStops(rows: RepeatableRow[]): ColorStop[] {
  const sorted = [...rows].sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0));
  const stops: ColorStop[] = sorted.map((r) => ({
    value: Number(r.min) || 0,
    color: r.color,
    opacity: Number.isFinite(Number(r.opacity)) ? Number(r.opacity) : 100,
  }));
  const last = sorted[sorted.length - 1];
  if (last) {
    const lastMin = Number(last.min) || 0;
    const lastMax = Number(last.max);
    if (Number.isFinite(lastMax) && lastMax > lastMin) {
      stops.push({
        value: lastMax,
        color: last.color,
        opacity: Number.isFinite(Number(last.opacity)) ? Number(last.opacity) : 100,
      });
    }
  }
  return stops.length ? stops : DEFAULT_COLOR_MODE.stops.map((s) => ({ ...s }));
}

export function stopsToRepeatable(stops: ColorStop[], prev: RepeatableRow[] = []): RepeatableRow[] {
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  if (!sorted.length) return prev.length ? prev : DEFAULT_REPEATABLE.map((r) => ({ ...r }));
  return sorted.map((s, i) => ({
    min: String(s.value),
    max: String(i < sorted.length - 1 ? sorted[i + 1].value : s.value),
    color: s.color,
    label: prev[i]?.label || `Stop ${i + 1}`,
    opacity: s.opacity,
  }));
}

export function matchThreshold(thresholds: RepeatableRow[], value: number): RepeatableRow | undefined {
  if (!thresholds.length || !Number.isFinite(value)) return undefined;
  const sorted = [...thresholds].sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0));
  let hit = sorted[0];
  for (const row of sorted) {
    if (value >= (Number(row.min) || 0)) hit = row;
    else break;
  }
  return hit;
}

export function asGradient(v: unknown): GradientStop[] {
  if (Array.isArray(v) && v.length) {
    return v.map((row, i) => {
      const r = row as Partial<GradientStop>;
      return { color: String(r.color ?? BRAND), at: Number(r.at ?? i * 50) };
    });
  }
  return DEFAULT_GRADIENT;
}

export function parseMinMax(raw: unknown, fallback: [number, number] = [0, 100]): [number, number] {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const m = s.match(/(-?\d*\.?\d*)\s*[/,–—-]\s*(-?\d*\.?\d*)/);
  if (m) {
    const lo = m[1] === "" ? fallback[0] : Number(m[1]);
    const hi = m[2] === "" ? fallback[1] : Number(m[2]);
    return [Number.isFinite(lo) ? lo : fallback[0], Number.isFinite(hi) ? hi : fallback[1]];
  }
  const n = Number(s);
  return Number.isFinite(n) ? [n, fallback[1]] : fallback;
}

export function sliderMapped(pct: unknown, lo: number, hi: number, fallback = lo): number {
  const n = Number(pct);
  if (!Number.isFinite(n)) return fallback;
  return lo + (Math.max(0, Math.min(100, n)) / 100) * (hi - lo);
}

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const trim = (v: number) => {
    const digits = v >= 100 ? 0 : 1;
    const s = v.toFixed(digits);
    return String(Number(s));
  };
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}K`;
  return `${sign}${trim(abs)}`;
}

export function formatBySpec(n: number, spec: string): string {
  if (!Number.isFinite(n)) return "—";
  const s = spec.trim();
  if (!s) {
    const abs = Math.abs(n);
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
    return n.toFixed(1);
  }
  if (s.toLowerCase().includes("currency") || s.includes("$")) {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  }
  if (s.toLowerCase().includes("percent") || s.includes("%")) {
    return `${n.toFixed(0)}%`;
  }
  if (s.toLowerCase().includes("duration")) {
    return `${Math.round(n)}m`;
  }
  const fm = s.match(/\.(\d+)f/);
  if (fm) return n.toFixed(Number(fm[1]));
  if (/,/.test(s)) return Math.round(n).toLocaleString();
  return String(Math.round(n * 10) / 10);
}

export function formatNumberByNotation(
  n: number,
  notation: string,
  spec = "",
): string {
  if (!Number.isFinite(n)) return "—";
  const mode = notation.trim().toLowerCase();
  if (mode.startsWith("compact")) {
    const compact = formatCompactNumber(n);
    if (spec.toLowerCase().includes("currency") || spec.includes("$")) {
      return `$${compact}`;
    }
    if (spec.toLowerCase().includes("percent") || spec.includes("%")) {
      return `${compact}%`;
    }
    if (spec.toLowerCase().includes("duration")) return `${compact}m`;
    return compact;
  }
  if (mode.startsWith("full")) {
    const full = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (spec.toLowerCase().includes("currency") || spec.includes("$")) {
      return `$${full}`;
    }
    if (spec.toLowerCase().includes("percent") || spec.includes("%")) {
      return `${full}%`;
    }
    if (spec.toLowerCase().includes("duration")) return `${full}m`;
    return full;
  }
  return formatBySpec(n, spec);
}

export function listHas(v: unknown, label: string): boolean {
  return asStringArray(v).some((x) => x.toLowerCase() === label.toLowerCase());
}

export type PaletteFamily = "Sequential" | "Categorical" | "Diverging";
export type PaletteStyle = "Single" | "Per Category" | "Gradient" | "Steps";

export type ColorStop = { value: number; color: string; opacity: number };

export type ColorModeConfig = {
  paletteName: string;
  paletteFamily: PaletteFamily;
  colors: string[];
  style: PaletteStyle;
  color: string;
  opacity: number;
  categoryField: string;
  categoryColors: Record<string, string>;
  categoryLabels: string[];
  categoryOpacities: number[];
  sequentialBasis: "Value" | "Category";
  distribution: string;
  gradientAxis: "X" | "Y";
  gradientReverse: boolean;
  stops: ColorStop[];
};

export const DEFAULT_COLOR_MODE: ColorModeConfig = {
  paletteName: "Blue → White",
  paletteFamily: "Sequential",
  colors: ["#2b61f5", "#356eea", "#4f86ea", "#6a9ef3", "#a8c9fa", "#d8e6fd", "#f7f9ff"],
  style: "Single",
  color: "#2b61f5",
  opacity: 100,
  categoryField: "Auto",
  categoryColors: {},
  categoryLabels: [],
  categoryOpacities: [],
  sequentialBasis: "Value",
  distribution: "Linear",
  gradientAxis: "Y",
  gradientReverse: false,
  stops: [
    { value: 194, color: "#2b61f5", opacity: 100 },
    { value: 350, color: "#6a9ef3", opacity: 100 },
    { value: 600, color: "#c8dcfc", opacity: 100 },
  ],
};

export function asColorMode(v: unknown): ColorModeConfig {
  if (typeof v === "string" && v.trim().startsWith("#")) {
    return { ...DEFAULT_COLOR_MODE, color: v.trim() };
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Partial<ColorModeConfig>;
    const legacyBlueShades =
      o.paletteName === "Blue" &&
      o.paletteFamily === "Sequential" &&
      Array.isArray(o.colors) &&
      o.colors.every((color) => /^#[0-9a-f]{6}$/i.test(String(color)));
    const legacyOpacityNames: Record<string, string> = {
      Blue: "Blue → Transparent",
      Purple: "Purple → Transparent",
      Teal: "Teal → Transparent",
      Red: "Red → Transparent",
      Gold: "Gold → Transparent",
    };
    const legacyOpacityName =
      o.paletteFamily === "Sequential" &&
      Array.isArray(o.colors) &&
      o.colors.some((color) => /^#[0-9a-f]{8}$/i.test(String(color))) &&
      typeof o.paletteName === "string"
        ? legacyOpacityNames[o.paletteName]
        : undefined;
    return {
      ...DEFAULT_COLOR_MODE,
      ...o,
      paletteName: legacyBlueShades
        ? DEFAULT_COLOR_MODE.paletteName
        : legacyOpacityName ??
          o.paletteName ??
          DEFAULT_COLOR_MODE.paletteName,
      colors: legacyBlueShades
        ? DEFAULT_COLOR_MODE.colors
        : Array.isArray(o.colors) && o.colors.length
          ? o.colors
          : DEFAULT_COLOR_MODE.colors,
      categoryField:
        typeof o.categoryField === "string" && o.categoryField
          ? o.categoryField
          : DEFAULT_COLOR_MODE.categoryField,
      categoryColors:
        o.categoryColors &&
        typeof o.categoryColors === "object" &&
        !Array.isArray(o.categoryColors)
          ? Object.fromEntries(
              Object.entries(o.categoryColors).filter(
                ([, color]) => typeof color === "string",
              ),
            )
          : DEFAULT_COLOR_MODE.categoryColors,
      categoryLabels: Array.isArray(o.categoryLabels)
        ? o.categoryLabels.map(String)
        : DEFAULT_COLOR_MODE.categoryLabels,
      categoryOpacities: Array.isArray(o.categoryOpacities)
        ? o.categoryOpacities.map((opacity) =>
            Math.max(0, Math.min(100, Number(opacity) || 0)),
          )
        : DEFAULT_COLOR_MODE.categoryOpacities,
      sequentialBasis:
        o.sequentialBasis === "Category" ? "Category" : "Value",
      gradientAxis: o.gradientAxis === "X" ? "X" : "Y",
      gradientReverse: Boolean(o.gradientReverse),
      stops: legacyBlueShades
        ? DEFAULT_COLOR_MODE.stops
        : Array.isArray(o.stops) && o.stops.length
          ? o.stops
          : DEFAULT_COLOR_MODE.stops,
    };
  }
  return { ...DEFAULT_COLOR_MODE, stops: DEFAULT_COLOR_MODE.stops.map((s) => ({ ...s })) };
}

export function withOpacity(hex: string, opacityPct: number): string {
  const embedded = hexAlpha(hex);
  const requested = Math.max(0, Math.min(1, opacityPct / 100));
  // A stored 100% means "no extra fade" for older colors whose alpha lives in
  // the hex. Any explicit slider value replaces that alpha instead of stacking.
  const op = embedded < 0.995 && requested >= 0.995 ? embedded : requested;
  if (op >= 0.995) return embedded >= 0.995 ? hex : stripHexAlpha(hex);
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${op.toFixed(3)})`;
}

export function fitPaletteToCount(colors: string[], count: number): string[] {
  const source = colors.length ? colors : DEFAULT_COLOR_MODE.colors;
  const targetCount = Math.max(1, Math.round(count));
  if (targetCount === source.length) return [...source];
  if (targetCount === 1) return [source[Math.floor((source.length - 1) / 2)]];
  const stops = source.map((color, index) => ({
    color,
    at: (index / Math.max(source.length - 1, 1)) * 100,
  }));
  return Array.from({ length: targetCount }, (_, index) =>
    rampFromStops(stops, index / Math.max(targetCount - 1, 1)),
  );
}

export function expandPaletteToCount(
  colors: string[],
  count: number,
  family: PaletteFamily,
): string[] {
  const source = colors.length ? colors : DEFAULT_COLOR_MODE.colors;
  const targetCount = Math.max(1, Math.round(count));
  if (isOpacityPalette(source)) {
    return Array.from({ length: targetCount }, (_, index) => {
      const assigned = paletteColorAt(source, index);
      return colorWithOpacityPercent(assigned.color, assigned.opacity);
    });
  }
  if (source.length >= targetCount) return [...source];
  if (family !== "Categorical") return fitPaletteToCount(source, targetCount);

  const expanded = [...source];
  while (expanded.length < targetCount) {
    const generatedIndex = expanded.length - source.length;
    const sourceIndex = generatedIndex % source.length;
    const cycle = Math.floor(generatedIndex / source.length);
    const mixToward = cycle % 2 === 0 ? "#ffffff" : "#0b1220";
    const amount = Math.min(0.42, 0.16 + Math.floor(cycle / 2) * 0.1);
    expanded.push(mixHex(source[sourceIndex], mixToward, amount));
  }
  return expanded;
}

export function resolveColorMode(
  mode: ColorModeConfig,
  t: number,
  index: number,
  category?: string,
  categoryCount?: number,
): string {
  const matchedCategoryIndex = category
    ? mode.categoryLabels.findIndex(
        (label) => label.toLowerCase() === category.toLowerCase(),
      )
    : -1;
  const categoryIndex =
    matchedCategoryIndex >= 0 ? matchedCategoryIndex : Math.max(0, index);
  let u = Math.max(0, Math.min(1, t));
  if (mode.style === "Gradient" && mode.sequentialBasis === "Category") {
    u =
      categoryIndex /
      Math.max(
        mode.categoryLabels.length - 1,
        (categoryCount ?? 1) - 1,
        1,
      );
  }
  if (mode.style === "Gradient" && mode.gradientReverse) u = 1 - u;
  if (mode.style === "Single") return withOpacity(mode.color, mode.opacity);
  if (mode.style === "Per Category") {
    const sourceColors = mode.colors.length ? mode.colors : DEFAULT_COLOR_MODE.colors;
    const colors =
      categoryCount && categoryCount > 0
        ? expandPaletteToCount(
            sourceColors,
            categoryCount,
            mode.paletteFamily,
          )
        : sourceColors;
    const directColor = category
      ? mode.categoryColors[category] ??
        Object.entries(mode.categoryColors).find(
          ([label]) => label.toLowerCase() === category.toLowerCase(),
        )?.[1]
      : undefined;
    const colorIndex = categoryIndex % Math.max(colors.length, 1);
    if (isOpacityPalette(sourceColors)) {
      const assigned = paletteColorAt(sourceColors, categoryIndex);
      const color = directColor ? stripHexAlpha(directColor) : assigned.color;
      return withOpacity(
        color,
        mode.categoryOpacities[categoryIndex] ??
          (directColor ? opacityPercentFromColor(directColor) : assigned.opacity),
      );
    }
    return withOpacity(
      directColor ?? colors[colorIndex] ?? mode.color,
      mode.categoryOpacities[categoryIndex] ?? mode.opacity,
    );
  }
  const stops = mode.stops.length ? [...mode.stops].sort((a, b) => a.value - b.value) : DEFAULT_COLOR_MODE.stops;
  const min = stops[0].value;
  const max = stops[stops.length - 1].value;
  const span = max - min || 1;
  if (mode.style === "Steps" || (mode.paletteFamily === "Categorical" && mode.style !== "Gradient")) {
    const i =
      mode.paletteFamily === "Categorical"
        ? index % Math.max(mode.colors.length || stops.length, 1)
        : Math.min(stops.length - 1, Math.floor(u * stops.length));
    const color = mode.colors[i] ?? stops[i]?.color ?? mode.color;
    return withOpacity(color, stops[i]?.opacity ?? mode.opacity);
  }
  const mapped = stops.map((s) => ({ color: s.color, at: ((s.value - min) / span) * 100 }));
  return withOpacity(rampFromStops(mapped, u), mode.opacity);
}
