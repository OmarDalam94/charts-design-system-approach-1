import { chartAsset } from "./assets";
import { planLayout, type LayoutPlan } from "./layout";
import type { ChartModel } from "./model";

export function hasPlot(model: ChartModel): boolean {
  return !(model.kind === "kpi" || model.kind === "legacy-kpi" || model.kind === "table" || model.kind === "kpi-grid");
}

/** The frame's layout decision for a model at a container size. Pure; used by LlumenChart, rules and tests. */
export function planFrame(model: ChartModel, width: number, height: number, legendExpanded = false): LayoutPlan {
  return planLayout({
    width,
    height,
    minPlot: chartAsset(model.visualId).minPlot,
    title: model.header.title,
    description: model.header.description,
    hasKpi: !!model.header.kpi,
    hasBadge: !!model.header.badge,
    flagCount: model.header.flags.length,
    insight: model.insight,
    legend: {
      enabled: model.legend.enabled && model.state !== "missing-mapping",
      position: model.legend.position,
      items: model.legend.items.map((i) => ({ label: i.label, valueText: i.valueText, percentText: i.percentText })),
      showLabels: model.legend.showLabels,
      showValues: model.legend.showValues,
      showPercentages: model.legend.showPercentages,
    },
    legendExpanded,
    hasPlot: hasPlot(model),
    squarePlot: model.kind === "donut" || model.kind === "polar",
  });
}
