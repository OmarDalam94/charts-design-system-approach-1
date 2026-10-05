/**
 * Heat map settings: the asset builder fields resolved to real values, and
 * their translation to the Map 3D `dustStorm` config. The field-to-key
 * mapping lives here so the preview and the export agree.
 */

import type { Opt } from "./chartModel";
import { HEATMAP_DEFAULT_PALETTE } from "./heatmapPalettes";
import {
  applyValueOpacity,
  asColorMode,
  hexToRgb,
  mixHex,
  stripHexAlpha,
  type ColorModeConfig,
  type ValueOpacity,
} from "./previewTheme";
import { fieldsForVisual } from "./visualSettingsCatalog";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

export type HeatmapMode = "Cells" | "Soft" | "Particles";
export type HeatmapFill = "Solid" | "Diagonal" | "Plus" | "X" | "Circle" | "Dot";

export type HeatmapSettings = {
  mode: HeatmapMode;
  rowsRepresent: "mean" | "count" | "grid";
  opacity: number;
  fill: HeatmapFill;
  sizeFromData: boolean;
  patternSpacing: number;
  patternStroke: number;
  cellSizeMeters: number;
  blurCells: number;
  cellShape: "square" | "hex";
  hexSizeCells: number;
  coverage: number;
  placement: "flow" | "locked";
  particleSizeMeters: number;
  sizeFromIntensity: number;
  particlesPerCell: number;
  maxParticlePixels: number;
  windDrift: number;
  windConvention: "from" | "to";
  extrude: boolean;
  maxHeightMeters: number;
  heightExponent: number;
  turbulence: number;
  contours: {
    enabled: boolean;
    spacing: "log" | "linear";
    step: number;
    majorEvery: number;
    style: "auto" | "darker" | "lighter" | "custom";
    color: string;
    opacity: number;
    width: number;
    linesOnly: boolean;
  };
  palette: ColorModeConfig;
  fade: ValueOpacity | null;
  clipOutliers: boolean;
  autoplay: boolean;
  hoursPerSecond: number;
};

let heatmapFields: Opt[] | null = null;
function field(group: string, name: string): Opt | undefined {
  heatmapFields ??= fieldsForVisual("heatmap");
  return heatmapFields.find((o) => o.group === group && o.name === name);
}

/** Slider fields store 0–100; the real range and default come from the catalog description. */
function slider(cfg: Cfg, group: string, name: string): number {
  const desc = field(group, name)?.desc ?? "";
  const range = desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const def = desc.match(/Default\s+(-?[\d.]+)/i);
  const lo = range ? parseFloat(range[1]) : 0;
  const hi = range ? parseFloat(range[2]) : 100;
  const fallback = def ? parseFloat(def[1]) : lo;
  const stepMatch = desc.match(/step\s+(-?\d*\.?\d+)/i);
  const step = stepMatch ? parseFloat(stepMatch[1]) : 0;
  const pct = Number(cfg(group, name, ((fallback - lo) / (hi - lo || 1)) * 100));
  if (!Number.isFinite(pct)) return fallback;
  const raw = lo + (Math.max(0, Math.min(100, pct)) / 100) * (hi - lo);
  return step > 0 ? Math.min(hi, lo + Math.round((raw - lo) / step) * step) : raw;
}

function text(cfg: Cfg, group: string, name: string): string {
  const fallback = field(group, name)?.defaultValue;
  const v = cfg(group, name, fallback);
  return typeof v === "string" && v ? v : String(fallback ?? "");
}

function toggle(cfg: Cfg, group: string, name: string): boolean {
  const o = field(group, name);
  const v = cfg(group, name, o ? o.def !== false : false);
  return v === true || v === "true";
}

/** Shared by every map layer. Hidden, and ignored, when color comes from a category. */
export function valueFade(cfg: Cfg): ValueOpacity | null {
  if (cfg("Color", "Color Source", "") === "Type") return null;
  if (!toggle(cfg, "Color", "Opacity from value")) return null;
  return {
    strength: slider(cfg, "Color", "Fade strength"),
    curve: slider(cfg, "Color", "Fade curve"),
  };
}

export function heatmapFade(cfg: Cfg): ValueOpacity | null {
  return valueFade(cfg);
}

