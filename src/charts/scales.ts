/**
 * Value domains and tick planning. Domains come from every valid value of
 * every relevant series (including stacked extents). Manual bounds are
 * honored when valid and their clipping is reported.
 */

import { scaleLinear, scaleUtc } from "d3-scale";

export type DomainInput = {
  values: (number | null)[];
  /** Filled magnitude marks (bars, areas, progress) must start at zero. */
  includeZero: boolean;
  /** Fractional padding for unanchored domains (line/scatter). */
  padding?: number;
  manual?: { min: number | null; max: number | null } | null;
  nice?: boolean;
};

export type DomainResult = {
  domain: [number, number];
  /** Count of valid values outside a manual domain. */
  clipped: number;
  issues: string[];
  manualApplied: boolean;
  empty: boolean;
};

export function parseManualRange(raw: unknown): { min: number | null; max: number | null; raw: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^\s*(-?\d*\.?\d*(?:e[-+]?\d+)?)\s*(?:\/|,|–|—|\s-\s)\s*(-?\d*\.?\d*(?:e[-+]?\d+)?)\s*$/i);
  const parse = (p: string | undefined) => {
    if (p === undefined || p.trim() === "" || p === "-") return null;
    const n = Number(p);
    return Number.isFinite(n) ? n : null;
  };
  if (m) return { min: parse(m[1]), max: parse(m[2]), raw: s };
  const n = Number(s);
  return Number.isFinite(n) ? { min: n, max: null, raw: s } : { min: null, max: null, raw: s };
}

export function computeDomain({ values, includeZero, padding = 0, manual, nice = true }: DomainInput): DomainResult {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const issues: string[] = [];
  let lo = valid.length ? Math.min(...valid) : 0;
  let hi = valid.length ? Math.max(...valid) : 1;
  const empty = valid.length === 0;
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    if (includeZero && lo === 0) hi = 1;
    else if (includeZero && lo > 0) lo = 0;
    else if (includeZero && hi < 0) hi = 0;
    else {
      lo -= pad;
      hi += pad;
    }
  } else if (padding > 0 && !includeZero) {
    const span = hi - lo;
    lo -= span * padding;
    hi += span * padding;
  }
  let domain: [number, number] = [lo, hi];
  if (nice) {
    const s = scaleLinear().domain(domain).nice(5);
    domain = s.domain() as [number, number];
  }
  let manualApplied = false;
  let clipped = 0;
  if (manual && (manual.min !== null || manual.max !== null)) {
    const mMin = manual.min ?? domain[0];
    const mMax = manual.max ?? domain[1];
    if (mMin > mMax) {
      issues.push(`Manual range ignored: minimum ${mMin} is greater than maximum ${mMax}.`);
    } else if (mMin === mMax) {
      issues.push(`Manual range ignored: minimum and maximum are both ${mMin}.`);
    } else {
      domain = [mMin, mMax];
      manualApplied = true;
      clipped = valid.filter((v) => v < mMin || v > mMax).length;
      if (clipped) issues.push(`${clipped} value${clipped === 1 ? "" : "s"} outside the manual range ${mMin}–${mMax} ${clipped === 1 ? "is" : "are"} clipped.`);
      if (includeZero && (mMin > 0 || mMax < 0)) {
        issues.push("Manual range excludes zero, so bar lengths are measured from the range edge, not from zero.");
      }
    }
  }
  return { domain, clipped, issues, manualApplied, empty };
}

export type TickPlan = {
  values: number[];
  requested: number | "auto";
  effective: number;
  reason?: string;
};

/**
 * Pick numeric tick values for an axis of `lengthPx`, keeping at least
 * `minSpacingPx` between ticks. Explicit counts are honored when they fit.
 */
