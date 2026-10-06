import { describe, expect, it } from "vitest";
import { aggregate, aggregationFromLabel, parseNumber, parseTime } from "../data/values";
import { computeDomain, parseManualRange, planNumericTicks, thinCategoryLabels } from "../scales";
import { compileSpec, distinctTickLabels, formatByNotation, guardPrecision, numberFormatter } from "../format";
import { assignIdentities, DASHES, seriesColors, CATEGORICAL } from "../identity";
import { legendShares } from "../derive/common";
import { DEFAULT_COLOR_MODE } from "../../previewTheme";

describe("parseNumber keeps missing, invalid and zero distinct", () => {
  it("reads numbers and numeric text", () => {
    expect(parseNumber(3)).toEqual({ status: "ok", value: 3 });
    expect(parseNumber(" 1,234.5 ")).toEqual({ status: "ok", value: 1234.5 });
    expect(parseNumber("-2e3").value).toBe(-2000);
    expect(parseNumber(0)).toEqual({ status: "ok", value: 0 });
  });
  it("never coerces unreadable values to zero", () => {
    expect(parseNumber(null).status).toBe("missing");
    expect(parseNumber("").status).toBe("missing");
    expect(parseNumber("n/a").status).toBe("invalid");
    expect(parseNumber("12abc").status).toBe("invalid");
    expect(parseNumber(true).status).toBe("invalid");
    expect(parseNumber(NaN).status).toBe("invalid");
    expect(parseNumber("n/a").value).toBeNull();
  });
});

describe("parseTime", () => {
  it("reads ISO months and dates in UTC", () => {
    expect(parseTime("2024-03")).toBe(Date.UTC(2024, 2, 1));
    expect(parseTime("2024-03-05")).toBe(Date.UTC(2024, 2, 5));
    expect(parseTime("2024-03-05T10:00")).toBe(Date.UTC(2024, 2, 5, 10));
    expect(parseTime("March")).toBeNull();
  });
});

describe("aggregate", () => {
  it("skips nulls and returns null for all-missing groups", () => {
    expect(aggregate([1, null, 3], "sum")).toBe(4);
    expect(aggregate([1, null, 3], "average")).toBe(2);
    expect(aggregate([null, null], "sum")).toBeNull();
    expect(aggregate([null, null], "average")).toBeNull();
  });
  it("count counts rows including missing values", () => {
    expect(aggregate([null, 2, null], "count")).toBe(3);
  });
  it("maps catalog labels", () => {
    expect(aggregationFromLabel("None (raw value)")).toBe("raw");
    expect(aggregationFromLabel("Average")).toBe("average");
    expect(aggregationFromLabel("Count")).toBe("count");
  });
});

describe("computeDomain", () => {
  it("includes zero for bars and covers negatives", () => {
    expect(computeDomain({ values: [5, 9], includeZero: true }).domain[0]).toBe(0);
    const d = computeDomain({ values: [-4, 9], includeZero: true }).domain;
    expect(d[0]).toBeLessThanOrEqual(-4);
    expect(d[1]).toBeGreaterThanOrEqual(9);
  });
  it("pads unanchored line domains instead of forcing zero", () => {
    const d = computeDomain({ values: [100, 120], includeZero: false, padding: 0.06 }).domain;
    expect(d[0]).toBeGreaterThan(0);
    expect(d[0]).toBeLessThan(100);
  });
  it("expands equal and all-zero extents", () => {
    expect(computeDomain({ values: [0, 0], includeZero: true }).domain).toEqual([0, 1]);
    const c = computeDomain({ values: [42, 42], includeZero: false }).domain;
    expect(c[0]).toBeLessThan(42);
    expect(c[1]).toBeGreaterThan(42);
  });
  it("reports empty input", () => {
    expect(computeDomain({ values: [null], includeZero: false }).empty).toBe(true);
  });
  it("honors manual bounds and counts clipped values", () => {
    const r = computeDomain({ values: [5, 50, 150], includeZero: false, manual: { min: 0, max: 100 } });
    expect(r.domain).toEqual([0, 100]);
    expect(r.clipped).toBe(1);
    expect(r.issues[0]).toMatch(/clipped/);
  });
  it("ignores inverted or equal manual bounds with an issue", () => {
    const inv = computeDomain({ values: [5, 9], includeZero: false, manual: { min: 10, max: 0 } });
    expect(inv.manualApplied).toBe(false);
    expect(inv.issues[0]).toMatch(/ignored/);
    const eq = computeDomain({ values: [5, 9], includeZero: false, manual: { min: 3, max: 3 } });
    expect(eq.manualApplied).toBe(false);
  });
  it("parses the editor's min / max format", () => {
    expect(parseManualRange("0 / 100")).toMatchObject({ min: 0, max: 100 });
    expect(parseManualRange(" / 100")).toMatchObject({ min: null, max: 100 });
    expect(parseManualRange("-5 / 5")).toMatchObject({ min: -5, max: 5 });
    expect(parseManualRange("")).toBeNull();
  });
});

