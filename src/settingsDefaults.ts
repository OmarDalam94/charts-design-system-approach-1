/**
 * Default resolution and slider units for catalog settings.
 * Shared by the Asset Builder editor and the chart system so both read a
 * persisted `group::name` configuration the same way.
 */

import type { Opt } from "./chartModel";
import { allColumnNames, uniqueValues } from "./mockDataset";
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_GRADIENT,
  DEFAULT_REPEATABLE,
  DEFAULT_ZOOM_SCALING,
} from "./previewTheme";
import { defaultGradientAxisForVisual } from "./visualSettingsCatalog";
import { WATER_CURRENT_PALETTE, WATER_PLUME_PALETTE, WATER_SPILL_PALETTE } from "./waterPalettes";

export type Config = Record<string, unknown>;

export const keyOf = (o: Pick<Opt, "group" | "name">) => `${o.group}::${o.name}`;

/** Former Area styling fields now live under Colors; keep old keys readable. */
export const LEGACY_SETTING_KEYS: Record<string, string> = {
  "Colors::Line + Area colors": "Area styling::Line + Area colors",
  "Colors::Fill opacity": "Area styling::Fill opacity",
};

export type MarginsValue = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  locked: boolean;
};

export const defaultMargins = (): MarginsValue => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  locked: true,
});

const SAMPLE_COLUMNS = allColumnNames();

export function isMultiToggle(o: Opt, values: string[]) {
  return (
    o.name.toLowerCase().includes("show") ||
    o.name.toLowerCase() === "content" ||
    values.some((v) => v.toLowerCase().startsWith("show "))
  );
}

export function multiChoices(o: Opt): string[] {
  return o.name === "Visible columns" ? SAMPLE_COLUMNS : o.values.length ? o.values : ["Field A", "Field B", "Field C"];
}

export function defaultMulti(o: Opt): string[] {
  const values = multiChoices(o);
  if (isMultiToggle(o, values)) return [...values];
  if (o.name === "Visible columns") return [];
  return values.slice(0, Math.min(3, values.length));
}

export function defaultColorList(o: Opt): Record<string, string> {
  const pal = ["#3FA7A0", "#73adf5", "#c6a7ff", "#ffd58a", "#f0888c", "#7ee0c0"];
  const n = o.name.toLowerCase();
  const keys = n.includes("status") ? uniqueValues("status") : uniqueValues("category");
  return Object.fromEntries(keys.map((k, i) => [k, pal[i % pal.length]]));
}

export function isPaletteField(o: Opt): boolean {
  return o.type === "color" && o.name === "Palette" && (o.group === "Colors" || o.group === "Color");
}

export function defaultSlider(o: Opt): number {
  const n = o.name.toLowerCase();
  if (n.includes("top n")) return 100;
  const range = o.desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const def = o.desc.match(/Default\s+([\d.]+)/i);
  if (range && def) {
    const lo = parseFloat(range[1]);
    const hi = parseFloat(range[2]);
    const v = parseFloat(def[1]);
    if (hi !== lo) return Math.round(((v - lo) / (hi - lo)) * 100);
  }
  if (n.includes("opacity")) return 40;
  return 50;
}

export function isZoomScalingField(o: Opt) {
  return (
    /zoom scaling/i.test(o.name) ||
    o.name === "Disc scaling" ||
    (o.group === "Extrusion" && o.name === "Data range")
  );
}

export function isUntouchedPlumePalette(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const palette = value as { style?: string; color?: string; paletteName?: string };
  return (
    palette.paletteName === WATER_PLUME_PALETTE.paletteName &&
    palette.style === WATER_PLUME_PALETTE.style &&
    palette.color?.toLowerCase() === WATER_PLUME_PALETTE.color.toLowerCase()
  );
}

export function sliderPercentFor(o: Opt, value: number): number {
  const range = (o.desc ?? "").match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const lo = range ? parseFloat(range[1]) : 0;
  const hi = range ? parseFloat(range[2]) : 100;
  if (hi === lo) return 0;
  return Math.round(((value - lo) / (hi - lo)) * 100);
}

