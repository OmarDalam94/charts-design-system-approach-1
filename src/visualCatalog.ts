export type VisualCategoryId = "chart" | "map-layer";

export interface VisualType {
  id: string;
  label: string;
  description: string;
  chartId: string;
  category: VisualCategoryId;
}

export interface VisualCategory {
  id: VisualCategoryId;
  label: string;
}

export const VISUAL_CATEGORIES: VisualCategory[] = [
  { id: "chart", label: "Charts" },
  { id: "map-layer", label: "Map Layers" },
];

export const VISUAL_TYPES: VisualType[] = [
  {
    id: "vertical-bar",
    label: "Vertical Bar Chart",
    description: "Compare values across categories with vertical columns.",
    chartId: "bar",
    category: "chart",
  },
  {
    id: "horizontal-bar",
    label: "Horizontal Bar Chart",
    description: "Compare values across categories with horizontal bars.",
    chartId: "horizontalBar",
    category: "chart",
  },
  {
    id: "line-chart",
    label: "Line Chart",
    description: "Show trends and change over a continuous axis.",
    chartId: "line",
    category: "chart",
  },
  {
    id: "area-chart",
    label: "Area Chart",
    description: "Emphasize volume and magnitude of change over time.",
    chartId: "area",
    category: "chart",
  },
  {
    id: "scatter-plot",
    label: "Scatter Plot",
    description: "Reveal relationships and clusters between two measures.",
    chartId: "scatter",
    category: "chart",
  },
  {
    id: "donut-chart",
    label: "Donut Chart",
    description: "Show how parts contribute to a whole.",
    chartId: "pie",
    category: "chart",
  },
  {
    id: "progress-bar",
    label: "Progress Bar",
    description: "Track completion against a target as a filled bar.",
    chartId: "progress",
    category: "chart",
  },
  {
    id: "gauge-linear",
    label: "Gauge / Meter",
    description: "Display a value on a vertical or circular gauge.",
    chartId: "gauge",
    category: "chart",
  },
  {
    id: "score-indicator",
    label: "Score Indicator",
    description: "Highlight a single score with supporting context.",
    chartId: "score",
    category: "chart",
  },
  {
    id: "polar-wind-rose",
    label: "Polar / Wind Rose",
    description: "Plot directional or cyclic values around a polar axis.",
    chartId: "polar",
    category: "chart",
  },
  {
    id: "range",
    label: "Range",
    description: "Show minimum-to-maximum spread for each category.",
    chartId: "range",
    category: "chart",
  },
  {
    id: "availability",
    label: "Availability",
    description: "Visualize uptime or availability across time periods.",
    chartId: "availability",
    category: "chart",
  },
  {
    id: "sankey-chart",
    label: "Sankey Chart",
    description: "Show weighted flows between source and target categories.",
    chartId: "sankey",
    category: "chart",
  },
  {
    id: "kpi-card",
    label: "KPI Card",
    description: "Surface a single key metric with optional trend.",
    chartId: "kpi",
    category: "chart",
  },
  {
    id: "kpi-grid",
    label: "KPI Grid",
    description: "Compare several key metrics in a compact grid.",
    chartId: "kpiGrid",
    category: "chart",
  },
  {
    id: "legacy-kpi",
    label: "Legacy Kpi",
    description: "Display a key metric using the legacy KPI presentation.",
    chartId: "legacyKpi",
    category: "chart",
  },
  {
    id: "table",
    label: "Data Table",
    description: "Inspect raw values in a sortable, readable table.",
    chartId: "table",
    category: "chart",
  },

  {
    id: "arcs",
    label: "Arcs",
    description: "Connect origins and destinations with curved flow lines.",
    chartId: "polar",
    category: "map-layer",
  },
  {
    id: "fences",
    label: "Links",
    description: "Draw linear boundaries or corridors on the map.",
    chartId: "line",
    category: "map-layer",
  },
  {
    id: "pillars",
    label: "Pillars",
    description: "Extrude locations upward to represent magnitude.",
    chartId: "bar",
    category: "map-layer",
  },
  {
    id: "discs",
    label: "Discs",
    description: "Size circular markers to represent values at locations.",
    chartId: "pie",
    category: "map-layer",
  },
  {
    id: "map-area",
    label: "Area",
    description: "Shaded areas represent a variable for polygon features.",
    chartId: "area",
    category: "map-layer",
  },
  {
    id: "heatmap",
    label: "Heatmap",
    description: "Color represents density of features in your data.",
    chartId: "bar",
    category: "map-layer",
  },
  {
    id: "points",
    label: "Points",
    description: "Plot individual locations with optional size and color.",
    chartId: "scatter",
    category: "map-layer",
  },
  {
    id: "wind",
    label: "Wind",
    description: "Show directional flow and intensity across the map.",
    chartId: "line",
    category: "map-layer",
  },
  {
    id: "water-surfaces",
    label: "Water Surfaces",
    description: "Liquids on water: discharge plumes, oil spills, and currents.",
    chartId: "area",
    category: "map-layer",
  },
];

export function visualTypesForCategory(categoryId: VisualCategoryId): VisualType[] {
  return VISUAL_TYPES.filter((v) => v.category === categoryId);
}

export function visualTypeByChartId(chartId: string): VisualType | undefined {
  return VISUAL_TYPES.find((v) => v.chartId === chartId);
}

export function visualTypeById(id: string): VisualType | undefined {
  return VISUAL_TYPES.find((v) => v.id === id);
}
