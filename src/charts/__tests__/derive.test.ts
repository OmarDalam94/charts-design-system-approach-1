import { describe, expect, it } from "vitest";
import { CHART_ASSETS } from "../assets";
import { buildChartModel } from "../build";
import { FIXTURE_VARIANTS, makeFixture } from "../fixtures";
import type { CartesianModel, DonutModel, KpiGridModel, TableModel } from "../model";

function model(visualId: string, variant: Parameters<typeof makeFixture>[1] = "normal", config: Record<string, unknown> = {}, opts = {}) {
  const fx = makeFixture(visualId, variant, opts);
  return buildChartModel({ visualId, dataset: fx.dataset, config: { ...fx.mapping, ...config } });
}

describe("every asset derives for every fixture without throwing", () => {
  for (const asset of CHART_ASSETS) {
    it(asset.visualId, () => {
      for (const v of FIXTURE_VARIANTS) {
        const m = model(asset.visualId, v.id);
        expect(m.visualId).toBe(asset.visualId);
        if (v.id === "empty") expect(["empty", "missing-mapping"]).toContain(m.state);
      }
    });
  }
});

describe("missing mappings never fall back to mock columns", () => {
  for (const asset of CHART_ASSETS) {
    it(asset.visualId, () => {
      const fx = makeFixture(asset.visualId, "normal");
      const m = buildChartModel({ visualId: asset.visualId, dataset: fx.dataset, config: {} });
      expect(m.state).toBe("missing-mapping");
    });
  }
});

describe("line", () => {
  it("positions time by elapsed time, not index", () => {
    const m = model("line-chart", "gaps") as CartesianModel;
    const xs = m.series[0].data.map((d) => d.x);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps) * 3);
  });
  it("keeps null values as gaps", () => {
    const m = model("line-chart", "gaps") as CartesianModel;
    expect(m.series[0].data.some((d) => d.y === null)).toBe(true);
    expect(m.series[0].data.every((d) => d.y !== 0 || d.y === 0)).toBe(true);
  });
  it("reports invalid text as gaps, not zero", () => {
    const m = model("line-chart", "invalid") as CartesianModel;
    expect(m.issues.some((i) => i.id === "invalid-y")).toBe(true);
    expect(m.series[0].data.filter((d) => d.y === 0).length).toBe(0);
  });
  it("keeps all 50 series and their order", () => {
    const m = model("line-chart", "normal", { "Legend::Show legend": true }, { series: 50 }) as CartesianModel;
    expect(m.series).toHaveLength(50);
    expect(m.legend.items).toHaveLength(50);
    expect(m.series[0].identity.label).toBe("Region 01");
  });
  it("binds stroke width and point settings", () => {
    const m = model("line-chart", "normal", { "Line::Stroke width": "4", "Line::Show data points": true, "Line::Point radius": "8" }) as CartesianModel;
    expect(m.strokeWidth).toBe(4);
    expect(m.points.show).toBe(true);
    expect(m.points.radius).toBeCloseTo(8, 0);
  });
  it("needs two distinct X values for OLS", () => {
    const m = model("line-chart", "single", { "Annotations::Show annotations": true, "Annotations::Source": "Linear trend (OLS)" }) as CartesianModel;
    expect(m.annotations).toHaveLength(0);
    expect(m.issues.some((i) => i.id === "ols-insufficient")).toBe(true);
  });
  it("legend shows latest values and withholds percentages for averages", () => {
    const m = model("line-chart", "normal", { "Legend::Show legend": true, "Mapping::Aggregation": "Average" }, { series: 3 }) as CartesianModel;
    expect(m.legend.items[0].percentText).toBeUndefined();
    expect(m.legend.items[0].percentReason).toMatch(/averages/);
  });
  it("ML Actual vs predicted makes two series and ignores Series", () => {
    const m = model("line-chart", "ml-forecast", { "Mapping::Y-axis values (ML only)": "Actual vs predicted" }, { series: 3 }) as CartesianModel;
    expect(m.series.map((s) => s.identity.label)).toEqual(["Actual", "Predicted"]);
    expect(m.conflicts.length).toBeGreaterThan(0);
  });
  it("ML setting does not change the measure for a non-ML source", () => {
    const m = model("line-chart", "normal") as CartesianModel;
    expect(m.yAxis.title === null).toBe(true);
    expect(m.series[0].identity.label).toBe("Registrations");
  });
});