/** Unset Water Surfaces fields use the Plume catalog default. Spill and Current swap in their own until the control is moved. */
export function waterSurfaceModeDefault(visualId: string, mode: unknown, o: Opt): unknown {
  if (visualId !== "water-surfaces") return undefined;
  if (mode === "Current" && o.group === "Surface Style" && o.name === "Opacity") return sliderPercentFor(o, 0.3);
  if (mode === "Spill" && o.group === "Stems" && o.name === "Max height") return sliderPercentFor(o, 24000);
  if (mode === "Spill" && o.group === "Stems" && o.name === "Fade start zoom") return sliderPercentFor(o, 7);
  if (mode === "Spill" && o.group === "Stems" && o.name === "Hidden by zoom") return sliderPercentFor(o, 9.5);
  if (mode === "Current" && o.group === "Color" && o.name === "Palette") return WATER_CURRENT_PALETTE;
  if (mode === "Spill" && o.group === "Color" && o.name === "Palette") return WATER_SPILL_PALETTE;
  return undefined;
}

export function defaultFor(o: Opt, visualId?: string): unknown {
  if (o.defaultValue !== undefined) return o.defaultValue;
  switch (o.type) {
    case "toggle":
      return o.def !== false;
    case "segmented":
      return o.values[0] ?? "";
    case "posgrid":
      return "top-left";
    case "slider":
      return defaultSlider(o);
    case "margins":
      return defaultMargins();
    case "number":
      return o.name.toLowerCase().includes("range") ? "" : "24";
    case "color":
      return isPaletteField(o)
        ? {
            ...DEFAULT_COLOR_MODE,
            gradientAxis: defaultGradientAxisForVisual(visualId ?? "vertical-bar"),
            stops: DEFAULT_COLOR_MODE.stops.map((s) => ({ ...s })),
          }
        : "#3FA7A0";
    case "colorList":
      return defaultColorList(o);
    case "colorPair":
      return { stroke: "#3FA7A0", fill: "#3FA7A0" };
    case "multi":
      return defaultMulti(o);
    case "repeatable":
      if (isZoomScalingField(o)) return { ...DEFAULT_ZOOM_SCALING, stops: DEFAULT_ZOOM_SCALING.stops.map((s) => ({ ...s })) };
      if (o.name === "Color thresholds" || o.name.toLowerCase().includes("status")) {
        return [
          { min: "", max: "", color: "#f87171", label: "At risk", opacity: 100 },
          { min: "", max: "", color: "#fbbf24", label: "Watch", opacity: 100 },
          { min: "", max: "", color: "#34d399", label: "On track", opacity: 100 },
        ];
      }
      return DEFAULT_REPEATABLE.map((r) => ({ ...r }));
    case "gradient":
      return DEFAULT_GRADIENT.map((r) => ({ ...r }));
    case "dropdown":
      return o.values[0] ?? "";
    case "field":
      return "";
    case "text":
    default:
      return "";
  }
}

/** Physical range of a slider, parsed from its catalog description. */
export function sliderScale(o: Opt): { lo: number; hi: number; ticks: number; step: number; unit: string } {
  const desc = o.desc ?? "";
  const range = desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const stepMatch = desc.match(/step\s+(-?\d*\.?\d+)/i);
  const lo = range ? parseFloat(range[1]) : 0;
  const hi = range ? parseFloat(range[2]) : 100;
  const span = hi - lo;
  let unit = "";
  if (/%/.test(desc)) unit = "%";
  else if (/\bpx\b/i.test(desc)) unit = "px";
  else if (desc.includes("°")) unit = "°";
  else if (/\(m\)/i.test(o.name) || /\bm\b/i.test(desc)) unit = "m";

  let step = stepMatch ? parseFloat(stepMatch[1]) : 0;
  /* 0–1 ranges are continuous (opacity/ratio), not a 2-stop toggle. */
  if (!step && Number.isInteger(lo) && Number.isInteger(hi) && span > 1 && span <= 12) step = 1;
  const ticks = step > 0 && span > 0 ? Math.round(span / step) + 1 : 0;
  return { lo, hi, ticks: ticks >= 2 && ticks <= 12 ? ticks : 0, step, unit };
}

