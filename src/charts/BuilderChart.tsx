import { useMemo } from "react";
import { MOCK_DATASET } from "../mockDataset";
import { CHART_ASSETS } from "./assets";
import type { ChartDataset } from "./data/values";
import type { Config } from "./settings";
import { LlumenChart } from "./LlumenChart";

/**
 * Columns the Asset Builder previews with while a required field is still unmapped.
 * Every use is disclosed as an adaptation ("Preview uses a suggested column…") and is
 * never written to the saved config. Keys are Mapping field names, or `group::name`
 * for field controls outside the Mapping group.
 */
const SUGGESTIONS: Record<string, Record<string, string>> = {
  "kpi-card": { Value: "completion_rate", "Comparison value": "predicted" },
  "legacy-kpi": { Value: "completion_rate", "Comparison value": "predicted" },
  "kpi-grid": { Value: "completion_rate", "Metric label": "district", "Secondary label/context": "region", Status: "status", Unit: "unit" },
  "vertical-bar": { "X axis": "district", "Y axis": "value" },
  "horizontal-bar": { "Y category": "district", "X value": "value" },
  "line-chart": { "X axis": "timestamp", "Y axis": "value" },
  "area-chart": { "X axis": "timestamp", "Y axis": "value" },
  "scatter-plot": { "X value": "amount", "Y value": "incidents", "Point size": "value", "Color/Category": "category" },
  "donut-chart": { Category: "district", Value: "value" },
  "progress-bar": { "Y category": "district", "X value": "value", "Max/Total": "total" },
  "gauge-linear": { Value: "completion_rate", Unit: "unit", Status: "status" },
  "score-indicator": { "KPI Display::KPI value field": "completion_rate" },
  "polar-wind-rose": { Direction: "direction", "Wind speed": "wind_speed" },
  range: { "X axis": "district", "Low value": "incidents", "High value": "value" },
  availability: { Value: "status" },
  "sankey-chart": { Source: "origin", Target: "destination", Value: "value" },
};

const NATIVE = new Set(CHART_ASSETS.map((a) => a.visualId));

/** True when the visual is drawn by the Llumen chart system (maps keep their own preview). */
export function isNativeChart(visualId: string | null | undefined): boolean {
  return !!visualId && NATIVE.has(visualId);
}

export function builderSuggestions(visualId: string): Record<string, string> {
  return SUGGESTIONS[visualId] ?? {};
}

/** The Asset Builder's live preview: the same renderer and model the Chart System Lab uses. */
export function BuilderChart({
  visualId,
  config,
  title,
  description,
  insight,
  dataset = MOCK_DATASET as ChartDataset,
  className,
  showActions = true,
}: {
  visualId: string;
  config: Config;
  title?: string;
  description?: string;
  insight?: string;
  dataset?: ChartDataset;
  className?: string;
  showActions?: boolean;
}) {
  const suggestedMappings = useMemo(() => builderSuggestions(visualId), [visualId]);
  return (
    <LlumenChart
      visualId={visualId}
      config={config}
      dataset={dataset}
      title={title}
      description={description}
      insight={insight}
      suggestedMappings={suggestedMappings}
      className={className}
      showActions={showActions}
    />
  );
}