export function heatmapSettings(cfg: Cfg): HeatmapSettings {
  const rows = text(cfg, "Mapping", "Rows represent");
  const levels = text(cfg, "Heatmap Style", "Levels");
  return {
    mode: text(cfg, "Heatmap Style", "Mode") as HeatmapMode,
    rowsRepresent: rows.startsWith("Events") ? "count" : rows.startsWith("Grid") ? "grid" : "mean",
    opacity: slider(cfg, "Heatmap Style", "Opacity"),
    fill: text(cfg, "Heatmap Style", "Fill") as HeatmapFill,
    sizeFromData: toggle(cfg, "Heatmap Style", "Size from data"),
    patternSpacing: slider(cfg, "Heatmap Style", "Pattern spacing (px)"),
    patternStroke: slider(cfg, "Heatmap Style", "Max thickness (px)"),
    cellSizeMeters: slider(cfg, "Heatmap Style", "Cell size (m)"),
    blurCells: slider(cfg, "Heatmap Style", "Blur (cells)"),
    cellShape: text(cfg, "Heatmap Style", "Cell shape") === "Hex" ? "hex" : "square",
    hexSizeCells: slider(cfg, "Heatmap Style", "Hex size (cells)"),
    coverage: slider(cfg, "Heatmap Style", "Coverage"),
    placement: text(cfg, "Heatmap Style", "Placement") === "Locked" ? "locked" : "flow",
    particleSizeMeters: slider(cfg, "Heatmap Style", "Particle size (m)"),
    sizeFromIntensity: slider(cfg, "Heatmap Style", "Size from intensity"),
    particlesPerCell: Math.round(slider(cfg, "Heatmap Style", "Particles per cell")),
    maxParticlePixels: Math.round(slider(cfg, "Heatmap Style", "Max particle size (px)")),
    windDrift: slider(cfg, "Heatmap Style", "Wind drift"),
    windConvention: text(cfg, "Heatmap Style", "Wind direction convention") === "Toward" ? "to" : "from",
    extrude: toggle(cfg, "3D height", "Extrude"),
    maxHeightMeters: slider(cfg, "3D height", "Max height (visual m)"),
    heightExponent: slider(cfg, "3D height", "Height exponent"),
    turbulence: slider(cfg, "3D height", "Turbulence"),
    contours: {
      enabled: toggle(cfg, "Heatmap Style", "Show contours"),
      spacing: levels === "Even steps" ? "linear" : "log",
      step: slider(cfg, "Heatmap Style", "Step"),
      majorEvery: Math.round(slider(cfg, "Heatmap Style", "Bold every")),
      style: text(cfg, "Heatmap Style", "Line color").toLowerCase() as HeatmapSettings["contours"]["style"],
      color: text(cfg, "Heatmap Style", "Custom color"),
      opacity: slider(cfg, "Heatmap Style", "Line opacity"),
      width: slider(cfg, "Heatmap Style", "Width (px)"),
      linesOnly: toggle(cfg, "Heatmap Style", "Lines only"),
    },
    palette: asColorMode(cfg("Color", "Palette", HEATMAP_DEFAULT_PALETTE)),
    fade: heatmapFade(cfg),
    clipOutliers: toggle(cfg, "Color", "Clip outliers"),
    autoplay: toggle(cfg, "Animation", "Autoplay"),
    hoursPerSecond: slider(cfg, "Animation", "Playback speed"),
  };
}

function sortedStops(palette: ColorModeConfig) {
  return [...palette.stops].sort((a, b) => a.value - b.value);
}

function isDefaultPlaceholder(palette: ColorModeConfig): boolean {
  const defaults = HEATMAP_DEFAULT_PALETTE.stops;
  return (
    palette.stops.length === defaults.length &&
    palette.stops.every((s, i) => s.value === defaults[i].value && s.color === defaults[i].color)
  );
}

/**
 * The palette as the map would draw it before the editor has refitted it:
 * placeholder stops spread over the data range, and unpinned stop opacity
 * following Opacity from value.
 */
export function resolvedHeatmapPalette(
  palette: ColorModeConfig,
  fade: ValueOpacity | null,
  dataRange: { min: number; max: number },
): ColorModeConfig {
  let stops = palette.stops;
  if (isDefaultPlaceholder(palette)) {
    const span = dataRange.max - dataRange.min;
    stops = stops.map((s, i) => ({ ...s, value: dataRange.min + (i / Math.max(1, stops.length - 1)) * span }));
  }
  if (palette.style === "Gradient" || palette.style === "Steps") {
    const sorted = [...stops].sort((a, b) => a.value - b.value);
    const range = { min: sorted[0]?.value ?? 0, max: sorted[sorted.length - 1]?.value ?? 1 };
    stops = applyValueOpacity(stops, range, fade);
  }
  return stops === palette.stops ? palette : { ...palette, stops };
}

/** Colour and 0–1 opacity for a real value, honouring stop positions, per-stop opacity, reverse and steps. */
export function heatmapColorAt(palette: ColorModeConfig, value: number): { color: string; opacity: number } {
  const stops = sortedStops(palette);
  if (!stops.length) return { color: palette.color, opacity: 1 };
  const lo = stops[0].value;
  const hi = stops[stops.length - 1].value;
  let v = Math.max(lo, Math.min(hi, value));
  if (palette.gradientReverse) v = hi - (v - lo);
  if (palette.style === "Steps") {
    let hit = stops[0];
    for (const s of stops) if (v >= s.value) hit = s;
    return { color: stripHexAlpha(hit.color), opacity: hit.opacity / 100 };
  }
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1];
    const b = stops[i];
    if (v <= b.value) {
      const u = b.value === a.value ? 1 : (v - a.value) / (b.value - a.value);
      return {
        color: mixHex(stripHexAlpha(a.color), stripHexAlpha(b.color), u),
        opacity: (a.opacity + (b.opacity - a.opacity) * u) / 100,
      };
    }
  }
  const last = stops[stops.length - 1];
  return { color: stripHexAlpha(last.color), opacity: last.opacity / 100 };
}

