import { describe, expect, it } from "vitest";
import { buildChartModel } from "../build";
import { makeFixture } from "../fixtures";
import { planFrame } from "../frame";
import { planLayout, sizeModeFor } from "../layout";
import type { CartesianModel, SankeyModel } from "../model";
import { niceDomainForCount } from "../scales";
import { scenarioById, scenarioInput } from "../scenarios";

const measure = (t: string) => t.length * 7;

function base(width: number, height: number, items: number, extra: Partial<Parameters<typeof planLayout>[0]> = {}) {
  return planLayout({
    width,
    height,
    minPlot: { width: 160, height: 120 },
    title: "Chart",
    hasKpi: false,
    hasBadge: false,
    flagCount: 0,
    legend: { enabled: true, position: "bottom", items: Array.from({ length: items }, (_, i) => ({ label: `Category ${i + 1}` })), showLabels: true, showValues: false, showPercentages: false },
    legendExpanded: false,
    hasPlot: true,
    measure,
    ...extra,
  });
}

describe("size modes", () => {
  it("uses the documented breakpoints", () => {
    expect([319, 320, 479, 480, 767, 768].map(sizeModeFor)).toEqual(["micro", "compact", "compact", "regular", "regular", "wide"]);
  });
});

describe("legend", () => {
  it("absent legend takes no space", () => {
    const a = base(640, 360, 0);
    const b = base(640, 360, 3, { legend: { enabled: false, position: "bottom", items: [{ label: "A" }], showLabels: true, showValues: false, showPercentages: false } });
    expect(a.legend.size).toBe(0);
    expect(b.legend.size).toBe(0);
    expect(a.plot.height).toBe(b.plot.height);
  });

  it("overflows into Show all instead of slicing items", () => {
    const p = base(320, 360, 50);
    expect(p.legend.overflow).toBe(true);
    expect(p.legend.rows).toBeGreaterThan(p.legend.visibleRows);
  });

  it("relocates a side legend at narrow widths and reports requested vs effective", () => {
    const p = base(300, 420, 9, { legend: { enabled: true, position: "right", items: Array.from({ length: 9 }, (_, i) => ({ label: `Long category name ${i}` })), showLabels: true, showValues: false, showPercentages: false } });
    expect(p.legend.position).toBe("bottom");
    const a = p.adaptations.find((x) => x.id === "legend-relocated");
    expect(a?.requested).toBe("Right");
    expect(a?.effective).toBe("Bottom");
  });

  it("square plots give their spare height to legend rows", () => {
    const flat = base(300, 420, 9);
    const square = base(300, 420, 9, { squarePlot: true });
    expect(square.legend.visibleRows).toBeGreaterThan(flat.legend.visibleRows);
    expect(square.plot.height).toBeGreaterThanOrEqual(120);
  });
});

describe("compact summary", () => {
  it("replaces the plot when the minimum cannot fit", () => {
    const p = base(200, 140, 3);
    expect(p.compactSummary).toBe(true);
  });
});

describe("explicit tick counts", () => {
  it("land on round values for automatic domains", () => {
    const [a, b] = niceDomainForCount([-20, 120], 4);
    const step = (b - a) / 3;
    expect(a).toBeLessThanOrEqual(-20);
    expect(b).toBeGreaterThanOrEqual(120);
    expect([1, 2, 2.5, 5].some((m) => Math.abs(step / Math.pow(10, Math.floor(Math.log10(step))) - m) < 1e-9)).toBe(true);
  });

  it("keeps a zero edge at zero", () => {
    expect(niceDomainForCount([0, 87], 5)[0]).toBe(0);
    expect(niceDomainForCount([0, 87], 5)).toEqual([0, 100]);
  });

  it("does not touch manual bounds", () => {
    const fx = makeFixture("range", "normal");
    const m = buildChartModel({ visualId: "range", dataset: fx.dataset, config: { ...fx.mapping, "Scaling / axes::Manual range (min/max)": "0,90", "Bar gradient::Y tick count": 4 } }) as CartesianModel;
    expect(m.yDomain).toEqual([0, 90]);
  });
});

describe("sankey colour", () => {
  it("colours first-stage categories and keeps downstream nodes neutral", () => {
    const fx = makeFixture("sankey-chart", "normal", { stages: 4 });
    const m = buildChartModel({ visualId: "sankey-chart", dataset: fx.dataset, config: fx.mapping }) as SankeyModel;
    const first = m.nodes.filter((n) => n.stage === 0).map((n) => n.identity.color);
    const rest = new Set(m.nodes.filter((n) => n.stage > 0).map((n) => n.identity.color));
    expect(new Set(first).size).toBe(first.length);
    expect(rest.size).toBe(1);
  });
});

describe("frame plan uses the model", () => {
  it("donut is planned as a square plot", () => {
    const sc = scenarioById("donut-chart:compound-side-legend-narrow")!;
    const m = buildChartModel(scenarioInput(sc).input);
    const p = planFrame(m, sc.width, sc.height);
    expect(p.legend.position).toBe("bottom");
    expect(p.legend.visibleRows).toBeGreaterThanOrEqual(3);
  });
});

describe("builder integration", () => {
  it("draws the 17 chart assets natively and leaves maps to the existing preview", async () => {
    const { isNativeChart, builderSuggestions } = await import("../BuilderChart");
    const { CHART_ASSETS } = await import("../assets");
    expect(CHART_ASSETS.every((a) => isNativeChart(a.visualId))).toBe(true);
    for (const id of ["map-layer", "map-area", "heatmap"]) expect(isNativeChart(id)).toBe(false);
    expect(builderSuggestions("line-chart")["X axis"]).toBe("timestamp");
  });

  it("suggested columns are disclosed and never treated as saved mappings", async () => {
    const { builderSuggestions } = await import("../BuilderChart");
    const { MOCK_DATASET } = await import("../../mockDataset");
    for (const id of ["vertical-bar", "line-chart", "sankey-chart", "score-indicator", "availability"]) {
      const m = buildChartModel({ visualId: id, dataset: MOCK_DATASET as never, config: {}, suggestedMappings: builderSuggestions(id) });
      expect(m.state).not.toBe("missing-mapping");
      expect(m.adaptations.some((a) => a.id.startsWith("suggested:"))).toBe(true);
    }
  });
});

describe("performance contracts", () => {
  it("resizing a scenario reuses the generated dataset, so the model cache hits", async () => {
    const { buildChartModelCached } = await import("../build");
    const sc = scenarioById("line-chart:default")!;
    const a = scenarioInput(sc).input;
    const b = scenarioInput({ ...sc, width: sc.width + 40, height: sc.height + 8 }).input;
    expect(b.dataset).toBe(a.dataset);
    expect(buildChartModelCached(b)).toBe(buildChartModelCached(a));
    const other = scenarioInput({ ...sc, fixture: { ...sc.fixture, seed: (sc.fixture.seed ?? 1) + 1 } }).input;
    expect(other.dataset).not.toBe(a.dataset);
  });

  it("the dense table fixture has 400 rows", () => {
    expect(makeFixture("table", "dense").dataset.rows.length).toBe(400);
  });
});
