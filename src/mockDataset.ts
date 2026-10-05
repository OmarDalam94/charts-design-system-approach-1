export type ColumnType = "number" | "string" | "boolean" | "datetime" | "geometry";

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  datetime: "Date",
  geometry: "Location",
};

export type MockColumn = {
  name: string;
  label: string;
  type: ColumnType;
};

export type MockRow = Record<string, string | number | boolean>;

export type MockDataset = {
  id: string;
  name: string;
  columns: MockColumn[];
  rows: MockRow[];
};

const DISTRICTS = [
  { district: "North", region: "Metro", category: "Residential" },
  { district: "South", region: "Metro", category: "Commercial" },
  { district: "East", region: "Coastal", category: "Industrial" },
  { district: "West", region: "Inland", category: "Residential" },
  { district: "Central", region: "Metro", category: "Mixed use" },
  { district: "Harbor", region: "Coastal", category: "Commercial" },
] as const;

const MONTHS = ["2024-01", "2024-02", "2024-03", "2024-04"] as const;

const BASE: Record<string, { value: number; amount: number; incidents: number; completion: number }> = {
  North: { value: 42, amount: 1.8, incidents: 4, completion: 94 },
  South: { value: 38, amount: 2.4, incidents: 7, completion: 88 },
  East: { value: 51, amount: 3.1, incidents: 11, completion: 76 },
  West: { value: 29, amount: 1.2, incidents: 3, completion: 91 },
  Central: { value: 46, amount: 2.7, incidents: 6, completion: 83 },
  Harbor: { value: 33, amount: 2.1, incidents: 5, completion: 89 },
};

const MONTH_LIFT = [1, 1.08, 0.94, 1.16];

function statusFor(rate: number): string {
  if (rate >= 90) return "On track";
  if (rate >= 80) return "Watch";
  return "At risk";
}

function buildRows(): MockRow[] {
  const rows: MockRow[] = [];
  DISTRICTS.forEach((place, di) => {
    const base = BASE[place.district];
    MONTHS.forEach((month, mi) => {
      const lift = MONTH_LIFT[mi] * (1 + ((di + mi) % 3) * 0.03);
      const value = Math.round(base.value * lift);
      const amount = Number((base.amount * lift).toFixed(2));
      const incidents = Math.max(1, Math.round(base.incidents * (2 - lift)));
      const completion = Math.min(99, Math.round(base.completion * (0.96 + mi * 0.015)));
      const actual = value;
      const predicted = Math.round(value * (0.92 + ((mi + di) % 4) * 0.04));
      const dest = DISTRICTS[(di + 1 + mi) % DISTRICTS.length].district;
      const dirs = ["N", "NE", "E", "SE", "S", "SW"] as const;
      rows.push({
        district: place.district,
        region: place.region,
        category: place.category,
        timestamp: month,
        value,
        total: Math.round(value * 1.45 + 18 + mi * 4),
        amount,
        incidents,
        completion_rate: completion,
        active: completion >= 80,
        status: statusFor(completion),
        unit: "%",
        series: mi % 2 === 0 ? "Actual" : "Forecast",
        predicted,
        actual,
        name: place.district,
        type: place.category,
        direction: dirs[di],
        wind_speed: Number((6 + incidents * 1.4 + mi).toFixed(1)),
        origin: place.district,
        destination: dest,
        geometry: `${place.district} polygon`,
        coordinates: `${place.district} point`,
        u: Number((Math.sin(di + mi) * 0.45).toFixed(2)),
        v: Number((Math.cos(di * 0.7) * 0.35).toFixed(2)),
        particle_id: `spill-${(di % 3) + 1}`,
        thickness: Number((0.4 + incidents * 0.12).toFixed(2)),
        bearing: (di * 60 + mi * 20) % 360,
      });
    });
  });
  return rows;
}

export const MOCK_DATASET: MockDataset = {
  id: "market-ops",
  name: "Market operations (mock)",
  columns: [
    { name: "district", label: "District", type: "string" },
    { name: "region", label: "Region", type: "string" },
    { name: "category", label: "Land use", type: "string" },
    { name: "timestamp", label: "Month", type: "datetime" },
    { name: "value", label: "Registrations", type: "number" },
    { name: "total", label: "Quota / total", type: "number" },
    { name: "amount", label: "Transaction value (M AED)", type: "number" },
    { name: "incidents", label: "Incidents", type: "number" },
    { name: "completion_rate", label: "Completion rate (%)", type: "number" },
    { name: "active", label: "Active", type: "boolean" },
    { name: "status", label: "Status", type: "string" },
    { name: "unit", label: "Unit", type: "string" },
    { name: "series", label: "Series", type: "string" },
    { name: "predicted", label: "Predicted", type: "number" },
    { name: "actual", label: "Actual", type: "number" },
    { name: "name", label: "Name", type: "string" },
    { name: "type", label: "Type", type: "string" },
    { name: "direction", label: "Direction", type: "string" },
    { name: "wind_speed", label: "Wind speed", type: "number" },
    { name: "origin", label: "Origin", type: "string" },
    { name: "destination", label: "Destination", type: "string" },
    { name: "geometry", label: "Geometry", type: "geometry" },
    { name: "coordinates", label: "Coordinates", type: "geometry" },
    { name: "u", label: "U component", type: "number" },
    { name: "v", label: "V component", type: "number" },
    { name: "particle_id", label: "Particle", type: "string" },
    { name: "thickness", label: "Thickness", type: "number" },
    { name: "bearing", label: "Bearing", type: "number" },
  ],
  rows: buildRows(),
};

