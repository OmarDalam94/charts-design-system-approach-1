/**
 * Reads a persisted asset configuration (`group::name` keys) for one visual.
 * Defaults come from the editor's own resolution (settingsDefaults), slider
 * values are converted from stored track percentages to physical units, and
 * every read is recorded so coverage can tell bound settings from unbound ones.
 */

import type { Opt } from "../chartModel";
import { fieldsForVisual, isFieldVisible } from "../visualSettingsCatalog";
import {
  keyOf,
  resolveConfigDefaults,
  sliderPhysical,
  sliderScale,
  type Config,
} from "../settingsDefaults";
import { asColorMode, asColorPair, asRepeatable, asStringArray, type ColorModeConfig, type RepeatableRow } from "../previewTheme";

export type { Config };

export class SettingsReader {
  readonly visualId: string;
  readonly fields: Opt[];
  readonly stored: Config;
  readonly resolved: Config;
  readonly reads = new Set<string>();
  private byKey: Map<string, Opt>;

  constructor(visualId: string, config: Config) {
    this.visualId = visualId;
    this.fields = fieldsForVisual(visualId);
    this.stored = config;
    this.resolved = resolveConfigDefaults(this.fields, config, visualId);
    this.byKey = new Map(this.fields.map((o) => [keyOf(o), o]));
  }

  field(group: string, name: string): Opt | undefined {
    return this.byKey.get(`${group}::${name}`);
  }

  has(group: string, name: string): boolean {
    return this.byKey.has(`${group}::${name}`);
  }

  /** True when the user stored a value (not a resolved default). */
  isExplicit(group: string, name: string): boolean {
    return this.stored[`${group}::${name}`] !== undefined;
  }

  /** Whether the editor would currently show this field (conditions and feature masters). */
  isVisible(group: string, name: string): boolean {
    const o = this.field(group, name);
    if (!o) return false;
    return isFieldVisible(o, (g, n) => this.peek(g, n));
  }

  private peek(group: string, name: string): unknown {
    return this.resolved[`${group}::${name}`] ?? "";
  }

  raw(group: string, name: string): unknown {
    const key = `${group}::${name}`;
    if (this.byKey.has(key)) this.reads.add(key);
    return this.resolved[key];
  }

  bool(group: string, name: string, fallback = false): boolean {
    if (!this.has(group, name)) return fallback;
    const v = this.raw(group, name);
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return fallback;
  }

  str(group: string, name: string, fallback = ""): string {
    if (!this.has(group, name)) return fallback;
    const v = this.raw(group, name);
    return typeof v === "string" ? v.trim() : v === undefined || v === null ? fallback : String(v);
  }

  list(group: string, name: string): string[] {
    if (!this.has(group, name)) return [];
    return asStringArray(this.raw(group, name));
  }

  /** Slider in its physical unit (px, %, ratio, count). */
  slider(group: string, name: string, fallback = 0): number {
    const o = this.field(group, name);
    if (!o) return fallback;
    return sliderPhysical(o, this.raw(group, name));
  }

  sliderUnit(group: string, name: string): string {
    const o = this.field(group, name);
    return o ? sliderScale(o).unit : "";
  }

  /** Free-text or number control parsed as a number; null when blank or invalid. */
  num(group: string, name: string): number | null {
    if (!this.has(group, name)) return null;
    const v = this.raw(group, name);
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** Mapped column name, or "" when unmapped. */
  column(name: string): string {
    return this.str("Mapping", name);
  }

  palette(group = "Colors"): ColorModeConfig {
    return asColorMode(this.raw(group, "Palette"));
  }

  colorPair(group: string, name: string) {
    return asColorPair(this.raw(group, name));
  }

  rows(group: string, name: string): RepeatableRow[] {
    return asRepeatable(this.raw(group, name));
  }

  /** Stored color, or null when the value is the untouched catalog default. */
  explicitColor(group: string, name: string): string | null {
    if (!this.has(group, name)) return null;
    const v = this.raw(group, name);
    if (!this.isExplicit(group, name)) return null;
    const o = this.field(group, name);
    if (o?.defaultValue !== undefined && String(o.defaultValue).toLowerCase() === String(v).toLowerCase()) return null;
    return typeof v === "string" && v ? v : null;
  }
}

/** A requested setting value next to the value the layout actually used. */
export type Adaptation = {
  id: string;
  setting?: string;
  requested?: string;
  effective?: string;
  reason: string;
};

export type ConflictNote = {
  settings: string[];
  resolution: string;
};
