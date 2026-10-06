import { describe, expect, it } from "vitest";
import { buildChartModel } from "../build";
import { evaluateExpression, renderTemplate } from "../expr";
import { makeFixture } from "../fixtures";

const ctx = { value: 95, previous: 80, status: "On track", "Completion rate (%)": 91, target: 90, active: true, empty: null };
const ev = (s: string) => evaluateExpression(s, ctx);

describe("flag expressions", () => {
  it("evaluates arithmetic with precedence", () => {
    expect(ev("1 + 2 * 3")).toMatchObject({ ok: true, value: 7 });
    expect(ev("(1 + 2) * 3")).toMatchObject({ ok: true, value: 9 });
    expect(ev("-value + 100")).toMatchObject({ ok: true, value: 5 });
    expect(ev(".5 * 4")).toMatchObject({ ok: true, value: 2 });
  });

  it("compares numbers, strings (case-insensitive) and booleans", () => {
    expect(ev("value > 90 && status == 'on track'")).toMatchObject({ ok: true, value: true });
    expect(ev("status != \"Watch\"")).toMatchObject({ ok: true, value: true });
    expect(ev("active && !empty")).toMatchObject({ ok: true, value: true });
  });

  it("supports braced names and functions", () => {
    expect(ev("{Completion rate (%)} >= target")).toMatchObject({ ok: true, value: true });
    expect(ev("round(abs(value - previous) / max(previous, 1) * 100, 1)")).toMatchObject({ ok: true, value: 18.8 });
  });

  it("reports unknown names instead of guessing", () => {
    expect(ev("revenue > 1")).toMatchObject({ ok: false, missing: ["revenue"] });
  });

  it("reports syntax errors", () => {
    expect(ev("value >").ok).toBe(false);
    expect(ev("value > 'x").ok).toBe(false);
    expect(ev("nope(1)").ok).toBe(false);
  });

  it("division by zero is null, not Infinity", () => {
    expect(ev("value / 0")).toMatchObject({ ok: true, value: null });
  });

  it("renders tooltip templates", () => {
    expect(renderTemplate("Up {round((value - previous) / previous * 100)}%", ctx).text).toBe("Up 19%");
  });
});

describe("flags use expressions end to end", () => {
  const fx = makeFixture("line-chart", "normal");
  const flag = (property: string) => ({ label: "Hot", conditionJoin: "AND", conditions: [{ propertyMode: "expression", property, operator: "is true", valueMode: "string", value: "" }], tooltipMode: "expression", tooltipInsight: "'Value ' + value" });
  const build = (property: string, value: number) => buildChartModel({ visualId: "line-chart", dataset: fx.dataset, config: { ...fx.mapping, "Flags::Positive Flag": flag(property) }, assetContext: { value } });

  it("shows the flag only when the expression holds", () => {
    expect(build("value * 2 > 100", 95).header.flags).toEqual([{ kind: "positive", label: "Hot", tooltip: "Value 95" }]);
    expect(build("value * 2 > 100", 10).header.flags).toEqual([]);
  });

  it("an invalid expression hides the flag and raises a data note", () => {
    const m = build("value * > 100", 95);
    expect(m.header.flags).toEqual([]);
    expect(m.issues.some((i) => i.id.startsWith("flag-expr:"))).toBe(true);
  });

  it("expression values compare against the property", () => {
    const m = buildChartModel({
      visualId: "line-chart",
      dataset: fx.dataset,
      config: { ...fx.mapping, "Flags::Negative Flag": { label: "Below target", conditions: [{ propertyMode: "select", property: "value", operator: "is less than", valueMode: "expression", value: "target - 5" }] } },
      assetContext: { value: 80, target: 90 },
    });
    expect(m.header.flags.map((f) => f.label)).toEqual(["Below target"]);
  });
});