describe("ticks", () => {
  it("reduces requested tick counts that do not fit and reports why", () => {
    const p = planNumericTicks([0, 100], 60, { requested: 10, minSpacingPx: 20, endpointsOnly: false });
    expect(p.effective).toBeLessThan(10);
    expect(p.reason).toMatch(/Requested 10/);
  });
  it("endpoints only", () => {
    expect(planNumericTicks([0, 80], 300, { requested: 0, minSpacingPx: 20, endpointsOnly: true }).values).toEqual([0, 80]);
  });
  it("raises precision when labels collide", () => {
    const { labels, raisedPrecision } = distinctTickLabels([0.1, 0.2, 0.3], (n) => String(Math.round(n)));
    expect(new Set(labels).size).toBe(3);
    expect(raisedPrecision).toBe(true);
  });
  it("thins category labels that would overlap", () => {
    const r = thinCategoryLabels([40, 40, 40, 40, 40, 40], 20);
    expect(r.step).toBeGreaterThan(1);
  });
});

describe("format", () => {
  it("compact and full notation", () => {
    expect(formatByNotation(5_700_000, "compact")).toBe("5.7M");
    expect(formatByNotation(5_700_000, "full")).toBe("5,700,000");
  });
  it("D3 specs and invalid specs", () => {
    expect(compileSpec(".2f").ok).toBe(true);
    expect(compileSpec("not a spec").ok).toBe(false);
  });
  it("non-default tick formatter overrides Format", () => {
    const f = numberFormatter({ notation: "compact", spec: ".3f", preset: "Rounded number" });
    expect(f.source).toBe("preset");
    expect(f.format(12.345)).toBe("12");
  });
  it("never displays a non-zero value as zero", () => {
    expect(guardPrecision(0.004, (n) => n.toFixed(0))).not.toBe("0");
    expect(numberFormatter({ notation: "compact", spec: ".0f" }).format(0.3)).toBe("0.3");
  });
});

describe("identity", () => {
  it("assigns stable colors by first appearance and dashes beyond the palette", () => {
    const keys = Array.from({ length: 50 }, (_, i) => `S${i}`);
    const ids = assignIdentities(keys, null, seriesColors(null, keys).colors);
    expect(ids[0].color).toBe(CATEGORICAL[0]);
    expect(ids[8].color).toBe(CATEGORICAL[0]);
    expect(ids[8].dash).toBe(DASHES[1]);
    const combos = new Set(ids.map((i) => `${i.color}|${i.dash}|${i.marker}`));
    expect(combos.size).toBe(50);
  });
  it("Single color cannot encode several series, so they fall back to the categorical palette", () => {
    const r = seriesColors({ ...DEFAULT_COLOR_MODE, style: "Single" }, ["a", "b", "c"]);
    expect(new Set(r.colors).size).toBe(3);
    expect(r.note).toMatch(/categorical/);
  });
});

describe("legend percentages", () => {
  it("share one denominator and withhold invalid cases", () => {
    const ok = legendShares([{ id: "a", stat: 1 }, { id: "b", stat: 3 }], true);
    expect(ok.shares.get("b")).toBe(0.75);
    expect(legendShares([{ id: "a", stat: 0 }, { id: "b", stat: 0 }], true).reason).toMatch(/zero/);
    expect(legendShares([{ id: "a", stat: -1 }, { id: "b", stat: 3 }], true).reason).toMatch(/negative/);
    expect(legendShares([{ id: "a", stat: 1 }], false).reason).toMatch(/averages/);
  });
});