export function sliderValue(o: Opt, pct: number): number {
  const { lo, hi, ticks, step } = sliderScale(o);
  const t = Math.max(0, Math.min(100, pct)) / 100;
  if (ticks >= 2) {
    const idx = Math.round(t * (ticks - 1));
    return lo + (idx / (ticks - 1)) * (hi - lo);
  }
  const raw = lo + t * (hi - lo);
  return step > 0 ? Math.min(hi, lo + Math.round((raw - lo) / step) * step) : raw;
}

export function sliderDisplay(o: Opt, pct: number) {
  const { lo, hi, ticks, step, unit } = sliderScale(o);
  const val = sliderValue(o, pct);
  const stepDecimals = step > 0 && step < 1 ? Math.min(2, String(step).split(".")[1]?.length ?? 0) : 0;
  const decimals = hi <= 1 ? 2 : stepDecimals || (ticks && (hi - lo) / (ticks - 1) < 1 ? 1 : 0);
  const formatted = decimals === 0 ? String(Math.round(val)) : val.toFixed(decimals);
  if (!unit) return formatted;
  return unit === "°" || unit === "%" ? `${formatted}${unit}` : `${formatted} ${unit}`;
}

/**
 * Stored slider value → percent of the slider track.
 * The editor stores a number as a track percentage; a non-empty string is a
 * physical value typed by hand (e.g. "275").
 */
export function sliderStoredPercent(o: Opt, raw: unknown): number {
  const scale = sliderScale(o);
  const n = Number(raw);
  if (typeof raw === "string" && raw.trim() !== "" && scale.hi !== scale.lo) {
    return ((n - scale.lo) / (scale.hi - scale.lo)) * 100;
  }
  return Number.isFinite(n) ? n : defaultSlider(o);
}

/** Stored slider value → physical value in the slider's own unit. */
export function sliderPhysical(o: Opt, raw: unknown): number {
  return sliderValue(o, sliderStoredPercent(o, raw));
}

export function isValueFilled(o: Opt, value: unknown): boolean {
  if (o.type === "toggle") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (value && typeof value === "object") return Object.keys(value as object).length > 0;
  return value !== undefined && value !== null && value !== "";
}

/** The editor's `getVal`: stored value, legacy alias, or the resolved default. */
export function resolveFieldValue(o: Opt, config: Config, visualId: string): unknown {
  const currentKey = keyOf(o);
  const legacyKey = LEGACY_SETTING_KEYS[currentKey];
  const v = config[currentKey] ?? (legacyKey !== undefined ? config[legacyKey] : undefined);
  if (o.type === "field" && o.level === "required" && !isValueFilled(o, v)) {
    return defaultFor(o, visualId);
  }
  const modeDefault = waterSurfaceModeDefault(visualId, config["Surface Style::Mode"], o);
  if (v === undefined || (o.group === "Color" && o.name === "Palette" && isUntouchedPlumePalette(v))) {
    return modeDefault !== undefined ? modeDefault : defaultFor(o, visualId);
  }
  return v;
}

/** The editor's `resolvedConfig`: every catalog key present, unset keys defaulted. */
export function resolveConfigDefaults(fields: Opt[], config: Config, visualId: string): Config {
  const next: Config = { ...config };
  for (const o of fields) {
    const k = keyOf(o);
    const legacyKey = LEGACY_SETTING_KEYS[k];
    if (next[k] === undefined && legacyKey !== undefined && config[legacyKey] !== undefined) {
      next[k] = config[legacyKey];
    }
    if (next[k] === undefined || (o.type === "field" && o.level === "required" && !isValueFilled(o, next[k]))) {
      next[k] = defaultFor(o, visualId);
    }
  }
  return next;
}