export function planNumericTicks(
  domain: [number, number],
  lengthPx: number,
  { requested, minSpacingPx, endpointsOnly }: { requested: number; minSpacingPx: number; endpointsOnly: boolean },
): TickPlan {
  if (endpointsOnly) {
    return { values: [domain[0], domain[1]], requested: requested || "auto", effective: 2 };
  }
  const fit = Math.max(2, Math.floor(lengthPx / Math.max(minSpacingPx, 1)) + 1);
  const s = scaleLinear().domain(domain);
  if (requested > 0) {
    if (requested <= fit) {
      return { values: evenTicks(domain, requested), requested, effective: requested };
    }
    return {
      values: evenTicks(domain, fit),
      requested,
      effective: fit,
      reason: `Requested ${requested} ticks; ${fit} fit without overlapping at ${Math.round(lengthPx)}px.`,
    };
  }
  let values = s.ticks(Math.min(fit, 8));
  if (values.length > fit) values = s.ticks(Math.max(2, fit - 1));
  values = values.filter((v) => v >= Math.min(...domain) - 1e-9 && v <= Math.max(...domain) + 1e-9);
  if (values.length < 2) values = [domain[0], domain[1]];
  return { values, requested: "auto", effective: values.length };
}

/**
 * Widens an automatic domain so `count` evenly spaced ticks land on round values
 * (1, 2, 2.5, 5 × 10ⁿ steps). A zero edge stays at zero. Manual bounds never pass through here.
 */
export function niceDomainForCount(domain: [number, number], count: number): [number, number] {
  const [d0, d1] = domain;
  if (count < 2 || !(d1 > d0)) return domain;
  const raw = (d1 - d0) / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (let k = 0; k < 8; k++) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * mag * Math.pow(10, k);
      if (step < raw - 1e-12) continue;
      let start = Math.floor(d0 / step + 1e-9) * step;
      if (d0 >= 0 && start < 0) start = 0;
      const end = start + step * (count - 1);
      if (end >= d1 - 1e-9) return [Number(start.toPrecision(12)), Number(end.toPrecision(12))];
    }
  }
  return domain;
}

function evenTicks(domain: [number, number], count: number): number[] {
  if (count <= 1) return [domain[0]];
  return Array.from({ length: count }, (_, i) => {
    const v = domain[0] + ((domain[1] - domain[0]) * i) / (count - 1);
    return Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12));
  });
}

export function planTimeTicks(domain: [number, number], lengthPx: number, minSpacingPx: number, requested: number) {
  const fit = Math.max(2, Math.floor(lengthPx / Math.max(minSpacingPx, 1)));
  const count = requested > 0 ? Math.min(requested, fit) : Math.min(fit, 7);
  const s = scaleUtc().domain(domain.map((d) => new Date(d)));
  const ticks = s.ticks(count).map((d) => d.getTime());
  const fmt = s.tickFormat(count);
  return {
    values: ticks,
    format: (ms: number) => fmt(new Date(ms)),
    requested: requested || ("auto" as const),
    effective: ticks.length,
    reason:
      requested > fit
        ? `Requested ${requested} ticks; ${fit} fit without overlapping at ${Math.round(lengthPx)}px.`
        : undefined,
  };
}

/** Choose a subset of category indices whose labels do not collide. */
export function thinCategoryLabels(widths: number[], slotPx: number, gapPx = 6): { indices: number[]; step: number } {
  if (!widths.length) return { indices: [], step: 1 };
  const maxW = Math.max(...widths);
  const step = Math.max(1, Math.ceil((maxW + gapPx) / Math.max(slotPx, 1)));
  const indices: number[] = [];
  for (let i = 0; i < widths.length; i += step) indices.push(i);
  if (step > 1 && indices[indices.length - 1] !== widths.length - 1) {
    const last = widths.length - 1;
    if ((last - indices[indices.length - 1]) * slotPx >= maxW + gapPx) indices.push(last);
  }
  return { indices, step };
}

/**
 * Scatter point radius. Area (not radius) grows linearly with the size value
 * above a minimum legible area, so a point twice the value adds twice the ink.
 */
export function scatterRadius(size: number | null | undefined, sizeDomain: [number, number] | null, minR: number, maxR: number): number {
  if (size == null || !sizeDomain || sizeDomain[1] <= 0) return minR;
  const t = Math.max(0, Math.min(1, size / sizeDomain[1]));
  return Math.sqrt(minR ** 2 + (maxR ** 2 - minR ** 2) * t);
}