/** Relative luminance, used to pick darker or lighter contour lines. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** The Map 3D `dustStorm` keys this asset sets, plus the keys Map 3D still needs. */
export type MapDustStormConfig = {
  view: "particles" | "squares" | "soft";
  particlesExtruded: boolean;
  placement: "flow" | "locked";
  blurCells: number;
  cellShape: "square" | "hex";
  hexSizeCells: number;
  coverage: number;
  heatmapExtruded: boolean;
  heatmapHeightMeters: number;
  contourEnabled: boolean;
  contourSpacing: "log" | "linear";
  contourStep: number;
  contourMajorEvery: number;
  contourStyle: "auto" | "darker" | "lighter" | "custom";
  contourColor: string;
  contourOpacity: number;
  contourWidth: number;
  contourLinesOnly: boolean;
  pattern: "solid" | "diagonal" | "plus" | "x" | "circle" | "dot";
  patternSpacing: number;
  patternStroke: number;
  /** Not in Map 3D yet: off draws every pattern stroke at full thickness. */
  patternFromIntensity: boolean;
  normalization: "percentile-power" | "log";
  heightExponent: number;
  maxHeightMeters: number;
  turbulence: number;
  windAmplitude: number;
  windConvention: "from" | "to";
  particlesPerCell: number;
  pointSizeMeters: number;
  maxPointPixels: number;
  opacity: number;
  sizeFromIntensity: number;
  opacityFromIntensity: number;
  opacityExponent: number;
  hoursPerSecond: number;
  playing: boolean;
  colorLow: string;
  colorMid: string;
  colorHigh: string;
  colorExtreme: string;
  /** Not in Map 3D yet: a fixed colour window in data units, replacing the percentile clip. */
  rangeMin: number;
  rangeMax: number;
};

const VIEW_BY_MODE: Record<HeatmapMode, MapDustStormConfig["view"]> = {
  Cells: "squares",
  Soft: "soft",
  Particles: "particles",
};

export function heatmapConfigFromSettings(cfg: Cfg): MapDustStormConfig {
  const s = heatmapSettings(cfg);
  const stops = sortedStops(s.palette);
  const rangeMin = stops[0]?.value ?? 0;
  const rangeMax = stops[stops.length - 1]?.value ?? 1;
  const sample = (t: number) => heatmapColorAt(s.palette, rangeMin + t * (rangeMax - rangeMin)).color;
  return {
    view: VIEW_BY_MODE[s.mode] ?? "squares",
    particlesExtruded: s.extrude,
    placement: s.placement,
    blurCells: s.blurCells,
    cellShape: s.cellShape,
    hexSizeCells: s.hexSizeCells,
    coverage: s.coverage,
    heatmapExtruded: s.extrude,
    heatmapHeightMeters: s.maxHeightMeters,
    contourEnabled: s.contours.enabled,
    contourSpacing: s.contours.spacing,
    contourStep: s.contours.step,
    contourMajorEvery: s.contours.majorEvery,
    contourStyle: s.contours.style,
    contourColor: s.contours.color,
    contourOpacity: s.contours.opacity,
    contourWidth: s.contours.width,
    contourLinesOnly: s.contours.linesOnly,
    pattern: s.fill.toLowerCase() as MapDustStormConfig["pattern"],
    patternSpacing: s.patternSpacing,
    patternStroke: s.patternStroke,
    patternFromIntensity: s.sizeFromData,
    normalization: s.palette.distribution === "Exponential" ? "log" : "percentile-power",
    heightExponent: s.heightExponent,
    maxHeightMeters: s.maxHeightMeters,
    turbulence: s.turbulence,
    windAmplitude: s.windDrift,
    windConvention: s.windConvention,
    particlesPerCell: s.particlesPerCell,
    pointSizeMeters: s.particleSizeMeters,
    maxPointPixels: s.maxParticlePixels,
    opacity: s.opacity,
    sizeFromIntensity: s.sizeFromIntensity,
    // Map 3D has no per-stop alpha yet, so hand-pinned stop opacities fall back to the shader fade.
    opacityFromIntensity: s.fade?.strength ?? 0,
    opacityExponent: s.fade?.curve ?? 1,
    hoursPerSecond: s.hoursPerSecond,
    playing: s.autoplay,
    colorLow: sample(0),
    colorMid: sample(1 / 3),
    colorHigh: sample(2 / 3),
    colorExtreme: sample(1),
    rangeMin,
    rangeMax,
  };
}