describe("bars", () => {
  it("Top N keeps largest absolute totals and discloses omitted categories", () => {
    const m = model("vertical-bar", "high-cardinality", { "Bar::Top N categories": "12" }) as CartesianModel;
    expect(m.categories).toHaveLength(12);
    expect(m.bar.omitted.length).toBe(88);
    expect(m.adaptations.some((a) => a.id === "top-n")).toBe(true);
    expect(m.table.rows.some((r) => r.x.note === "Not shown (Top N)")).toBe(true);
  });
  it("default Top N (100) does not cut the normal fixture", () => {
    const m = model("vertical-bar") as CartesianModel;
    expect(m.categories).toHaveLength(6);
  });
  it("stacks mixed signs from zero in both directions", () => {
    const m = model("vertical-bar", "mixed-sign", { "Bar::Stack series": true }, { series: 3 }) as CartesianModel;
    expect(m.stacked).toBe(true);
    const pos = m.series.flatMap((s) => s.data).filter((d) => d.y !== null && d.y >= 0);
    const neg = m.series.flatMap((s) => s.data).filter((d) => d.y !== null && d.y < 0);
    expect(pos.every((d) => (d.y0 ?? 0) >= 0)).toBe(true);
    expect(neg.every((d) => (d.y0 ?? 0) <= 0)).toBe(true);
  });
  it("hides the horizontal category-stack legend with a reason", () => {
    const m = model("horizontal-bar", "normal", { "Bar::Stack series": true, "Legend::Show legend": true }, { series: 3 }) as CartesianModel;
    expect(m.legend.enabled).toBe(false);
    expect(m.legend.unavailableReason).toMatch(/stacked/);
  });
});

describe("range", () => {
  it("does not swap inverted endpoints", () => {
    const fx = makeFixture("range", "normal");
    fx.dataset.rows[0].low = 90;
    fx.dataset.rows[0].high = 10;
    const m = buildChartModel({ visualId: "range", dataset: fx.dataset, config: fx.mapping }) as CartesianModel;
    const d = m.series[0].data[0];
    expect(d.low).toBe(90);
    expect(d.high).toBe(10);
    expect(d.invalid).toBe(true);
  });
  it("records local vs shared grid precedence", () => {
    const m = model("range", "normal", { "Bar gradient::Show grid": false }) as CartesianModel;
    expect(m.yAxis.showGrid).toBe(false);
    expect(m.conflicts.some((c) => c.settings.includes("Bar gradient::Show grid"))).toBe(true);
  });
});

describe("area", () => {
  it("stays filled on the Area asset by default and is overlay unless the extension is on", () => {
    const m = model("area-chart", "normal", {}, { series: 3 }) as CartesianModel;
    expect(m.areaFill).toBe(true);
    expect(m.stacked).toBe(false);
  });
});

describe("donut", () => {
  it("uses the sum of non-negative slices as the denominator", () => {
    const m = model("donut-chart", "normal") as DonutModel;
    const sum = m.slices.reduce((a, s) => a + (s.share ?? 0), 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it("shows no percentage for a zero total", () => {
    const m = model("donut-chart", "all-zero") as DonutModel;
    expect(m.state).toBe("all-zero");
    expect(m.slices.every((s) => s.share === null)).toBe(true);
    expect(m.centerText).toBeNull();
  });
});

describe("KPI grid and table never slice", () => {
  it("50 tiles", () => {
    const m = model("kpi-grid", "normal", {}, { categories: 50 }) as KpiGridModel;
    expect(m.tiles).toHaveLength(50);
  });
  it("all table rows", () => {
    const m = model("table", "high-cardinality") as TableModel;
    expect(m.rows.length).toBe(120);
  });
});
