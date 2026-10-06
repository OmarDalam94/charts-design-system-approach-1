import { chartAsset } from "./assets";
import { DeriveContext, type ChartInput } from "./derive/common";
import { deriveCartesian } from "./derive/cartesian";
import { deriveDonut, derivePolar, deriveSankey } from "./derive/radial";
import {
  deriveAvailability,
  deriveGauge,
  deriveKpiCard,
  deriveKpiGrid,
  deriveProgress,
  deriveScore,
  deriveTable,
} from "./derive/metric";
import type { ChartModel } from "./model";

export type { ChartInput };

export function buildChartModel(input: ChartInput): ChartModel {
  const ctx = new DeriveContext(input);
  const family = chartAsset(input.visualId).family;
  let model: ChartModel;
  switch (family) {
    case "line":
    case "area":
    case "bar":
    case "hbar":
    case "scatter":
    case "range":
      model = deriveCartesian(ctx);
      break;
    case "donut":
      model = deriveDonut(ctx);
      break;
    case "polar":
      model = derivePolar(ctx);
      break;
    case "sankey":
      model = deriveSankey(ctx);
      break;
    case "progress":
      model = deriveProgress(ctx);
      break;
    case "gauge":
      model = deriveGauge(ctx);
      break;
    case "score":
      model = deriveScore(ctx);
      break;
    case "kpi":
    case "legacy-kpi":
      model = deriveKpiCard(ctx);
      break;
    case "kpi-grid":
      model = deriveKpiGrid(ctx);
      break;
    case "availability":
      model = deriveAvailability(ctx);
      break;
    case "table":
    default:
      model = deriveTable(ctx);
  }
  model.reads = [...ctx.s.reads];
  if (input.status === "loading") {
    model.state = "loading";
    model.stateMessage = input.statusMessage ?? "Loading data…";
  } else if (input.status === "error") {
    model.state = "error";
    model.stateMessage = input.statusMessage ?? "The data could not be loaded.";
  } else if (input.status === "stale" || input.status === "partial") {
    model.issues.unshift({
      id: `host:${input.status}`,
      severity: "warning",
      message: input.statusMessage ?? (input.status === "stale" ? "This data may be out of date." : "Some data is missing from this result."),
    });
  }
  return model;
}

const cache = new WeakMap<object, Map<string, ChartModel>>();

/** Memoized derivation keyed by dataset identity and a config fingerprint. */
export function buildChartModelCached(input: ChartInput): ChartModel {
  const key = JSON.stringify([input.visualId, input.config, input.title, input.description, input.insight, input.status, input.statusMessage, input.suggestedMappings, input.assetContext, input.extensions]);
  let byDataset = cache.get(input.dataset);
  if (!byDataset) {
    byDataset = new Map();
    cache.set(input.dataset, byDataset);
  }
  const hit = byDataset.get(key);
  if (hit) return hit;
  const model = buildChartModel(input);
  if (byDataset.size > 64) byDataset.delete(byDataset.keys().next().value as string);
  byDataset.set(key, model);
  return model;
}