export const DISTRICT_LAYOUT: Record<string, { x: number; y: number }> = {
  North: { x: 0.5, y: 0.16 },
  West: { x: 0.16, y: 0.48 },
  Central: { x: 0.48, y: 0.5 },
  East: { x: 0.84, y: 0.4 },
  South: { x: 0.46, y: 0.84 },
  Harbor: { x: 0.78, y: 0.74 },
};

export function uniqueValues(col: string, dataset: MockDataset = MOCK_DATASET): string[] {
  const seen: string[] = [];
  for (const row of dataset.rows) {
    const v = String(row[col] ?? "");
    if (v && !seen.includes(v)) seen.push(v);
  }
  return seen;
}

export function columnByName(name: string, dataset: MockDataset = MOCK_DATASET): MockColumn | undefined {
  return dataset.columns.find((c) => c.name === name);
}

export function columnLabel(name: string, dataset: MockDataset = MOCK_DATASET): string {
  return columnByName(name, dataset)?.label ?? name;
}

const NUMERIC_FIELDS = new Set([
  "Y axis",
  "Max/Total",
  "Reference value",
  "X value",
  "Y value",
  "Point size",
  "Value",
  "Min field",
  "Max field",
  "Max value",
  "Comparison value",
  "Low value",
  "High value",
  "Wind speed",
  "Frequency",
  "Intensity Value Field",
  "U Component (Eastward)",
  "V Component (Northward)",
  "U component",
  "V component",
  "Speed",
  "Color by",
  "Thickness",
  "KPI value field",
  "KPI min value field",
  "KPI max value field",
]);

const GEOMETRY_FIELDS = new Set([
  "Geometry Column",
  "Coordinates (Geometry)",
  "Geometry",
  "Coordinates",
]);

const CATEGORY_FIELDS = new Set([
  "Series",
  "Y category",
  "Category",
  "Unit",
  "Status",
  "Metric label",
  "Secondary label/context",
  "Name",
  "Type",
  "KPI unit field",
  "Color by category field",
]);

const FLEXIBLE_SCALAR_FIELDS = new Set([
  "X axis",
  "Color/Category",
  "Color Source",
  "Column",
  "Data Field",
  "Hover tooltip field",
]);

export function acceptedColumnTypesForField(fieldName: string): ColumnType[] {
  if (NUMERIC_FIELDS.has(fieldName)) return ["number"];
  if (GEOMETRY_FIELDS.has(fieldName)) return ["geometry"];
  if (CATEGORY_FIELDS.has(fieldName)) return ["string", "boolean", "datetime"];
  if (fieldName === "Direction" || fieldName === "Band") return ["number", "string"];
  if (fieldName === "Origin" || fieldName === "Destination") return ["string", "geometry"];
  if (fieldName === "Location" || fieldName === "Location field") return ["string", "geometry"];
  if (fieldName === "Insight field") return ["string"];
  if (/timestamp|time|date|month/i.test(fieldName)) return ["datetime"];
  if (FLEXIBLE_SCALAR_FIELDS.has(fieldName)) return ["number", "string", "boolean", "datetime"];
  return ["number", "string", "boolean", "datetime", "geometry"];
}

export function isColumnCompatible(fieldName: string, type: ColumnType): boolean {
  return acceptedColumnTypesForField(fieldName).includes(type);
}

export function columnsForField(fieldName: string, dataset: MockDataset = MOCK_DATASET): MockColumn[] {
  return dataset.columns.filter((column) => isColumnCompatible(fieldName, column.type));
}

export function fieldOptionsFor(fieldName: string, dataset: MockDataset = MOCK_DATASET) {
  return dataset.columns.map((column) => {
    const compatible = isColumnCompatible(fieldName, column.type);
    return {
      value: column.name,
      label: column.label,
      dataType: COLUMN_TYPE_LABELS[column.type],
      disabled: !compatible,
      disabledReason: compatible ? undefined : "Incompatible",
    };
  });
}

export function numericExtent(column: string, dataset: MockDataset = MOCK_DATASET): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of dataset.rows) {
    const raw = row[column];
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(n)) continue;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) return { min, max: min + 1 };
  const intLike = Math.abs(min - Math.round(min)) < 1e-6 && Math.abs(max - Math.round(max)) < 1e-6;
  return intLike ? { min: Math.round(min), max: Math.round(max) } : { min: Number(min.toFixed(2)), max: Number(max.toFixed(2)) };
}

/** Range between two percentiles (0–100) of a numeric column. */
export function numericPercentileExtent(
  column: string,
  lower: number,
  upper: number,
  dataset: MockDataset = MOCK_DATASET,
): { min: number; max: number } | null {
  const values = dataset.rows
    .map((row) => {
      const raw = row[column];
      return typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (values.length < 2) return numericExtent(column, dataset);
  const at = (p: number) => {
    const i = (p / 100) * (values.length - 1);
    const lo = Math.floor(i);
    return values[lo] + (values[Math.min(lo + 1, values.length - 1)] - values[lo]) * (i - lo);
  };
  const min = at(lower);
  const max = at(upper);
  if (!(max > min)) return numericExtent(column, dataset);
  const round = (n: number) => (Math.abs(max - min) >= 10 ? Math.round(n) : Number(n.toFixed(2)));
  return { min: round(min), max: round(max) };
}

export function allColumnNames(dataset: MockDataset = MOCK_DATASET): string[] {
  return dataset.columns.map((c) => c.name);
}
