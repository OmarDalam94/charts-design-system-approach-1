/**
 * Number and time formatting. Locale en-US, time zone UTC.
 *
 * Precedence for axis tick labels:
 *   1. Tick label formatter (any value other than "Default")
 *   2. Format (D3 format specifier)
 *   3. Number notation (Compact / Full)
 * Formatting never changes the raw value; callers keep it for data views.
 */

import { format as d3format, formatSpecifier } from "d3-format";
import { utcFormat } from "d3-time-format";

export const CHART_LOCALE = "en-US";
export const CHART_TIME_ZONE = "UTC";

export type Notation = "compact" | "full";

export function notationFromLabel(label: unknown): Notation {
  return String(label ?? "").toLowerCase().startsWith("full") ? "full" : "compact";
}

const compactFmt = new Intl.NumberFormat(CHART_LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const fullFmt = new Intl.NumberFormat(CHART_LOCALE, { maximumFractionDigits: 2 });

export function formatByNotation(n: number, notation: Notation): string {
  if (!Number.isFinite(n)) return "—";
  if (notation === "full") return fullFmt.format(n);
  if (Math.abs(n) < 1 && n !== 0) {
    return new Intl.NumberFormat(CHART_LOCALE, { maximumSignificantDigits: 2 }).format(n);
  }
  return compactFmt.format(n);
}

export type SpecResult = { ok: true; fn: (n: number) => string } | { ok: false; reason: string };

const specCache = new Map<string, SpecResult>();

/** Compile a D3 format specifier, reporting invalid input instead of throwing. */
export function compileSpec(spec: string): SpecResult {
  const s = spec.trim();
  const cached = specCache.get(s);
  if (cached) return cached;
  let result: SpecResult;
  try {
    formatSpecifier(s);
    const fn = d3format(s);
    result = { ok: true, fn: (n: number) => fn(n).replace("−", "-") };
  } catch {
    result = { ok: false, reason: `“${s}” is not a valid D3 format; using Number notation.` };
  }
  specCache.set(s, result);
  return result;
}

export const TICK_FORMATTER_PRESETS = [
  "Default",
  "Compact number",
  "Rounded number",
  "Decimal comma",
  "Time only",
  "Date",
  "Month & year",
  "Date & time",
] as const;

const TIME_PRESETS: Record<string, string> = {
  "Time only": "%H:%M",
  Date: "%b %-d, %Y",
  "Month & year": "%b %Y",
  "Date & time": "%b %-d %H:%M",
};

export function isTimePreset(preset: string): boolean {
  return preset in TIME_PRESETS;
}

export function formatTime(ms: number, preset?: string): string {
  if (!Number.isFinite(ms)) return "—";
  const spec = preset && TIME_PRESETS[preset] ? TIME_PRESETS[preset] : "%b %-d, %Y";
  return utcFormat(spec)(new Date(ms));
}

export function formatTimeExact(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
  return utcFormat(hasTime ? "%Y-%m-%d %H:%M UTC" : "%Y-%m-%d")(d);
}

export type NumberFormatOptions = {
  notation: Notation;
  /** D3 specifier from Format / Tooltip format. Empty = none. */
  spec?: string;
  /** Tick label formatter preset; non-Default overrides spec. */
  preset?: string;
  /** Unit suffix appended after formatting. */
  unit?: string;
};

export type NumberFormatter = {
  format: (n: number | null) => string;
  /** Which rule produced the output, for disclosure. */
  source: "preset" | "spec" | "notation";
  issue?: string;
};

function withUnit(text: string, unit?: string): string {
  if (!unit) return text;
  return /^[%°]/.test(unit) ? `${text}${unit}` : `${text} ${unit}`;
}

export function numberFormatter({ notation, spec, preset, unit }: NumberFormatOptions): NumberFormatter {
  if (preset && preset !== "Default" && !isTimePreset(preset)) {
    const fn =
      preset === "Compact number"
        ? (n: number) => formatByNotation(n, "compact")
        : preset === "Rounded number"
          ? (n: number) => new Intl.NumberFormat(CHART_LOCALE, { maximumFractionDigits: 0 }).format(n)
          : (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
    return { source: "preset", format: (n) => (n === null ? "—" : withUnit(guardPrecision(n, fn), unit)) };
  }
  if (spec && spec.trim()) {
    const compiled = compileSpec(spec);
    if (compiled.ok) {
      return { source: "spec", format: (n) => (n === null ? "—" : withUnit(guardPrecision(n, compiled.fn), unit)) };
    }
    return {
      source: "notation",
      issue: compiled.reason,
      format: (n) => (n === null ? "—" : withUnit(formatByNotation(n, notation), unit)),
    };
  }
  return { source: "notation", format: (n) => (n === null ? "—" : withUnit(formatByNotation(n, notation), unit)) };
}

/**
 * A non-zero value must not display as zero. When the requested format
 * rounds it away, fall back to two significant digits.
 */
export function guardPrecision(n: number, fn: (n: number) => string): string {
  const out = fn(n);
  if (n !== 0 && /^[-+]?[$€£]?0([.,]0+)?[%a-zA-Z]*$/.test(out.trim())) {
    return new Intl.NumberFormat(CHART_LOCALE, { maximumSignificantDigits: 2 }).format(n);
  }
  return out;
}

/** Exact representation for data views and accessible text. */
export function formatExact(n: number | null): string {
  if (n === null) return "No value";
  if (!Number.isFinite(n)) return "Invalid";
  return new Intl.NumberFormat(CHART_LOCALE, { maximumFractionDigits: 10 }).format(n);
}

/**
 * Format tick values, increasing precision until distinct values have
 * distinct labels. Returns the labels and whether precision was raised.
 */
export function distinctTickLabels(
  values: number[],
  base: (n: number) => string,
): { labels: string[]; raisedPrecision: boolean } {
  const labels = values.map(base);
  if (new Set(labels).size === new Set(values).size) return { labels, raisedPrecision: false };
  for (let digits = 1; digits <= 6; digits++) {
    const fmt = new Intl.NumberFormat(CHART_LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    const next = values.map((v) => fmt.format(v));
    if (new Set(next).size === new Set(values).size) return { labels: next, raisedPrecision: true };
  }
  return { labels: values.map((v) => formatExact(v)), raisedPrecision: true };
}

export type ValueFormatKind = "Number" | "Currency (USD)" | "Percentage" | "Duration (minutes)";

/** KPI Card Value format. Percentage treats the value as already in percent units. */
export function formatKpiValue(n: number | null, kind: string, notation: Notation): string {
  if (n === null) return "—";
  if (kind.startsWith("Currency")) {
    const body = notation === "compact" && Math.abs(n) >= 1000
      ? new Intl.NumberFormat(CHART_LOCALE, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n)
      : new Intl.NumberFormat(CHART_LOCALE, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
    return body;
  }
  if (kind.startsWith("Percentage")) return `${formatByNotation(n, notation)}%`;
  if (kind.startsWith("Duration")) {
    const sign = n < 0 ? "-" : "";
    const total = Math.abs(n);
    const h = Math.floor(total / 60);
    const m = Math.round(total - h * 60);
    return h ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
  }
  return formatByNotation(n, notation);
}
