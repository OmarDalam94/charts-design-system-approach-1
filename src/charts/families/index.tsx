import { memo } from "react";
import type { ChartModel } from "../model";
import { CartesianPlot } from "./CartesianPlot";
import { AvailabilityPlot, GaugePlot, KpiCardView, KpiGridView, ProgressPlot, ScorePlot, TablePlot } from "./MetricPlots";
import { DonutPlot, PolarPlot, SankeyPlot } from "./RadialPlots";
import type { PlotProps } from "./shared";

/**
 * Memoised: hover, tooltip, announcement and report updates in the frame must
 * not re-trace thousands of marks. Callers keep `ix` and `report` stable.
 */
export const FamilyPlot = memo(function FamilyPlot(props: PlotProps<ChartModel>) {
  const { model } = props;
  switch (model.kind) {
    case "cartesian":
      return <CartesianPlot {...props} model={model} />;
    case "donut":
      return <DonutPlot {...props} model={model} />;
    case "polar":
      return <PolarPlot {...props} model={model} />;
    case "sankey":
      return <SankeyPlot {...props} model={model} />;
    case "progress":
      return <ProgressPlot {...props} model={model} />;
    case "gauge":
      return <GaugePlot {...props} model={model} />;
    case "score":
      return <ScorePlot {...props} model={model} />;
    case "kpi":
    case "legacy-kpi":
      return <KpiCardView {...props} model={model} />;
    case "kpi-grid":
      return <KpiGridView {...props} model={model} />;
    case "availability":
      return <AvailabilityPlot {...props} model={model} />;
    case "table":
      return <TablePlot {...props} model={model} />;
  }
});

/** Legends for these families describe identity only; toggling cannot re-derive the data honestly. */
export function legendInteractive(model: ChartModel): { interactive: boolean; reason?: string } {
  if (model.kind === "sankey") return { interactive: false, reason: "Hiding a source would require re-tracing every downstream flow, so the Sankey legend is identity only." };
  if (model.kind === "availability") return { interactive: false, reason: "Availability states are shown in time order; hiding a state would leave misleading gaps." };
  return { interactive: true };
}
