import {
  Fragment,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlignBottomSimple,
  AlignLeftSimple,
  AlignRightSimple,
  AlignTopSimple,
  CheckCircle,
  Info,
  Lock,
  LockOpen,
  Play,
  Question,
  WarningCircle,
  DotsSixVertical,
  Function,
  HandPointing,
  TextT,
  Hash,
  CalendarBlank,
  CheckSquare,
  BracketsSquare,
  BracketsCurly,
  PencilSimple,
} from "@phosphor-icons/react";
import {
  CloseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  SearchIcon,
  RequiredIcon,
  PlusIcon,
  ChevronDownIcon,
  TrashIcon,
} from "./icons";
import { charts, visibleWhenConditions } from "./chartModel";
import type { Opt } from "./chartModel";
import {
  defaultGradientAxisForVisual,
  fieldsForVisual,
  isFeatureTabOn,
  isFieldVisible,
  isTabVisible,
  settingsNavSections,
  subCategoriesForVisual,
} from "./visualSettingsCatalog";
import ChartPreview from "./ChartPreview";
import DataSourceQueryPreview from "./DataSourceQueryPreview";
import DataSourceDataProfile from "./DataSourceDataProfile";
import ColorPalette, {
  CategoryColorMap,
  ColorPaletteProvider,
  PaletteSelector,
  type PaletteCardinalityEdgeCase,
} from "./ColorPalette";
import ZoomScalingControl from "./ZoomScalingControl";
import { getSettingsTabIcon } from "./visualIcons";
import Dropdown from "./Dropdown";
import PhosphorIconPicker from "./PhosphorIconPicker";
import { derivePreviewSeries, mappedMeasureColumn } from "./derivePreviewSeries";
import { heatmapSettings, valueFade } from "./heatmapSettings";
import { waterSurfaceSettings } from "./waterSurfaceSettings";
import { WATER_CURRENT_PALETTE, WATER_PLUME_PALETTE, WATER_SPILL_PALETTE } from "./waterPalettes";
import {
  allColumnNames,
  fieldOptionsFor,
  numericExtent,
  numericPercentileExtent,
  uniqueValues,
} from "./mockDataset";
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_GRADIENT,
  DEFAULT_REPEATABLE,
  DEFAULT_ZOOM_SCALING,
  asColorMode,
  expandPaletteToCount,
  asGradient,
  asRepeatable,
  asStringArray,
  repeatableToStops,
  stopsToRepeatable,
  type GradientStop,
  type PaletteStyle,
  type RepeatableRow,
} from "./previewTheme";
import type { PreviewSeries } from "./componentPreviewProfiles";
import DataSourceStep, { type DataSourceSummary } from "./DataSourceStep";
import FiltersStep from "./FiltersStep";
import DeepDiveStep from "./DeepDiveStep";
import AccessStep from "./AccessStep";
import GeneralInfoStep, { type GeneralInfo } from "./GeneralInfoStep";
import VisualTypePicker from "./VisualTypePicker";
import SelectedVisualBar from "./SelectedVisualBar";
import { visualTypeByChartId, visualTypeById } from "./visualCatalog";
import type { VisualType } from "./visualCatalog";

type VizPhase = "picker" | "settings";

type PreviewSize = "small" | "medium" | "large";

type PreviewMode = "asset" | "data" | "source";
type DataPreviewMode = "results" | "profile";

const SOURCE_SQL_TOKEN_PATTERN =
  /(\$[A-Za-z_][A-Za-z0-9_]*|'(?:''|[^'])*'|\b(?:SELECT|FROM|JOIN|LEFT|RIGHT|INNER|OUTER|ON|WHERE|AND|OR|BETWEEN|ORDER|BY|AS|LIMIT|GROUP|HAVING|DESC|ASC)\b|\b\d+(?:\.\d+)?\b)/gi;

const SOURCE_SQL_KEYWORD_PATTERN =
  /^(?:SELECT|FROM|JOIN|LEFT|RIGHT|INNER|OUTER|ON|WHERE|AND|OR|BETWEEN|ORDER|BY|AS|LIMIT|GROUP|HAVING|DESC|ASC)$/i;

function HighlightedSourceSql({ value }: { value: string }) {
  return (
    <>
      {(value || " ").split(SOURCE_SQL_TOKEN_PATTERN).map((token, index) => {
        const className = token.startsWith("$")
          ? "is-variable"
          : token.startsWith("'")
            ? "is-string"
            : SOURCE_SQL_KEYWORD_PATTERN.test(token)
              ? "is-keyword"
              : /^\d/.test(token)
                ? "is-number"
                : undefined;
        return (
          <span className={className} key={`${index}-${token}`}>
            {token}
          </span>
        );
      })}
    </>
  );
}

function PreviewModeToggle({
  value,
  onChange,
}: {
  value: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}) {
  const [hoveredMode, setHoveredMode] = useState<PreviewMode | null>(null);

  return (
    <div className="preview__asset-mode-toggle" role="tablist" aria-label="Preview mode">
      {(["asset", "data"] as PreviewMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          className={
            (value === mode ? "is-active" : "") +
            (hoveredMode === mode ? " is-hovered" : "")
          }
          onPointerEnter={() => setHoveredMode(mode)}
          onPointerLeave={() =>
            setHoveredMode((current) => (current === mode ? null : current))
          }
          onClick={() => {
            onChange(mode);
            setHoveredMode(null);
          }}
        >
          {mode[0].toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );
}

type WizardStepId =
  | "data-source"
  | "viz-mapping"
  | "filters"
  | "deep-dive"
  | "access"
  | "general-info";

const FILTERS_STEP_ENABLED = false;

const ALL_WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: "data-source", label: "Source" },
  { id: "viz-mapping", label: "Visualization & Mapping" },
  { id: "filters", label: "Filters" },
  { id: "deep-dive", label: "Deep Dive" },
  { id: "access", label: "Access" },
  { id: "general-info", label: "General Info" },
];

const WIZARD_STEPS = ALL_WIZARD_STEPS.filter(
  (step) => FILTERS_STEP_ENABLED || step.id !== "filters",
);

type WizardStepperDesign = "rail" | "legacy";

/** Set to "legacy" to restore the numbered stepper with the travelling bottom light. */
const WIZARD_STEPPER_DESIGN = "rail" as WizardStepperDesign;
const legacyStepper = WIZARD_STEPPER_DESIGN === "legacy";

function isValueFilled(o: Opt, value: unknown): boolean {
  if (o.type === "toggle") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (value && typeof value === "object") return Object.keys(value as object).length > 0;
  return value !== undefined && value !== null && value !== "";
}

function isOptSatisfied(o: Opt, getVal: (o: Opt) => unknown): boolean {
  if (o.level !== "required") return true;
  return isValueFilled(o, getVal(o));
}

function sectionHasErrors(fields: Opt[], getVal: (o: Opt) => unknown): boolean {
  const getValByKey = (group: string, name: string) => {
    const dependency = fields.find((field) => field.group === group && field.name === name);
    return dependency ? getVal(dependency) : "";
  };
  return fields.some(
    (o) =>
      isFieldVisible(o, getValByKey) &&
      o.level === "required" &&
      !isOptSatisfied(o, getVal),
  );
}

type WizardStepState = "disabled" | "active" | "selected";

function wizardStepState(index: number, currentStep: number, maxUnlockedStep: number): WizardStepState {
  if (index > maxUnlockedStep) return "disabled";
  if (index === currentStep) return "selected";
  return "active";
}

const SAMPLE_COLUMNS = allColumnNames();

/* config keys & defaults ------------------------------------------------ */
type Config = Record<string, unknown>;
const keyOf = (o: Opt) => `${o.group}::${o.name}`;

function withPaletteCardinalityEdgeCase(
  series: PreviewSeries,
  edgeCase: PaletteCardinalityEdgeCase,
): PreviewSeries {
  if (!edgeCase) return series;
  const count = edgeCase === "more-values" ? 10 : 3;
  const sourceLabels = series.labels?.length
    ? series.labels
    : Array.from({ length: count }, (_, index) => `Category ${index + 1}`);
  const sourceValues = series.values?.length ? series.values : [62, 48, 76, 34, 68];
  const labels = Array.from(
    { length: count },
    (_, index) => sourceLabels[index] ?? `Category ${index + 1}`,
  );
  const values = Array.from(
    { length: count },
    (_, index) =>
      sourceValues[index % sourceValues.length] +
      (index >= sourceValues.length ? ((index * 7) % 19) - 9 : 0),
  );
  const next: PreviewSeries = {
    ...series,
    labels,
    values,
    colorCategories: labels,
  };

  if (series.groups?.length) {
    next.groups = Array.from({ length: count }, (_, index) => {
      const source = series.groups![index % series.groups!.length];
      return {
        ...source,
        name:
          index < series.groups!.length
            ? source.name
            : `Series ${index + 1}`,
        values: [...source.values],
      };
    });
  }
  if (series.mapPoints?.length) {
    next.mapPoints = Array.from({ length: count }, (_, index) => {
      const source = series.mapPoints![index % series.mapPoints!.length];
      const label = labels[index];
      return {
        ...source,
        id: `edge-${index}`,
        label,
        category: label,
        value: values[index],
        x: 14 + (index % 5) * 18,
        y: 24 + Math.floor(index / 5) * 42,
      };
    });
  }
  if (series.scatterPoints?.length) {
    next.scatterPoints = Array.from({ length: count }, (_, index) => ({
      ...series.scatterPoints![index % series.scatterPoints!.length],
      x: index + 1,
      y: values[index],
      category: labels[index],
    }));
  }
  if (series.polar?.length) {
    next.polar = Array.from({ length: count }, (_, index) => ({
      ...series.polar![index % series.polar!.length],
      direction: labels[index],
      colorCategory: labels[index],
    }));
  }
  if (series.ranges?.length) {
    next.ranges = Array.from({ length: count }, (_, index) => {
      const source = series.ranges![index % series.ranges!.length];
      return { ...source, label: labels[index] };
    });
  }
  if (series.availability?.length) {
    next.availability = Array.from({ length: count }, (_, index) => {
      const source = series.availability![index % series.availability!.length];
      return { ...source, label: labels[index] };
    });
  }
  if (series.kpiTiles?.length) {
    next.kpiTiles = Array.from({ length: count }, (_, index) => {
      const source = series.kpiTiles![index % series.kpiTiles!.length];
      return {
        ...source,
        label: labels[index],
        status: labels[index],
        value: String(values[index]),
      };
    });
  }
  return next;
}

/** Former Area styling fields now live under Colors; keep old keys readable. */
const LEGACY_SETTING_KEYS: Record<string, string> = {
  "Colors::Line + Area colors": "Area styling::Line + Area colors",
  "Colors::Fill opacity": "Area styling::Fill opacity",
};

type MarginsValue = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  locked: boolean;
};

const defaultMargins = (): MarginsValue => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  locked: true,
});

function parseMargins(v: unknown): MarginsValue {
  if (v && typeof v === "object" && "top" in v && "locked" in v) {
    const m = v as MarginsValue;
    return {
      top: Number(m.top) || 0,
      right: Number(m.right) || 0,
      bottom: Number(m.bottom) || 0,
      left: Number(m.left) || 0,
      locked: Boolean(m.locked),
    };
  }
  const n = Number(v) || 0;
  return { top: n, right: n, bottom: n, left: n, locked: true };
}

function splitMinMax(raw: unknown): { min: string; max: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { min: "", max: "" };
  const m = s.match(/^(.*)\s*[/,–—-]\s*(.*)$/);
  if (m) return { min: m[1].trim(), max: m[2].trim() };
  return { min: s, max: "" };
}

function joinMinMax(min: string, max: string) {
  if (!min.trim() && !max.trim()) return "";
  return `${min.trim()} / ${max.trim()}`;
}

function isMinMaxNumber(o: Opt) {
  const n = o.name.toLowerCase();
  return n.includes("min/max") || (n.includes("range") && n.includes("min"));
}

function isMultiToggle(o: Opt, values: string[]) {
  return (
    o.name.toLowerCase().includes("show") ||
    o.name.toLowerCase() === "content" ||
    values.some((v) => v.toLowerCase().startsWith("show "))
  );
}

function multiChoices(o: Opt): string[] {
  return o.name === "Visible columns" ? SAMPLE_COLUMNS : o.values.length ? o.values : ["Field A", "Field B", "Field C"];
}

function defaultMulti(o: Opt): string[] {
  const values = multiChoices(o);
  if (isMultiToggle(o, values)) return [...values];
  if (o.name === "Visible columns") return [];
  return values.slice(0, Math.min(3, values.length));
}

function defaultColorList(o: Opt): Record<string, string> {
  const pal = ["#3FA7A0", "#73adf5", "#c6a7ff", "#ffd58a", "#f0888c", "#7ee0c0"];
  const n = o.name.toLowerCase();
  const keys = n.includes("status")
    ? uniqueValues("status")
    : n.includes("icon")
      ? uniqueValues("category")
      : uniqueValues("category");
  return Object.fromEntries(keys.map((k, i) => [k, pal[i % pal.length]]));
}

function isPaletteField(o: Opt): boolean {
  return o.type === "color" && o.name === "Palette" && (o.group === "Colors" || o.group === "Color");
}

function defaultSlider(o: Opt): number {
  const n = o.name.toLowerCase();
  if (n.includes("top n")) return 100;
  const range = o.desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const def = o.desc.match(/Default\s+([\d.]+)/i);
  if (range && def) {
    const lo = parseFloat(range[1]);
    const hi = parseFloat(range[2]);
    const v = parseFloat(def[1]);
    if (hi !== lo) return Math.round(((v - lo) / (hi - lo)) * 100);
  }
  if (n.includes("opacity")) return 40;
  return 50;
}

function isZoomScalingField(o: Opt) {
  return (
    /zoom scaling/i.test(o.name) ||
    o.name === "Disc scaling" ||
    (o.group === "Extrusion" && o.name === "Data range")
  );
}

function isUntouchedPlumePalette(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const palette = value as { style?: string; color?: string; paletteName?: string };
  return (
    palette.paletteName === WATER_PLUME_PALETTE.paletteName &&
    palette.style === WATER_PLUME_PALETTE.style &&
    palette.color?.toLowerCase() === WATER_PLUME_PALETTE.color.toLowerCase()
  );
}

function sliderPercentFor(o: Opt, value: number): number {
  const range = (o.desc ?? "").match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const lo = range ? parseFloat(range[1]) : 0;
  const hi = range ? parseFloat(range[2]) : 100;
  if (hi === lo) return 0;
  return Math.round(((value - lo) / (hi - lo)) * 100);
}

/** Unset Water Surfaces fields use the Plume catalog default. Spill and Current swap in their own until the control is moved. */
function waterSurfaceModeDefault(visualId: string, mode: unknown, o: Opt): unknown {
  if (visualId !== "water-surfaces") return undefined;
  if (mode === "Current" && o.group === "Surface Style" && o.name === "Opacity") return sliderPercentFor(o, 0.3);
  if (mode === "Spill" && o.group === "Stems" && o.name === "Max height") return sliderPercentFor(o, 24000);
  if (mode === "Spill" && o.group === "Stems" && o.name === "Fade start zoom") return sliderPercentFor(o, 7);
  if (mode === "Spill" && o.group === "Stems" && o.name === "Hidden by zoom") return sliderPercentFor(o, 9.5);
  if (mode === "Current" && o.group === "Color" && o.name === "Palette") return WATER_CURRENT_PALETTE;
  if (mode === "Spill" && o.group === "Color" && o.name === "Palette") return WATER_SPILL_PALETTE;
  return undefined;
}

function defaultFor(o: Opt, visualId?: string): unknown {
  if (o.defaultValue !== undefined) return o.defaultValue;
  switch (o.type) {
    case "toggle":
      return o.def !== false;
    case "segmented":
      return o.values[0] ?? "";
    case "posgrid":
      return "top-left";
    case "slider":
      return defaultSlider(o);
    case "margins":
      return defaultMargins();
    case "number":
      return o.name.toLowerCase().includes("range") ? "" : "24";
    case "color":
      return isPaletteField(o)
        ? {
            ...DEFAULT_COLOR_MODE,
            gradientAxis: defaultGradientAxisForVisual(visualId ?? "vertical-bar"),
            stops: DEFAULT_COLOR_MODE.stops.map((s) => ({ ...s })),
          }
        : "#3FA7A0";
    case "colorList":
      return defaultColorList(o);
    case "colorPair":
      return { stroke: "#3FA7A0", fill: "#3FA7A0" };
    case "multi":
      return defaultMulti(o);
    case "repeatable":
      if (isZoomScalingField(o)) return { ...DEFAULT_ZOOM_SCALING, stops: DEFAULT_ZOOM_SCALING.stops.map((s) => ({ ...s })) };
      if (o.name === "Color thresholds" || o.name.toLowerCase().includes("status")) {
        return [
          { min: "", max: "", color: "#f87171", label: "At risk", opacity: 100 },
          { min: "", max: "", color: "#fbbf24", label: "Watch", opacity: 100 },
          { min: "", max: "", color: "#34d399", label: "On track", opacity: 100 },
        ];
      }
      return DEFAULT_REPEATABLE.map((r) => ({ ...r }));
    case "gradient":
      return DEFAULT_GRADIENT.map((r) => ({ ...r }));
    case "dropdown":
      return o.values[0] ?? "";
    case "field":
      return "";
    case "text":
    default:
      return "";
  }
}

/* slider display value derived from the option's range description */
function sliderScale(o: Opt): { lo: number; hi: number; ticks: number; step: number; unit: string } {
  const desc = o.desc ?? "";
  const range = desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const stepMatch = desc.match(/step\s+(-?\d*\.?\d+)/i);
  const lo = range ? parseFloat(range[1]) : 0;
  const hi = range ? parseFloat(range[2]) : 100;
  const span = hi - lo;
  let unit = "";
  if (/%/.test(desc)) unit = "%";
  else if (/\bpx\b/i.test(desc)) unit = "px";
  else if (desc.includes("°")) unit = "°";
  else if (/\(m\)/i.test(o.name) || /\bm\b/i.test(desc)) unit = "m";

  let step = stepMatch ? parseFloat(stepMatch[1]) : 0;
  /* 0–1 ranges are continuous (opacity/ratio), not a 2-stop toggle. */
  if (!step && Number.isInteger(lo) && Number.isInteger(hi) && span > 1 && span <= 12) step = 1;
  const ticks = step > 0 && span > 0 ? Math.round(span / step) + 1 : 0;
  return { lo, hi, ticks: ticks >= 2 && ticks <= 12 ? ticks : 0, step, unit };
}

function sliderValue(o: Opt, pct: number): number {
  const { lo, hi, ticks, step } = sliderScale(o);
  const t = Math.max(0, Math.min(100, pct)) / 100;
  if (ticks >= 2) {
    const idx = Math.round(t * (ticks - 1));
    return lo + (idx / (ticks - 1)) * (hi - lo);
  }
  const raw = lo + t * (hi - lo);
  return step > 0 ? Math.min(hi, lo + Math.round((raw - lo) / step) * step) : raw;
}

function sliderDisplay(o: Opt, pct: number) {
  const { lo, hi, ticks, step, unit } = sliderScale(o);
  const val = sliderValue(o, pct);
  const stepDecimals = step > 0 && step < 1 ? Math.min(2, String(step).split(".")[1]?.length ?? 0) : 0;
  const decimals = hi <= 1 ? 2 : stepDecimals || (ticks && (hi - lo) / (ticks - 1) < 1 ? 1 : 0);
  const formatted = decimals === 0 ? String(Math.round(val)) : val.toFixed(decimals);
  if (!unit) return formatted;
  return unit === "°" || unit === "%" ? `${formatted}${unit}` : `${formatted} ${unit}`;
}

/* ---------- low-level interactive primitives ---------- */
function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      role="switch"
      aria-checked={value}
      className={"ia-mini-switch" + (value ? " on" : "")}
      onClick={() => onChange(!value)}
    />
  );
}

function Segmented({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) {
  const vals = (values.length ? values : ["One", "Two", "Three"]).slice(0, 3);
  const cur = vals.includes(value) ? value : vals[0];
  return (
    <div className="ia-segmented">
      {vals.map((v) => (
        <span key={v} className={v === cur ? "active" : ""} onClick={() => onChange(v)}>
          {v}
        </span>
      ))}
    </div>
  );
}

const PLACEMENTS = [
  { value: "top-left", row: 0, col: 0 },
  { value: "top-right", row: 0, col: 1 },
  { value: "bottom-left", row: 1, col: 0 },
  { value: "bottom-right", row: 1, col: 1 },
] as const;

const MARGIN_SIDES = [
  { key: "left" as const, label: "Left margin", Icon: AlignLeftSimple },
  { key: "top" as const, label: "Top margin", Icon: AlignTopSimple },
  { key: "right" as const, label: "Right margin", Icon: AlignRightSimple },
  { key: "bottom" as const, label: "Bottom margin", Icon: AlignBottomSimple },
];

function MarginsController({
  value,
  onChange,
}: {
  value: MarginsValue;
  onChange: (v: MarginsValue) => void;
}) {
  const setSide = (side: keyof Omit<MarginsValue, "locked">, raw: string) => {
    const n = raw === "" || raw === "-" ? 0 : Number(raw);
    const next = Number.isFinite(n) ? n : 0;
    if (value.locked) {
      onChange({ top: next, right: next, bottom: next, left: next, locked: true });
      return;
    }
    onChange({ ...value, [side]: next });
  };

  const toggleLock = () => {
    if (value.locked) {
      onChange({ ...value, locked: false });
      return;
    }
    const sync = value.top;
    onChange({ top: sync, right: sync, bottom: sync, left: sync, locked: true });
  };

  const LockIcon = value.locked ? Lock : LockOpen;

  return (
    <div className="ia-margins">
      {MARGIN_SIDES.map(({ key, label, Icon }) => (
        <label key={key} className="ia-margins__cell">
          <Icon className="ia-margins__icon" size={16} weight="regular" aria-hidden="true" />
          <input
            className="ia-margins__input"
            type="number"
            inputMode="numeric"
            aria-label={label}
            value={value[key]}
            onChange={(e) => setSide(key, e.target.value)}
          />
        </label>
      ))}
      <button
        type="button"
        className={"ia-margins__link" + (value.locked ? " ia-margins__link--on" : "")}
        aria-label={value.locked ? "Unlock margins" : "Lock margins together"}
        aria-pressed={value.locked}
        onClick={toggleLock}
      >
        <LockIcon size={16} weight="regular" aria-hidden="true" />
      </button>
    </div>
  );
}

function PlacementPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="ia-placement" role="radiogroup" aria-label="Legend placement">
      {PLACEMENTS.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          aria-label={`Legend ${p.value}`}
          className={"ia-placement-dot" + (value === p.value ? " active" : "")}
          onClick={() => onChange(p.value)}
        />
      ))}
    </div>
  );
}

function Chip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <span className={"ia-chip" + (selected ? " selected" : "")} onClick={onToggle}>
      {label}
    </span>
  );
}

const CHIP_OVERFLOW_AT = 8;

function OverflowChipSelect({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const remaining = values.filter((v) => !selected.includes(v));
  const compact = values.length > CHIP_OVERFLOW_AT;
  const shown = compact ? selected : values;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 240 });
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const syncMenuPosition = useCallback(() => {
    const el = moreRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(240, rect.width);
    let left = rect.left;
    left = Math.min(left, window.innerWidth - width - 8);
    left = Math.max(8, left);
    setMenuPos({ top: rect.bottom + 8, left, width });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    if (!open) return;
    syncMenuPosition();
    searchRef.current?.focus();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onLayout = () => syncMenuPosition();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, syncMenuPosition, close]);

  useEffect(() => {
    if (open && remaining.length === 0) close();
  }, [open, remaining.length, close]);

  const query = search.trim().toLowerCase();
  const filtered = query ? remaining.filter((v) => v.toLowerCase().includes(query)) : remaining;

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  const add = (v: string) => {
    if (!selected.includes(v)) onChange([...selected, v]);
  };

  return (
    <div className="ia-chips">
      {shown.map((v) => (
        <Chip
          key={v}
          label={v}
          selected={compact || selected.includes(v)}
          onToggle={() => toggle(v)}
        />
      ))}
      {compact && remaining.length > 0 && (
        <>
          <button
            ref={moreRef}
            type="button"
            className={"ia-chip ia-chip--more" + (open ? " is-open" : "")}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={`Add ${remaining.length} more columns`}
            onClick={() => {
              if (open) {
                close();
                return;
              }
              setSearch("");
              syncMenuPosition();
              setOpen(true);
            }}
          >
            +{remaining.length}
          </button>
          {open &&
            createPortal(
              <div
                ref={menuRef}
                className="cp-picker-menu cp-picker-menu--flyout ia-chips-menu"
                role="listbox"
                aria-multiselectable="true"
                aria-label="Remaining columns"
                style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
              >
                <div className="dropdown-menu__inner">
                  <div className="cp-picker-search">
                    <input
                      ref={searchRef}
                      type="search"
                      placeholder="Search columns"
                      value={search}
                      aria-label="Search columns"
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Escape") {
                          close();
                          return;
                        }
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (filtered[0]) add(filtered[0]);
                      }}
                    />
                    {search && (
                      <button
                        type="button"
                        className="cp-picker-search-clear"
                        aria-label="Clear search"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setSearch("")}
                      >
                        <CloseIcon width={14} height={14} strokeWidth={1} aria-hidden="true" />
                      </button>
                    )}
                    <SearchIcon className="cp-picker-search-ico" width={14} height={14} />
                  </div>
                  <div className="cp-picker-list">
                    {filtered.map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="cp-picker-row"
                        onClick={() => add(v)}
                      >
                        <span className="cp-picker-row-name">{v}</span>
                      </button>
                    ))}
                    {!filtered.length && <div className="cp-picker-empty">No columns found</div>}
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}

const TAB_STATUS_INCOMPLETE = "There are required fields that are empty";
const TAB_STATUS_COMPLETE = "All required fields are filled";

function useHoverTip<T extends HTMLElement>() {
  const anchorRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const syncPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const show = () => {
    syncPosition();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  return { anchorRef, open, coords, show, hide };
}

function HoverTip({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { anchorRef, open, coords, show, hide } = useHoverTip<HTMLSpanElement>();

  return (
    <>
      <span
        ref={anchorRef}
        className={className}
        role="img"
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <span
            className="ia-field-info__tip ia-field-info__tip--flyout"
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}

function FieldInfoTip({ desc }: { desc: string }) {
  const { anchorRef, open, coords, show, hide } = useHoverTip<HTMLButtonElement>();

  if (!desc.trim()) return null;

  return (
    <>
      <span className="ia-field-info">
        <button
          ref={anchorRef}
          type="button"
          className="ia-field-info__btn"
          aria-label={desc}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
        >
          <Question className="ia-field-info__icon" size={20} weight="regular" aria-hidden="true" />
        </button>
      </span>
      {open &&
        createPortal(
          <span
            className="ia-field-info__tip ia-field-info__tip--flyout"
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
          >
            {desc}
          </span>,
          document.body,
        )}
    </>
  );
}

/* ---------- control renderer (one per option type) ---------- */
function Control({
  o,
  getVal,
  setVal,
  multiOptionExtra,
}: {
  o: Opt;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
  multiOptionExtra?: { after: string; content: ReactNode };
}) {
  if (o.group === "Marker Shape" && o.name === "Icons") {
    return (
      <PhosphorIconPicker
        value={String(getVal(o))}
        onChange={(value) => setVal(o, value)}
      />
    );
  }

  switch (o.type) {
    case "segmented": {
      const rawValue = String(getVal(o));
      const value =
        o.group === "Extrusion" && o.name === "Extrusion mode" && rawValue === "Height"
          ? "Fixed height"
          : rawValue;
      return <Segmented values={o.values} value={value} onChange={(v) => setVal(o, v)} />;
    }

    case "posgrid":
      return <PlacementPicker value={String(getVal(o))} onChange={(v) => setVal(o, v)} />;

    case "slider": {
      const scale = sliderScale(o);
      const rawValue = getVal(o);
      const numericValue = Number(rawValue);
      const pct =
        typeof rawValue === "string" && rawValue.trim() !== "" && scale.hi !== scale.lo
          ? ((numericValue - scale.lo) / (scale.hi - scale.lo)) * 100
          : numericValue;
      const discrete = scale.ticks >= 2;
      const isOpacity = /opacity/i.test(o.name);
      const max = discrete ? scale.ticks - 1 : 100;
      const idx = discrete
        ? Math.round((Math.max(0, Math.min(100, pct)) / 100) * max)
        : Math.max(0, Math.min(100, pct));
      const fillPct = discrete ? (idx / max) * 100 : idx;
      return (
        <div className={"ia-slider" + (discrete ? " ia-slider--steps" : "")}>
          <div
            className="ia-slider-track"
            style={{ ["--ia-slider-t" as string]: max === 0 ? 0 : idx / max }}
          >
            {discrete && (
              <div className="ia-slider-dots" aria-hidden="true">
                {Array.from({ length: scale.ticks }, (_, i) => (
                  <span
                    key={i}
                    className={"ia-slider-dot" + (i <= idx ? " is-covered" : "")}
                    style={{ ["--ia-slider-t" as string]: max === 0 ? 0 : i / max }}
                  />
                ))}
              </div>
            )}
            <div className="ia-slider-fill">
              <span className="ia-slider-thumb" aria-hidden="true" />
            </div>
            <input
              type="range"
              className="ia-range"
              min={0}
              max={max}
              step={1}
              value={idx}
              aria-label={o.name}
              onChange={(e) => {
                const next = Number(e.target.value);
                setVal(o, discrete ? (next / max) * 100 : next);
              }}
              onPointerMove={(e) => {
                const track = e.currentTarget.parentElement;
                const thumb = track?.querySelector<HTMLElement>(".ia-slider-thumb");
                if (!track || !thumb) return;

                const rect = thumb.getBoundingClientRect();
                const hitSlop = 6;
                const isOverThumb =
                  e.clientX >= rect.left - hitSlop &&
                  e.clientX <= rect.right + hitSlop &&
                  e.clientY >= rect.top - hitSlop &&
                  e.clientY <= rect.bottom + hitSlop;
                track.classList.toggle("is-thumb-hovered", isOverThumb);
              }}
              onPointerLeave={(e) => {
                e.currentTarget.parentElement?.classList.remove("is-thumb-hovered");
              }}
            />
          </div>
          {isOpacity ? (
            <label className="ia-slider-val ia-slider-val--percent-input">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(fillPct)}
                aria-label={`${o.name} percentage`}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setVal(o, Math.max(0, Math.min(100, next)));
                }}
              />
              <span>%</span>
            </label>
          ) : o.editableValue ? (
            <input
              className="ia-slider-val ia-slider-val--input"
              type="number"
              min={scale.lo}
              max={scale.hi}
              step={
                discrete
                  ? (scale.hi - scale.lo) / max
                  : Math.max((scale.hi - scale.lo) / 100, scale.hi <= 1 ? 0.01 : 1)
              }
              value={Number(sliderValue(o, fillPct).toFixed(scale.hi <= 1 ? 2 : 0))}
              aria-label={`${o.name} value`}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next) || scale.hi === scale.lo) return;
                setVal(o, ((Math.max(scale.lo, Math.min(scale.hi, next)) - scale.lo) / (scale.hi - scale.lo)) * 100);
              }}
            />
          ) : (
            <div className="ia-slider-val">{sliderDisplay(o, fillPct)}</div>
          )}
        </div>
      );
    }

    case "margins":
      return (
        <MarginsController
          value={parseMargins(getVal(o))}
          onChange={(v) => setVal(o, v)}
        />
      );

    case "number": {
      if (isMinMaxNumber(o)) {
        const { min, max } = splitMinMax(getVal(o));
        return (
          <div className="ia-two-col ia-minmax">
            <div className="ia-surface ia-text">
              <input
                value={min}
                placeholder="Min"
                aria-label="Min"
                inputMode="decimal"
                onChange={(e) => setVal(o, joinMinMax(e.target.value, max))}
              />
            </div>
            <div className="ia-surface ia-text">
              <input
                value={max}
                placeholder="Max"
                aria-label="Max"
                inputMode="decimal"
                onChange={(e) => setVal(o, joinMinMax(min, e.target.value))}
              />
            </div>
          </div>
        );
      }
      const v = String(getVal(o));
      const bump = (d: number) => setVal(o, String((Number(v) || 0) + d));
      return (
        <div className="ia-surface ia-number">
          <input value={v} onChange={(e) => setVal(o, e.target.value)} />
          <div className="ia-stepper">
            <span onClick={() => bump(-1)}>−</span>
            <span onClick={() => bump(1)}>+</span>
          </div>
        </div>
      );
    }

    case "text":
      return (
        <div className="ia-surface ia-text">
          <input
            value={String(getVal(o))}
            placeholder={
              o.name.toLowerCase().includes("format")
                ? ".0f"
                : o.name === "Template"
                  ? "{status} · {value}"
                  : o.name === "Fallback"
                    ? "Constant text"
                    : o.name === "X axis label" || o.name === "Y axis label" || o.group === "KPI Display"
                      ? o.name
                      : "Manual value"
            }
            onChange={(e) => setVal(o, e.target.value)}
          />
        </div>
      );

    case "color":
      if (isPaletteField(o)) {
        const current = asColorMode(getVal(o));
        return (
          <ColorPalette
            variant="full"
            color={current.color}
            setColor={() => {}}
            value={current}
            onChange={(next) => setVal(o, next)}
            styles={
              o.values.length
                ? (o.values as PaletteStyle[])
                : o.group === "Color"
                  ? ["Single", "Per Category", "Gradient", "Steps"]
                  : undefined
            }
          />
        );
      }
      return <ColorPalette color={String(getVal(o))} setColor={(c) => setVal(o, c)} variant="simple" />;

    case "colorPair": {
      const pair = (getVal(o) as { stroke?: string; fill?: string }) ?? {};
      return (
        <div className="ia-color-pair">
          <div className="ia-color-list__palette">
            <span className="cp-label">Color palette</span>
            <PaletteSelector />
          </div>
          <label className="ia-color-pair__item">
            <span>Stroke</span>
            <ColorPalette
              color={pair.stroke || "#2de8c8"}
              setColor={(c) => setVal(o, { ...pair, stroke: c })}
              variant="swatch"
            />
          </label>
          <label className="ia-color-pair__item">
            <span>Fill</span>
            <ColorPalette
              color={pair.fill || "#2de8c8"}
              setColor={(c) => setVal(o, { ...pair, fill: c })}
              variant="swatch"
            />
          </label>
        </div>
      );
    }

    case "colorList": {
      const map = (getVal(o) as Record<string, string>) ?? {};
      const entries = Object.keys(map).length ? Object.entries(map) : Object.entries(defaultColorList(o));
      return (
        <div className="ia-surface ia-color-list">
          <div className="ia-color-list__palette">
            <span className="cp-label">Color palette</span>
            <PaletteSelector />
          </div>
          {entries.map(([label, color]) => (
            <div key={label} className="ia-color-list__row">
              <span className="ia-color-list__label">{label}</span>
              <ColorPalette
                color={color}
                setColor={(c) => setVal(o, { ...map, [label]: c })}
                variant="swatch"
              />
            </div>
          ))}
        </div>
      );
    }

    case "multi": {
      const values = multiChoices(o);
      const selected = asStringArray(getVal(o));
      const toggle = (v: string) =>
        setVal(o, selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      if (isMultiToggle(o, values))
        return (
          <>
            {values.map((v) => (
              <Fragment key={v}>
                <div className="ia-toggle-flat">
                  <div className="ia-toggle-line">
                    <strong>{v}</strong>
                    <Switch value={selected.includes(v)} onChange={() => toggle(v)} />
                  </div>
                </div>
                {multiOptionExtra?.after === v && multiOptionExtra.content}
              </Fragment>
            ))}
          </>
        );
      return (
        <OverflowChipSelect values={values} selected={selected} onChange={(next) => setVal(o, next)} />
      );
    }

    case "repeatable": {
      if (isZoomScalingField(o)) {
        return (
          <ZoomScalingControl
            value={getVal(o)}
            onChange={(next) => setVal(o, next)}
            dataRangeOnly={o.group === "Extrusion" && o.name === "Data range"}
          />
        );
      }
      const rows = asRepeatable(getVal(o));
      const update = (next: RepeatableRow[]) => setVal(o, next);
      if (o.name === "Color thresholds") {
        const current = {
          ...DEFAULT_COLOR_MODE,
          style: "Steps" as const,
          color: rows[rows.length - 1]?.color ?? DEFAULT_COLOR_MODE.color,
          stops: repeatableToStops(rows),
        };
        return (
          <ColorPalette
            variant="steps"
            color={current.color}
            setColor={() => {}}
            value={current}
            onChange={(next) => update(stopsToRepeatable(next.stops, rows))}
          />
        );
      }
      if (o.name === "Status → tile accent color") {
        return <CategoryColorMap rows={rows} onChange={update} />;
      }
      return (
        <div className="ia-surface ia-repeat">
          {rows.map((row, i) => (
            <div key={i} className="ia-rule ia-rule--edit">
              <input
                className="ia-rule-input"
                value={row.label}
                aria-label="Label"
                onChange={(e) => {
                  const next = rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r));
                  update(next);
                }}
              />
              <input
                className="ia-rule-input ia-rule-input--num"
                value={row.min}
                aria-label="Min"
                onChange={(e) => {
                  const next = rows.map((r, j) => (j === i ? { ...r, min: e.target.value } : r));
                  update(next);
                }}
              />
              <input
                className="ia-rule-input ia-rule-input--num"
                value={row.max}
                aria-label="Max"
                onChange={(e) => {
                  const next = rows.map((r, j) => (j === i ? { ...r, max: e.target.value } : r));
                  update(next);
                }}
              />
              <ColorPalette
                color={row.color}
                setColor={(c) => update(rows.map((r, j) => (j === i ? { ...r, color: c } : r)))}
                variant="swatch"
              />
              <span
                className="ia-rule-x"
                role="button"
                onClick={() => update(rows.filter((_, j) => j !== i))}
              >
                ×
              </span>
            </div>
          ))}
          <button
            type="button"
            className="cp-add"
            onClick={() =>
              update([
                ...rows,
                {
                  min: String(rows.length * 50),
                  max: String(rows.length * 50 + 50),
                  color: ["#3FA7A0", "#73adf5", "#c6a7ff", "#f0888c"][rows.length % 4],
                  label: `Stop ${rows.length + 1}`,
                },
              ])
            }
          >
            Add row
          </button>
        </div>
      );
    }

    case "gradient": {
      const stops = asGradient(getVal(o));
      const update = (next: GradientStop[]) => setVal(o, next);
      return (
        <div className="ia-surface ia-gradient-edit">
          <div
            className="ia-gradient"
            style={{
              background: `linear-gradient(90deg, ${stops
                .map((s) => `${s.color} ${s.at}%`)
                .join(", ")})`,
            }}
          />
          {stops.map((stop, i) => (
            <div key={i} className="ia-rule ia-rule--edit">
              <input
                className="ia-rule-input ia-rule-input--num"
                type="number"
                min={0}
                max={100}
                value={stop.at}
                aria-label="Stop position"
                onChange={(e) =>
                  update(stops.map((s, j) => (j === i ? { ...s, at: Number(e.target.value) } : s)))
                }
              />
              <ColorPalette
                color={stop.color}
                setColor={(c) => update(stops.map((s, j) => (j === i ? { ...s, color: c } : s)))}
                variant="swatch"
              />
              <span
                className="ia-rule-x"
                role="button"
                onClick={() => update(stops.filter((_, j) => j !== i))}
              >
                ×
              </span>
            </div>
          ))}
          <button
            type="button"
            className="cp-add"
            onClick={() =>
              update([...stops, { color: "#ffd58a", at: Math.min(100, (stops[stops.length - 1]?.at ?? 0) + 25) }])
            }
          >
            Add stop
          </button>
        </div>
      );
    }

    case "dropdown":
    case "field":
    default: {
      const options = o.type === "field" ? fieldOptionsFor(o.name) : o.values.map((v) => ({ value: v, label: v }));
      const list = options.length ? options : [{ value: `Set ${o.name}`, label: `Set ${o.name}` }];
      return (
        <Dropdown
          value={String(getVal(o))}
          onChange={(v) => setVal(o, v)}
          allowEmpty={o.type === "field" && o.level !== "required"}
          searchable={o.type === "field"}
          placeholder={o.type === "field" ? `Select ${o.name.toLowerCase()}` : undefined}
          options={list}
        />
      );
    }
  }
}

/* ---------- field block (name + level icon + control) ---------- */
function FieldBlock({
  o,
  getVal,
  setVal,
  multiOptionExtra,
}: {
  o: Opt;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
  multiOptionExtra?: { after: string; content: ReactNode };
}) {
  if (isPaletteField(o)) {
    return (
      <div className="ia-color-mode">
        <Control o={o} getVal={getVal} setVal={setVal} />
      </div>
    );
  }
  if (o.type === "toggle") {
    return (
      <div className="ia-toggle-flat">
        <div className="ia-toggle-line">
          <div className="ia-toggle-line-label">
            <strong>{o.name}</strong>
            <FieldInfoTip desc={o.desc} />
          </div>
          <Switch value={Boolean(getVal(o))} onChange={(v) => setVal(o, v)} />
        </div>
      </div>
    );
  }
  if (o.type === "multi" && isMultiToggle(o, multiChoices(o))) {
    return <Control o={o} getVal={getVal} setVal={setVal} multiOptionExtra={multiOptionExtra} />;
  }
  if (o.type === "posgrid") {
    return (
      <div className="ia-toggle-flat">
        <div className="ia-toggle-line">
          <div className="ia-toggle-line-label">
            <strong>{o.name}</strong>
            <FieldInfoTip desc={o.desc} />
          </div>
          <PlacementPicker value={String(getVal(o))} onChange={(v) => setVal(o, v)} />
        </div>
      </div>
    );
  }
  if (o.group === "Extrusion" && o.name === "Data range") {
    return (
      <div className="ia-field">
        <Control o={o} getVal={getVal} setVal={setVal} />
      </div>
    );
  }
  return (
    <div className="ia-field">
      <div className="ia-field-top">
        <div className="ia-field-label">
          <div className="ia-field-name">{o.name}</div>
          <FieldInfoTip desc={o.desc} />
        </div>
        {o.level === "required" && (
          <div className="ia-pill ia-pill--required">
            <RequiredIcon width={12} height={12} />
            <span>required</span>
          </div>
        )}
      </div>
      <Control o={o} getVal={getVal} setVal={setVal} />
    </div>
  );
}

function MinMaxRangeField({
  minOption,
  maxOption,
  getVal,
  setVal,
}: {
  minOption: Opt;
  maxOption: Opt;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
}) {
  const rawMin = String(getVal(minOption));
  const rawMax = String(getVal(maxOption));
  const parsedMin = Number(rawMin);
  const parsedMax = Number(rawMax);
  const minValue = Number.isFinite(parsedMin) ? parsedMin : 0;
  const maxValue = Number.isFinite(parsedMax) ? parsedMax : 100;
  const domainMin = Math.min(0, minValue, maxValue - 1);
  const domainMax = Math.max(100, maxValue, minValue + 1);
  const span = domainMax - domainMin;
  const low = Math.min(minValue, maxValue);
  const high = Math.max(minValue, maxValue);
  const lowPct = ((low - domainMin) / span) * 100;
  const highPct = ((high - domainMin) / span) * 100;
  const step = span <= 10 ? 0.1 : 1;

  return (
    <div className="ia-field ia-minmax-range-field">
      <div className="ia-field-top">
        <div className="ia-field-label">
          <div className="ia-field-name">Min / Max</div>
          <FieldInfoTip desc={`${minOption.desc} ${maxOption.desc}`.trim()} />
        </div>
      </div>
      <div
        className="ia-dual-range"
        style={{
          ["--ia-range-low" as string]: lowPct / 100,
          ["--ia-range-high" as string]: highPct / 100,
        }}
      >
        <div className="ia-dual-range__track" aria-hidden="true">
          <span className="ia-dual-range__fill" />
          <span className="ia-dual-range__thumb ia-dual-range__thumb--min" />
          <span className="ia-dual-range__thumb ia-dual-range__thumb--max" />
        </div>
        <input
          className="ia-dual-range__input ia-dual-range__input--min"
          type="range"
          min={domainMin}
          max={domainMax}
          step={step}
          value={low}
          aria-label="Minimum"
          onChange={(event) =>
            setVal(minOption, String(Math.min(Number(event.target.value), maxValue)))
          }
          onPointerMove={(event) => {
            const control = event.currentTarget.parentElement;
            const thumb = control?.querySelector<HTMLElement>(".ia-dual-range__thumb--min");
            if (!control || !thumb) return;
            const rect = thumb.getBoundingClientRect();
            control.classList.toggle(
              "is-min-thumb-hovered",
              event.clientX >= rect.left - 6 &&
                event.clientX <= rect.right + 6 &&
                event.clientY >= rect.top - 6 &&
                event.clientY <= rect.bottom + 6,
            );
          }}
          onPointerLeave={(event) =>
            event.currentTarget.parentElement?.classList.remove("is-min-thumb-hovered")
          }
        />
        <input
          className="ia-dual-range__input ia-dual-range__input--max"
          type="range"
          min={domainMin}
          max={domainMax}
          step={step}
          value={high}
          aria-label="Maximum"
          onChange={(event) =>
            setVal(maxOption, String(Math.max(Number(event.target.value), minValue)))
          }
          onPointerMove={(event) => {
            const control = event.currentTarget.parentElement;
            const thumb = control?.querySelector<HTMLElement>(".ia-dual-range__thumb--max");
            if (!control || !thumb) return;
            const rect = thumb.getBoundingClientRect();
            control.classList.toggle(
              "is-max-thumb-hovered",
              event.clientX >= rect.left - 6 &&
                event.clientX <= rect.right + 6 &&
                event.clientY >= rect.top - 6 &&
                event.clientY <= rect.bottom + 6,
            );
          }}
          onPointerLeave={(event) =>
            event.currentTarget.parentElement?.classList.remove("is-max-thumb-hovered")
          }
        />
      </div>
      <div className="ia-dual-range__values">
        <label>
          <span>Min</span>
          <input
            type="number"
            value={rawMin}
            aria-label="Minimum value"
            onChange={(event) => setVal(minOption, event.target.value)}
          />
        </label>
        <label>
          <span>Max</span>
          <input
            type="number"
            value={rawMax}
            aria-label="Maximum value"
            onChange={(event) => setVal(maxOption, event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

/* Pair adjacent X / Y mapping fields and min / max siblings so they render side-by-side. */
const isXField = (o: Opt) => /^x[\s-]?(axis|value|category)\b/i.test(o.name);
const isYField = (o: Opt) => /^y[\s-]?(axis|value|category)\b/i.test(o.name);
const minMaxPairKey = (name: string) =>
  name.replace(/\bmin(?:imum)?\b/gi, "§").replace(/\bmax(?:imum)?\b/gi, "§");
const isMinName = (name: string) => /\bmin(?:imum)?\b/i.test(name) && !/\bmax(?:imum)?\b/i.test(name);
const isMaxName = (name: string) => /\bmax(?:imum)?\b/i.test(name) && !/\bmin(?:imum)?\b/i.test(name);
function pairAxes(items: Opt[]): (Opt | [Opt, Opt])[] {
  const rows: (Opt | [Opt, Opt])[] = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    if (next && isXField(cur) && isYField(next)) {
      rows.push([cur, next]);
      i++;
    } else if (next && isMinName(cur.name) && isMaxName(next.name) && minMaxPairKey(cur.name) === minMaxPairKey(next.name)) {
      rows.push([cur, next]);
      i++;
    } else if (next && cur.name === "Wind speed" && next.name === "Band") {
      rows.push([cur, next]);
      i++;
    } else {
      rows.push(cur);
    }
  }
  return rows;
}

function renderFieldRows(
  rows: (Opt | [Opt, Opt])[],
  getVal: (o: Opt) => unknown,
  setVal: (o: Opt, v: unknown) => void,
) {
  return rows.map((row) =>
    Array.isArray(row) ? (
      <div className="ia-two-col" key={row[0].group + row[0].name}>
        <FieldBlock o={row[0]} getVal={getVal} setVal={setVal} />
        <FieldBlock o={row[1]} getVal={getVal} setVal={setVal} />
      </div>
    ) : (
      <FieldBlock key={row.group + row.name} o={row} getVal={getVal} setVal={setVal} />
    ),
  );
}

function visibleWhenKey(o: Opt): string | null {
  const conditions = visibleWhenConditions(o.visibleWhen);
  if (!conditions.length) return null;
  return conditions
    .map((c) => {
      const [op, v] = "is" in c ? ["is", c.is] : ["not", c.isNot];
      return `${c.group}::${c.name}::${op}::${Array.isArray(v) ? v.join("|") : v}`;
    })
    .join("&&");
}

function revealsFrom(item: Opt, parent: Opt): boolean {
  const first = visibleWhenConditions(item.visibleWhen)[0];
  return first?.group === parent.group && first?.name === parent.name;
}

type RevealGroup = { key: string; fields: Opt[] };
type FieldCluster = { parent: Opt | null; reveals: RevealGroup[] };

function clusterFields(items: Opt[]): FieldCluster[] {
  const clusters: FieldCluster[] = [];
  let i = 0;
  while (i < items.length) {
    const o = items[i];
    if (o.visibleWhen) {
      const key = visibleWhenKey(o)!;
      const fields: Opt[] = [];
      while (i < items.length && visibleWhenKey(items[i]) === key) fields.push(items[i++]);
      clusters.push({ parent: null, reveals: [{ key, fields }] });
      continue;
    }
    i += 1;
    const reveals: RevealGroup[] = [];
    while (i < items.length && revealsFrom(items[i], o)) {
      const key = visibleWhenKey(items[i])!;
      const fields: Opt[] = [];
      while (i < items.length && visibleWhenKey(items[i]) === key) fields.push(items[i++]);
      reveals.push({ key, fields });
    }
    clusters.push({ parent: o, reveals });
  }
  return clusters;
}

function RevealPanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const inertProps = { inert: !open || undefined } as HTMLAttributes<HTMLDivElement>;
  return (
    <div className={"ia-reveal" + (open ? " is-open" : "")} aria-hidden={!open} {...inertProps}>
      <div className="ia-reveal__inner">{children}</div>
    </div>
  );
}

function fieldClusterNodes(
  items: Opt[],
  getVal: (o: Opt) => unknown,
  setVal: (o: Opt, v: unknown) => void,
  getValByKey: (group: string, name: string) => unknown,
  tickLabelAdvanced?: ReactNode,
): ReactNode[] {
  const clusters = clusterFields(items);
  const nodes: ReactNode[] = [];
  const renderClusterField = (o: Opt, key = `${o.group}:${o.name}`) => (
    <FieldBlock
      key={key}
      o={o}
      getVal={getVal}
      setVal={setVal}
      multiOptionExtra={
        o.name === "Show ticks / tick labels / gridlines" && tickLabelAdvanced
          ? { after: "Show Tick Labels", content: tickLabelAdvanced }
          : undefined
      }
    />
  );
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const next = clusters[i + 1];
    if (
      cluster.parent?.group === "Mapping" &&
      cluster.parent.name === "Min" &&
      cluster.parent.type === "number" &&
      !cluster.reveals.length &&
      next?.parent?.group === "Mapping" &&
      next.parent.name === "Max" &&
      next.parent.type === "number" &&
      !next.reveals.length
    ) {
      nodes.push(
        <MinMaxRangeField
          key="mapping-min-max"
          minOption={cluster.parent}
          maxOption={next.parent}
          getVal={getVal}
          setVal={setVal}
        />,
      );
      i += 1;
      continue;
    }
    if (
      cluster.parent &&
      !cluster.reveals.length &&
      next?.parent &&
      !next.reveals.length &&
      isXField(cluster.parent) &&
      isYField(next.parent)
    ) {
      nodes.push(
        <div className="ia-two-col" key={cluster.parent.group + cluster.parent.name}>
          {renderClusterField(cluster.parent)}
          {renderClusterField(next.parent)}
        </div>,
      );
      i += 1;
      continue;
    }
    const reveals = cluster.reveals.map((group) => (
      <RevealPanel key={group.key} open={isFieldVisible(group.fields[0], getValByKey)}>
        {renderFieldRows(pairAxes(group.fields), getVal, setVal)}
      </RevealPanel>
    ));
    if (!cluster.parent) {
      const visibleReveals = cluster.reveals.filter((group) =>
        isFieldVisible(group.fields[0], getValByKey),
      );
      if (!visibleReveals.length) continue;
      nodes.push(
        <div className="ia-standalone-reveal" key={cluster.reveals[0]?.key ?? i}>
          {visibleReveals.map((group) => (
            <RevealPanel key={group.key} open>
              {renderFieldRows(pairAxes(group.fields), getVal, setVal)}
            </RevealPanel>
          ))}
        </div>,
      );
      continue;
    }
    if (!cluster.reveals.length) {
      nodes.push(renderClusterField(cluster.parent));
      continue;
    }
    nodes.push(
      <div className="ia-field-cluster" key={cluster.parent.group + cluster.parent.name}>
        {renderClusterField(cluster.parent)}
        {reveals}
      </div>,
    );
  }
  return nodes;
}

/* ---------- group card ---------- */
const INLINE_TICK_LABEL_ADVANCED = new Set([
  "Tick count",
  "Tick rotation",
  "Tick label formatter",
]);

type FlagPropertyMode = "select" | "expression";
type FlagValueMode = "string" | "expression";
type FlagCondition = {
  id: number;
  propertyMode: FlagPropertyMode;
  property: string;
  operatorType: FlagOperatorType;
  operator: string;
  valueMode: FlagValueMode;
  value: string;
};

type FlagSettingsValue = {
  label: string;
  conditionJoin: string;
  conditions: Array<Omit<FlagCondition, "id">>;
  tooltipMode: FlagValueMode;
  tooltipInsight: string;
};

type FlagPropertyType = "text" | "number" | "boolean" | "date";
type FlagPropertyGroup = {
  id: "asset" | "series";
  label: string;
  fields: Array<{ name: string; type: FlagPropertyType }>;
};

const FLAG_PROPERTY_GROUPS: FlagPropertyGroup[] = [
  {
    id: "asset",
    label: "Asset Data",
    fields: [
      { name: "region", type: "text" },
      { name: "category", type: "text" },
      { name: "status", type: "text" },
      { name: "score", type: "number" },
      { name: "density", type: "number" },
      { name: "alertLevel", type: "text" },
      { name: "isCritical", type: "boolean" },
      { name: "updatedAt", type: "date" },
    ],
  },
  {
    id: "series",
    label: "Series Metrics",
    fields: [
      { name: "populationCount", type: "number" },
      { name: "growthRate", type: "number" },
      { name: "anomalyScore", type: "number" },
      { name: "variance", type: "number" },
      { name: "hasDrift", type: "boolean" },
    ],
  },
];

type FlagOperatorType = "string" | "number" | "datetime" | "boolean" | "array" | "object";

const FLAG_OPERATOR_GROUPS: Array<{
  id: FlagOperatorType;
  label: string;
  operators: string[];
}> = [
  {
    id: "string",
    label: "String",
    operators: [
      "exists",
      "does not exist",
      "is empty",
      "is not empty",
      "is equal to",
      "is equal to (case insensitive)",
      "is not equal to",
      "is not equal to (case insensitive)",
      "contains",
      "contains (case insensitive)",
      "does not contain",
      "does not contain (case insensitive)",
      "starts with",
      "starts with (case insensitive)",
      "does not start with",
      "does not start with (case insensitive)",
      "ends with",
      "ends with (case insensitive)",
      "does not end with",
      "does not end with (case insensitive)",
      "matches regex",
      "matches regex (case insensitive)",
      "does not match regex",
      "does not match regex (case insensitive)",
    ],
  },
  {
    id: "number",
    label: "Number",
    operators: [
      "exists",
      "does not exist",
      "is empty",
      "is not empty",
      "is equal to",
      "is not equal to",
      "is greater than",
      "is less than",
      "is greater than or equal to",
      "is less than or equal to",
    ],
  },
  {
    id: "datetime",
    label: "Date & Time",
    operators: [
      "exists",
      "does not exist",
      "is empty",
      "is not empty",
      "is equal to",
      "is not equal to",
      "is after",
      "is before",
      "is after or equal to",
      "is before or equal to",
    ],
  },
  {
    id: "boolean",
    label: "Boolean",
    operators: ["exists", "does not exist", "is empty", "is not empty", "is true", "is false"],
  },
  {
    id: "array",
    label: "Array",
    operators: [
      "exists",
      "does not exist",
      "is empty",
      "is not empty",
      "contains",
      "does not contain",
      "length equal to",
      "length not equal to",
      "length greater than",
      "length less than",
      "length greater than or equal to",
      "length less than or equal to",
    ],
  },
  {
    id: "object",
    label: "Object",
    operators: ["exists", "does not exist", "is empty", "is not empty"],
  },
];

function FlagOperatorTypeIcon({ type, size = 16 }: { type: FlagOperatorType; size?: number }) {
  const props = { size, weight: "regular" as const, "aria-hidden": true };
  if (type === "string") return <TextT {...props} />;
  if (type === "number") return <Hash {...props} />;
  if (type === "datetime") return <CalendarBlank {...props} />;
  if (type === "boolean") return <CheckSquare {...props} />;
  if (type === "array") return <BracketsSquare {...props} />;
  return <BracketsCurly {...props} />;
}

function FlagPropertyTypeChip({ type }: { type: FlagPropertyType }) {
  const label =
    type === "text" ? "String" : type === "number" ? "Number" : type === "boolean" ? "Boolean" : "Date";
  return (
    <span className={`cp-picker-badge cp-picker-badge--${type}`} aria-hidden="true">
      {label}
    </span>
  );
}

function FlagPropertyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<FlagPropertyGroup["id"] | null>("asset");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleGroups = FLAG_PROPERTY_GROUPS.map((group) => ({
    ...group,
    fields: normalizedSearch
      ? group.fields.filter((field) => field.name.toLowerCase().includes(normalizedSearch))
      : group.fields,
  })).filter((group) => group.fields.length > 0);

  return (
    <div className="flag-property-picker" ref={rootRef}>
      <button
        type="button"
        className={"cp-picker-trigger" + (value ? "" : " is-placeholder") + (open ? " is-open" : "")}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setSearch("");
          setOpen((current) => !current);
        }}
      >
        <span className="cp-picker-trigger-name">{value || "Select property"}</span>
        <ChevronDownIcon className="cp-caret" width={16} height={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="cp-picker-menu flag-property-picker__menu" role="listbox">
          <div className="dropdown-menu__inner">
            <label className="flag-property-picker__search">
              <SearchIcon width={16} height={16} aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={search}
                placeholder="Search property..."
                aria-label="Search properties"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="flag-property-picker__groups">
              {visibleGroups.map((group) => {
                const isExpanded = expandedGroup === group.id;
                return (
                  <section key={group.id}>
                    <button
                      type="button"
                      className="flag-property-picker__group"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedGroup((current) => (current === group.id ? null : group.id))
                      }
                    >
                      <ChevronDownIcon
                        className={isExpanded ? "is-expanded" : ""}
                        width={14}
                        height={14}
                        aria-hidden="true"
                      />
                      <strong>{group.label}</strong>
                    </button>
                    {isExpanded && (
                      <div className="flag-property-picker__fields">
                        {group.fields.map((field) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={value === field.name}
                            className={value === field.name ? "is-selected" : ""}
                            key={field.name}
                            onClick={() => {
                              onChange(field.name);
                              setOpen(false);
                              setSearch("");
                            }}
                          >
                            <span className="flag-property-picker__field-name">{field.name}</span>
                            <FlagPropertyTypeChip type={field.type} />
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
              {visibleGroups.length === 0 && (
                <p className="flag-property-picker__empty">No properties found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlagOperatorPicker({
  type,
  value,
  onChange,
}: {
  type: FlagOperatorType;
  value: string;
  onChange: (type: FlagOperatorType, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeType, setActiveType] = useState<FlagOperatorType | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const syncMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 486;
    const menuHeight = Math.min(520, window.innerHeight - 16);
    setMenuPosition({
      top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 8)),
      left: Math.max(8, Math.min(rect.left - 49, window.innerWidth - menuWidth - 8)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveType(null);
    syncMenuPosition();
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const sync = () => syncMenuPosition();
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, type, syncMenuPosition]);

  const activeGroup = activeType
    ? FLAG_OPERATOR_GROUPS.find((group) => group.id === activeType)
    : null;
  const activeIndex = activeType
    ? FLAG_OPERATOR_GROUPS.findIndex((group) => group.id === activeType)
    : -1;

  return (
    <div className="flag-operator-picker">
      <button
        ref={triggerRef}
        type="button"
        className={"cp-picker-trigger" + (open ? " is-open" : "")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          syncMenuPosition();
          setOpen((current) => !current);
        }}
      >
        <span className="cp-picker-trigger-name">{value}</span>
        <ChevronDownIcon className="cp-caret" width={16} height={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="flag-operator-menu"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            role="menu"
            aria-label="Condition operator"
          >
            <div className="flag-operator-menu__types">
              {FLAG_OPERATOR_GROUPS.map((group) => (
                <button
                  type="button"
                  className={
                    activeType === group.id
                      ? "is-active"
                      : type === group.id
                        ? "is-current"
                        : ""
                  }
                  key={group.id}
                  onClick={() => setActiveType(group.id)}
                >
                  <FlagOperatorTypeIcon type={group.id} />
                  <span>{group.label}</span>
                  <ChevronDownIcon width={14} height={14} aria-hidden="true" />
                </button>
              ))}
            </div>
            {activeGroup && activeType && (
              <div
                className="flag-operator-menu__operators"
                style={{
                  marginTop: activeIndex * 36,
                  maxHeight: `calc(100vh - ${menuPosition.top + activeIndex * 36 + 8}px)`,
                }}
              >
                {activeGroup.operators.map((operator) => (
                  <button
                    type="button"
                    className={type === activeType && value === operator ? "is-selected" : ""}
                    key={operator}
                    onClick={() => {
                      onChange(activeType, operator);
                      setOpen(false);
                    }}
                  >
                    {operator}
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function FlagSettingsModal({
  flag,
  initialValue,
  onClose,
  onAdd,
}: {
  flag: Opt;
  initialValue?: FlagSettingsValue;
  onClose: () => void;
  onAdd: (value: FlagSettingsValue) => void;
}) {
  const initialConditions = initialValue?.conditions.length
    ? initialValue.conditions.map((condition, index) => ({ ...condition, id: index + 1 }))
    : [
        {
          id: 1,
          propertyMode: "select" as const,
          property: "",
          operatorType: "string" as const,
          operator: "is equal to",
          valueMode: "string" as const,
          value: "",
        },
      ];
  const [label, setLabel] = useState(initialValue?.label ?? "");
  const [conditions, setConditions] = useState<FlagCondition[]>(initialConditions);
  const [conditionJoin, setConditionJoin] = useState(initialValue?.conditionJoin ?? "AND");
  const [draggedConditionId, setDraggedConditionId] = useState<number | null>(null);
  const [propertyModeMenuId, setPropertyModeMenuId] = useState<number | null>(null);
  const [valueModeMenuId, setValueModeMenuId] = useState<number | null>(null);
  const [tooltipMode, setTooltipMode] = useState<FlagValueMode>(
    initialValue?.tooltipMode ?? "string",
  );
  const [tooltipModeOpen, setTooltipModeOpen] = useState(false);
  const [tooltipInsight, setTooltipInsight] = useState(initialValue?.tooltipInsight ?? "");
  const nextConditionId = useRef(initialConditions.length + 1);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (propertyModeMenuId === null) return;
    const closeModeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".flag-settings-modal__property-mode-trigger") ||
        target.closest(".flag-settings-modal__property-mode-menu")
      ) {
        return;
      }
      setPropertyModeMenuId(null);
    };
    document.addEventListener("mousedown", closeModeMenu);
    return () => document.removeEventListener("mousedown", closeModeMenu);
  }, [propertyModeMenuId]);

  useEffect(() => {
    if (valueModeMenuId === null) return;
    const closeModeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".flag-settings-modal__value-mode-trigger") ||
        target.closest(".flag-settings-modal__value-mode-menu")
      ) {
        return;
      }
      setValueModeMenuId(null);
    };
    document.addEventListener("mousedown", closeModeMenu);
    return () => document.removeEventListener("mousedown", closeModeMenu);
  }, [valueModeMenuId]);

  useEffect(() => {
    if (!tooltipModeOpen) return;
    const closeModeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".flag-settings-modal__tooltip-mode-trigger") ||
        target.closest(".flag-settings-modal__tooltip-mode-menu")
      ) {
        return;
      }
      setTooltipModeOpen(false);
    };
    document.addEventListener("mousedown", closeModeMenu);
    return () => document.removeEventListener("mousedown", closeModeMenu);
  }, [tooltipModeOpen]);

  const updateCondition = (
    index: number,
    key:
      | "propertyMode"
      | "property"
      | "operatorType"
      | "operator"
      | "valueMode"
      | "value",
    value: string,
  ) => {
    setConditions((current) =>
      current.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, [key]: value } : condition,
      ),
    );
  };
  const moveCondition = (conditionId: number, direction: -1 | 1) => {
    setConditions((current) => {
      const fromIndex = current.findIndex((condition) => condition.id === conditionId);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };
  const dropCondition = (targetId: number) => {
    if (draggedConditionId === null || draggedConditionId === targetId) return;
    setConditions((current) => {
      const fromIndex = current.findIndex((condition) => condition.id === draggedConditionId);
      const toIndex = current.findIndex((condition) => condition.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDraggedConditionId(null);
  };

  return createPortal(
    <div
      className="flag-settings-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="flag-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-settings-modal-title"
      >
        <header className="flag-settings-modal__header">
          <h2 id="flag-settings-modal-title">
            {initialValue ? "Edit" : "Add"} {flag.name}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close flag settings" onClick={onClose}>
            <CloseIcon width={18} height={18} aria-hidden="true" />
          </button>
        </header>
        <div className="flag-settings-modal__body" aria-label={`${flag.name} settings`}>
          <label className="flag-settings-modal__field">
            <span>Label</span>
            <input
              type="text"
              value={label}
              placeholder="Enter flag label"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>

          <section className="flag-settings-modal__conditions">
            <div className="flag-settings-modal__conditions-head">
              <h3>Conditions</h3>
              {conditions.length > 1 && (
                <Dropdown
                  value={conditionJoin}
                  onChange={setConditionJoin}
                  options={[
                    { value: "AND", label: "AND" },
                    { value: "OR", label: "OR" },
                  ]}
                  compact
                  ariaLabel="Condition matching mode"
                  className="flag-settings-modal__join"
                  menuClassName="flag-settings-dropdown-menu"
                />
              )}
            </div>
            <div className="flag-settings-modal__condition-list">
              {conditions.map((condition, index) => (
                <article
                  className={
                    "flag-settings-modal__condition" +
                    (draggedConditionId === condition.id ? " is-dragging" : "")
                  }
                  key={condition.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropCondition(condition.id)}
                >
                  <header>
                    <span>Condition {index + 1}</span>
                    {conditions.length > 1 && (
                      <span className="flag-settings-modal__condition-actions">
                        <button
                          type="button"
                          aria-label={`Delete condition ${index + 1}`}
                          onClick={() =>
                            setConditions((current) =>
                              current.filter((item) => item.id !== condition.id),
                            )
                          }
                        >
                          <TrashIcon width={16} height={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="flag-settings-modal__drag"
                          draggable
                          aria-label={`Reorder condition ${index + 1}`}
                          onDragStart={() => setDraggedConditionId(condition.id)}
                          onDragEnd={() => setDraggedConditionId(null)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveCondition(condition.id, -1);
                            } else if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveCondition(condition.id, 1);
                            }
                          }}
                        >
                          <DotsSixVertical size={16} weight="bold" aria-hidden="true" />
                        </button>
                      </span>
                    )}
                  </header>
                  <div>
                    <div className="flag-settings-modal__condition-control">
                      <button
                        type="button"
                        className="flag-settings-modal__property-mode-trigger"
                        aria-label="Property type"
                        aria-haspopup="menu"
                        aria-expanded={propertyModeMenuId === condition.id}
                        onClick={() => {
                          setValueModeMenuId(null);
                          setPropertyModeMenuId((current) =>
                            current === condition.id ? null : condition.id,
                          );
                        }}
                      >
                        {condition.propertyMode === "select" ? (
                          <HandPointing size={16} weight="regular" aria-hidden="true" />
                        ) : (
                          <Function size={16} weight="regular" aria-hidden="true" />
                        )}
                        <ChevronDownIcon width={12} height={12} aria-hidden="true" />
                      </button>
                      {condition.propertyMode === "select" ? (
                        <FlagPropertyPicker
                          value={condition.property}
                          onChange={(value) => updateCondition(index, "property", value)}
                        />
                      ) : (
                        <input
                          type="text"
                          value={condition.property}
                          placeholder="Enter expression"
                          onChange={(event) =>
                            updateCondition(index, "property", event.target.value)
                          }
                        />
                      )}
                      {propertyModeMenuId === condition.id && (
                        <div
                          className="cp-picker-menu flag-settings-modal__property-mode-menu"
                          role="menu"
                          aria-label="Property type"
                        >
                          <div className="dropdown-menu__inner">
                            <button
                              type="button"
                              role="menuitemradio"
                              aria-checked={condition.propertyMode === "select"}
                              className={condition.propertyMode === "select" ? "is-selected" : ""}
                              onClick={() => {
                                updateCondition(index, "propertyMode", "select");
                                updateCondition(index, "property", "");
                                setPropertyModeMenuId(null);
                              }}
                            >
                              <HandPointing size={16} weight="regular" aria-hidden="true" />
                              <span>Select</span>
                            </button>
                            <button
                              type="button"
                              role="menuitemradio"
                              aria-checked={condition.propertyMode === "expression"}
                              className={
                                condition.propertyMode === "expression" ? "is-selected" : ""
                              }
                              onClick={() => {
                                updateCondition(index, "propertyMode", "expression");
                                updateCondition(index, "property", "");
                                setPropertyModeMenuId(null);
                              }}
                            >
                              <Function size={16} weight="regular" aria-hidden="true" />
                              <span>Expression</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flag-settings-modal__condition-control">
                      <span className="flag-settings-modal__operator-type" aria-hidden="true">
                        <FlagOperatorTypeIcon type={condition.operatorType} />
                      </span>
                      <FlagOperatorPicker
                        type={condition.operatorType}
                        value={condition.operator}
                        onChange={(operatorType, operator) => {
                          updateCondition(index, "operatorType", operatorType);
                          updateCondition(index, "operator", operator);
                        }}
                      />
                    </div>
                    <div className="flag-settings-modal__condition-control">
                      <button
                        type="button"
                        className="flag-settings-modal__value-mode-trigger"
                        aria-label="Value type"
                        aria-haspopup="menu"
                        aria-expanded={valueModeMenuId === condition.id}
                        onClick={() => {
                          setPropertyModeMenuId(null);
                          setValueModeMenuId((current) =>
                            current === condition.id ? null : condition.id,
                          );
                        }}
                      >
                        {condition.valueMode === "string" ? (
                          <TextT size={16} weight="regular" aria-hidden="true" />
                        ) : (
                          <Function size={16} weight="regular" aria-hidden="true" />
                        )}
                        <ChevronDownIcon width={12} height={12} aria-hidden="true" />
                      </button>
                      <input
                        type="text"
                        value={condition.value}
                        placeholder={
                          condition.valueMode === "string" ? "Enter text" : "Enter expression"
                        }
                        onChange={(event) => updateCondition(index, "value", event.target.value)}
                      />
                      {valueModeMenuId === condition.id && (
                        <div
                          className="cp-picker-menu flag-settings-modal__property-mode-menu flag-settings-modal__value-mode-menu"
                          role="menu"
                          aria-label="Value type"
                        >
                          <div className="dropdown-menu__inner">
                            <button
                              type="button"
                              role="menuitemradio"
                              aria-checked={condition.valueMode === "string"}
                              className={condition.valueMode === "string" ? "is-selected" : ""}
                              onClick={() => {
                                updateCondition(index, "valueMode", "string");
                                updateCondition(index, "value", "");
                                setValueModeMenuId(null);
                              }}
                            >
                              <TextT size={16} weight="regular" aria-hidden="true" />
                              <span>String</span>
                            </button>
                            <button
                              type="button"
                              role="menuitemradio"
                              aria-checked={condition.valueMode === "expression"}
                              className={condition.valueMode === "expression" ? "is-selected" : ""}
                              onClick={() => {
                                updateCondition(index, "valueMode", "expression");
                                updateCondition(index, "value", "");
                                setValueModeMenuId(null);
                              }}
                            >
                              <Function size={16} weight="regular" aria-hidden="true" />
                              <span>Expression</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <button
              type="button"
              className="flag-settings-modal__add-condition"
              onClick={() =>
                setConditions((current) => [
                  ...current,
                  {
                    id: nextConditionId.current++,
                    propertyMode: "select",
                    property: "",
                    operatorType: "string",
                    operator: "is equal to",
                    valueMode: "string",
                    value: "",
                  },
                ])
              }
            >
              <PlusIcon width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
              <span>Add Condition</span>
            </button>
          </section>

          <label className="flag-settings-modal__field">
            <span>Tooltip Insight (AI Prompt)</span>
            <div className="flag-settings-modal__prompt">
              <button
                type="button"
                className="flag-settings-modal__tooltip-mode-trigger"
                aria-label="Tooltip prompt type"
                aria-haspopup="menu"
                aria-expanded={tooltipModeOpen}
                onClick={() => setTooltipModeOpen((current) => !current)}
              >
                {tooltipMode === "string" ? (
                  <TextT size={16} weight="regular" aria-hidden="true" />
                ) : (
                  <Function size={16} weight="regular" aria-hidden="true" />
                )}
                <ChevronDownIcon width={12} height={12} aria-hidden="true" />
              </button>
              <textarea
                value={tooltipInsight}
                placeholder={tooltipMode === "string" ? "Enter text" : "Enter expression"}
                onChange={(event) => setTooltipInsight(event.target.value)}
              />
              {tooltipModeOpen && (
                <div
                  className="cp-picker-menu flag-settings-modal__property-mode-menu flag-settings-modal__tooltip-mode-menu"
                  role="menu"
                  aria-label="Tooltip prompt type"
                >
                  <div className="dropdown-menu__inner">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={tooltipMode === "string"}
                      className={tooltipMode === "string" ? "is-selected" : ""}
                      onClick={() => {
                        setTooltipMode("string");
                        setTooltipInsight("");
                        setTooltipModeOpen(false);
                      }}
                    >
                      <TextT size={16} weight="regular" aria-hidden="true" />
                      <span>String</span>
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={tooltipMode === "expression"}
                      className={tooltipMode === "expression" ? "is-selected" : ""}
                      onClick={() => {
                        setTooltipMode("expression");
                        setTooltipInsight("");
                        setTooltipModeOpen(false);
                      }}
                    >
                      <Function size={16} weight="regular" aria-hidden="true" />
                      <span>Expression</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <small>
              Enter instructions for the insight you want the AI to generate inside the tooltip
            </small>
          </label>
        </div>
        <footer className="flag-settings-modal__footer">
          <button type="button" className="pg-btn pg-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pg-btn pg-btn--primary"
            onClick={() =>
              onAdd({
                label,
                conditionJoin,
                conditions: conditions.map(
                  ({ propertyMode, property, operatorType, operator, valueMode, value }) => ({
                  propertyMode,
                  property,
                  operatorType,
                  operator,
                  valueMode,
                  value,
                  }),
                ),
                tooltipMode,
                tooltipInsight,
              })
            }
          >
            {initialValue ? "Save Flag" : "Add Flag"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function isFlagSettingsValue(value: unknown): value is FlagSettingsValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FlagSettingsValue>;
  return typeof candidate.label === "string" && Array.isArray(candidate.conditions);
}

function flagConditionSummary(condition: FlagSettingsValue["conditions"][number]): string {
  const source =
    condition.propertyMode === "select"
      ? `asset.${condition.property || "property"}`
      : condition.property || "Expression";
  const operatorNeedsValue = ![
    "exists",
    "does not exist",
    "is empty",
    "is not empty",
    "is true",
    "is false",
  ].includes(condition.operator);
  const formattedValue =
    condition.valueMode === "string" ? `"${condition.value}"` : condition.value;
  return [source, condition.operator, operatorNeedsValue ? formattedValue : ""]
    .filter(Boolean)
    .join(" ");
}

function FlagsSettings({
  items,
  getVal,
  setVal,
}: {
  items: Opt[];
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
}) {
  const [editingFlag, setEditingFlag] = useState<Opt | null>(null);
  const editingValue = editingFlag ? getVal(editingFlag) : null;
  const editingFlagValue = isFlagSettingsValue(editingValue) ? editingValue : undefined;

  return (
    <>
      <section className="flags-settings" aria-label="Flags">
        {items.map((item) => {
          const value = getVal(item);
          const configuredFlag = isFlagSettingsValue(value) ? value : null;
          const tone = item.name.toLowerCase().split(" ")[0];
          return (
            <article
              className={
                "flags-settings__item" + (configuredFlag ? " is-configured" : "")
              }
              key={item.name}
            >
              <header className="flags-settings__head">
                <span className="flags-settings__title">
                  <i className={`flags-settings__dot flags-settings__dot--${tone}`} aria-hidden="true" />
                  <strong>{item.name}</strong>
                </span>
                <small className="flags-settings__optional">Optional</small>
              </header>
              {configuredFlag ? (
                <div className="flags-settings__summary">
                  <header className="flags-settings__summary-head">
                    <strong>{configuredFlag.label || "Untitled flag"}</strong>
                    <span className="flags-settings__summary-actions">
                      <button
                        type="button"
                        aria-label={`Edit ${configuredFlag.label || item.name}`}
                        onClick={() => setEditingFlag(item)}
                      >
                        <PencilSimple size={16} weight="regular" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${configuredFlag.label || item.name}`}
                        onClick={() => setVal(item, false)}
                      >
                        <TrashIcon width={16} height={16} aria-hidden="true" />
                      </button>
                    </span>
                  </header>
                  <small className="flags-settings__condition-summary">
                    {configuredFlag.conditions.length > 0 ? (
                      configuredFlag.conditions.map((condition, index) => (
                        <Fragment key={`${condition.property}-${condition.operator}-${index}`}>
                          <span>{flagConditionSummary(condition)}</span>
                          {index < configuredFlag.conditions.length - 1 && (
                            <b>{configuredFlag.conditionJoin}</b>
                          )}
                        </Fragment>
                      ))
                    ) : (
                      <span>No conditions configured</span>
                    )}
                  </small>
                </div>
              ) : (
                <button
                  type="button"
                  className="flags-settings__action"
                  aria-pressed="false"
                  onClick={() => setEditingFlag(item)}
                >
                  <PlusIcon width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>Add Flag</span>
                </button>
              )}
            </article>
          );
        })}
      </section>
      {editingFlag && (
        <FlagSettingsModal
          flag={editingFlag}
          initialValue={editingFlagValue}
          onClose={() => setEditingFlag(null)}
          onAdd={(value) => {
            setVal(editingFlag, value);
            setEditingFlag(null);
          }}
        />
      )}
    </>
  );
}

function GroupCard({
  items,
  advancedOpen,
  getVal,
  setVal,
  getValByKey,
}: {
  items: Opt[];
  advancedOpen: boolean;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
  getValByKey: (group: string, name: string) => unknown;
}) {
  const regular = items.filter((o) => o.level !== "advanced");
  const advanced = items.filter((o) => o.level === "advanced");
  const canInlineTickLabelAdvanced = regular.some(
    (o) => o.name === "Show ticks / tick labels / gridlines",
  );
  const inlineTickLabelAdvanced = canInlineTickLabelAdvanced
    ? advanced.filter((o) => INLINE_TICK_LABEL_ADVANCED.has(o.name))
    : [];
  const remainingAdvanced = canInlineTickLabelAdvanced
    ? advanced.filter((o) => !INLINE_TICK_LABEL_ADVANCED.has(o.name))
    : advanced;
  const inlineTickLabelNodes =
    advancedOpen && inlineTickLabelAdvanced.length > 0 ? (
      <div className="ia-advanced">
        {fieldClusterNodes(inlineTickLabelAdvanced, getVal, setVal, getValByKey)}
      </div>
    ) : undefined;

  return (
    <section className="ia-group">
      <div className="ia-card-fields">
        {fieldClusterNodes(regular, getVal, setVal, getValByKey, inlineTickLabelNodes)}
        {advancedOpen && remainingAdvanced.length > 0 && (
          <div className="ia-advanced">
            {fieldClusterNodes(remainingAdvanced, getVal, setVal, getValByKey)}
          </div>
        )}
      </div>
    </section>
  );
}

function assetInfoValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => assetInfoValue(item)).join(", ") : "Not set";
  }
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isAssetInfoColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (/^#[0-9a-f]{3,8}$/i.test(value.trim()) ||
      /^(rgb|hsl)a?\(/i.test(value.trim()))
  );
}

function AssetInfoSettingValue({ value }: { value: unknown }) {
  if (isAssetInfoColor(value)) {
    return (
      <span className="asset-info-color-value">
        <i style={{ background: value }} aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }
  if (Array.isArray(value)) {
    const colors = value.filter(isAssetInfoColor);
    if (colors.length === value.length && colors.length > 0) {
      return (
        <span className="asset-info-color-values">
          {colors.map((color, index) => (
            <i
              key={`${color}-${index}`}
              style={{ background: color }}
              title={color}
              aria-label={color}
            />
          ))}
        </span>
      );
    }
    const colorRows = value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).color === "string",
        ),
    );
    if (colorRows.length === value.length && colorRows.length > 0) {
      return (
        <div className="asset-info-color-list">
          {colorRows.map((row, index) => {
            const color = String(row.color);
            const label =
              typeof row.label === "string" && row.label
                ? row.label
                : `Color ${index + 1}`;
            const min = typeof row.min === "string" ? row.min : "";
            const max = typeof row.max === "string" ? row.max : "";
            const range = [min, max].filter(Boolean).join(" – ");
            const opacity =
              typeof row.opacity === "number" ? `${row.opacity}%` : "100%";
            return (
              <div className="asset-info-color-list__row" key={`${label}-${index}`}>
                <span
                  className="asset-info-color-list__swatch"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span className="asset-info-color-list__copy">
                  <strong>{label}</strong>
                  <small>
                    {[color, range || null, `${opacity} opacity`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
              </div>
            );
          })}
        </div>
      );
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const palette = value as Record<string, unknown>;
    const colors = Array.isArray(palette.colors)
      ? palette.colors.filter(
          (color): color is string => typeof color === "string",
        )
      : [];
    if (colors.length > 0) {
      const paletteName =
        typeof palette.paletteName === "string"
          ? palette.paletteName
          : "Custom palette";
      const family =
        typeof palette.paletteFamily === "string"
          ? palette.paletteFamily
          : "Palette";
      const style =
        typeof palette.style === "string" ? palette.style : undefined;
      const selectedColor =
        typeof palette.color === "string" ? palette.color : colors[0];
      const opacity =
        typeof palette.opacity === "number" ? `${palette.opacity}%` : "100%";
      return (
        <div className="asset-info-palette">
          <div className="asset-info-palette__swatches" aria-hidden="true">
            {colors.map((color, index) => (
              <span
                key={`${color}-${index}`}
                style={{ background: color }}
              />
            ))}
          </div>
          <div className="asset-info-palette__summary">
            <strong>{paletteName}</strong>
            <span>{[family, style].filter(Boolean).join(" · ")}</span>
            <small>
              <i style={{ background: selectedColor }} aria-hidden="true" />
              {selectedColor} · {opacity} opacity
            </small>
          </div>
        </div>
      );
    }
  }
  return <>{assetInfoValue(value)}</>;
}

function AssetInformationModal({
  onClose,
  visualLabel,
  chartName,
  size,
  source,
  config,
  generalInfo,
}: {
  onClose: () => void;
  visualLabel: string;
  chartName: string;
  size: PreviewSize;
  source: DataSourceSummary | null;
  config: Config;
  generalInfo: GeneralInfo;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const settings = Object.entries(config).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  const generalRows = [
    ["Asset name", generalInfo.name],
    ["Description", generalInfo.description],
    ["Insight", generalInfo.insight],
    ["Location", generalInfo.location],
    ["Tags", generalInfo.tags],
    ["Update frequency", generalInfo.updateFrequency || "None"],
    ["Custom frequency", generalInfo.customUpdateFrequency],
    ["Auto-refresh", generalInfo.scheduleAutoRefresh],
    ["Category", generalInfo.category],
    ["AI context", generalInfo.aiContext],
  ] as const;

  return createPortal(
    <div
      className="general-info-ai-instructions-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="general-info-ai-instructions asset-info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-info-modal-title"
      >
        <header>
          <span>
            <h2 id="asset-info-modal-title">Asset information</h2>
          </span>
          <button type="button" aria-label="Close asset information" onClick={onClose}>
            <CloseIcon width={16} height={16} aria-hidden="true" />
          </button>
        </header>

        <div className="asset-info-modal__body">
          <section className="asset-info-modal__section">
            <h3>Visual chart</h3>
            <dl>
              <div><dt>Visualization</dt><dd>{visualLabel}</dd></div>
              <div><dt>Chart type</dt><dd>{chartName}</dd></div>
              <div><dt>Preview size</dt><dd>{size[0].toUpperCase() + size.slice(1)}</dd></div>
            </dl>
          </section>

          <section className="asset-info-modal__section">
            <h3>Data source</h3>
            <dl>
              <div><dt>Source type</dt><dd>{source?.type ?? "Not configured"}</dd></div>
              <div><dt>Source</dt><dd>{source?.name ?? "Not configured"}</dd></div>
              <div><dt>Details</dt><dd>{source?.detail || "Not set"}</dd></div>
            </dl>
          </section>

          <section className="asset-info-modal__section">
            <h3>Visualization settings</h3>
            <dl>
              {settings.length > 0 ? (
                settings.map(([key, value]) => {
                  const [group, name] = key.split("::");
                  return (
                    <div key={key}>
                      <dt>{name ? `${group} · ${name}` : key}</dt>
                      <dd><AssetInfoSettingValue value={value} /></dd>
                    </div>
                  );
                })
              ) : (
                <div><dt>Settings</dt><dd>No custom settings</dd></div>
              )}
            </dl>
          </section>

          <section className="asset-info-modal__section">
            <h3>General info</h3>
            <dl>
              {generalRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{assetInfoValue(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <footer>
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/* ---------- modal ---------- */
export default function EditComponentModal({
  onClose,
  componentName,
  componentCategory,
  startAtVisualPicker = false,
  creating = false,
}: {
  onClose?: () => void;
  componentName?: string;
  componentCategory?: string;
  startAtVisualPicker?: boolean;
  creating?: boolean;
}) {
  const [activeChart, setActiveChart] = useState("bar");
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(
    startAtVisualPicker ? null : "vertical-bar",
  );
  const [vizPhase, setVizPhase] = useState<VizPhase>(startAtVisualPicker ? "picker" : "settings");
  const [activeSubCategory, setActiveSubCategory] = useState("Mapping");
  const [currentStep, setCurrentStep] = useState(startAtVisualPicker ? 0 : 1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(startAtVisualPicker ? 0 : 1);
  const [completedStepIds, setCompletedStepIds] = useState<Set<WizardStepId>>(
    () => new Set(),
  );
  const [query, setQuery] = useState("");
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [paletteEdgeCase, setPaletteEdgeCase] =
    useState<PaletteCardinalityEdgeCase>(null);
  const devMenuRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PreviewSize>("medium");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("asset");
  const [dataPreviewMode, setDataPreviewMode] = useState<DataPreviewMode>("results");
  const [config, setConfig] = useState<Config>({});
  const [dataSourceConfigured, setDataSourceConfigured] = useState(false);
  const [dataSourceTypeSelected, setDataSourceTypeSelected] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
  const [dataSourceSummary, setDataSourceSummary] =
    useState<DataSourceSummary | null>(null);
  const [dataSourceQuery, setDataSourceQuery] = useState("");
  const [dataSourceLoading, setDataSourceLoading] = useState(false);
  const [deepDiveHasTabs, setDeepDiveHasTabs] = useState(false);
  const [deepDivePreviewOpen, setDeepDivePreviewOpen] = useState(false);
  const [assetInfoOpen, setAssetInfoOpen] = useState(false);
  const [generalInfo, setGeneralInfo] = useState<GeneralInfo>({
    name: componentName ?? "",
    description: "",
    insight: "",
    aiContext: "",
    location: [],
    tags: [],
    updateFrequency: "",
    customUpdateFrequency: "",
    scheduleAutoRefresh: false,
    category: componentCategory ?? "",
  });

  const chart = charts[activeChart];
  const selectedVisual = selectedVisualId ? visualTypeById(selectedVisualId) : null;
  const displayVisual = selectedVisual ?? visualTypeByChartId(activeChart);
  const displayVisualId = displayVisual?.id ?? "vertical-bar";

  const visualFields = useMemo(() => fieldsForVisual(displayVisualId), [displayVisualId]);
  const subCategories = useMemo(() => subCategoriesForVisual(displayVisualId), [displayVisualId]);
  useEffect(() => {
    const fieldKeys = visualFields.filter((field) => field.type === "field").map(keyOf);
    setConfig((current) => {
      if (!fieldKeys.some((key) => key in current)) return current;
      const next = { ...current };
      fieldKeys.forEach((key) => delete next[key]);
      return next;
    });
  }, [visualFields]);

  useEffect(() => {
    const mapped =
      activeSubCategory === "Area styling" || activeSubCategory === "Area Styling"
        ? "Colors"
        : activeSubCategory;
    if (mapped !== activeSubCategory && subCategories.includes(mapped)) {
      setActiveSubCategory(mapped);
      return;
    }
    if (!subCategories.includes(activeSubCategory)) {
      setActiveSubCategory(subCategories[0] ?? "Mapping");
    }
  }, [displayVisualId, subCategories, activeSubCategory]);

  useEffect(() => {
    let handledOnKeyDown = false;
    const isAdvancedShortcut = (e: KeyboardEvent) => {
      const isO = e.code === "KeyO" || e.key === "o" || e.key === "O" || e.key === "\u000f";
      if (!isO) return false;
      const cmd = e.metaKey || e.getModifierState("Meta");
      const ctrl = e.ctrlKey || e.getModifierState("Control");
      return cmd && ctrl;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isAdvancedShortcut(e) || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      handledOnKeyDown = true;
      setAdvancedSettingsOpen((open) => !open);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const isO = e.code === "KeyO" || e.key === "o" || e.key === "O" || e.key === "\u000f";
      if (!isO) return;
      if (handledOnKeyDown) {
        handledOnKeyDown = false;
        return;
      }
      if (!isAdvancedShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setAdvancedSettingsOpen((open) => !open);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);

  useEffect(() => {
    if (!devMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (devMenuRef.current?.contains(target)) return;
      setDevMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDevMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [devMenuOpen]);

  const getVal = (o: Opt) => {
    const currentKey = keyOf(o);
    const legacyKey = LEGACY_SETTING_KEYS[currentKey];
    const v = config[currentKey] ?? (legacyKey !== undefined ? config[legacyKey] : undefined);
    if (o.type === "field" && o.level === "required" && !isValueFilled(o, v)) {
      return defaultFor(o, displayVisualId);
    }
    const modeDefault = waterSurfaceModeDefault(displayVisualId, config["Surface Style::Mode"], o);
    if (v === undefined || (o.group === "Color" && o.name === "Palette" && isUntouchedPlumePalette(v))) {
      return modeDefault !== undefined ? modeDefault : defaultFor(o, displayVisualId);
    }
    return v;
  };
  const setVal = (o: Opt, v: unknown) => setConfig((c) => ({ ...c, [keyOf(o)]: v }));

  const cfg = (group: string, name: string, fallback: unknown) => {
    if (group === "__dev" && name === "Palette edge case") {
      return paletteEdgeCase ?? fallback;
    }
    const field = visualFields.find((o) => o.group === group && o.name === name);
    const configured = field
      ? getVal(field)
      : config[`${group}::${name}`] ?? fallback;
    if (
      paletteEdgeCase &&
      name === "Palette" &&
      (group === "Colors" || group === "Color")
    ) {
      const mode = asColorMode(configured);
      const visualValueCount =
        paletteEdgeCase === "more-values" ? 10 : 3;
      const colors = expandPaletteToCount(
        mode.colors,
        visualValueCount,
        mode.paletteFamily,
      );
      const orderedStops = [...mode.stops].sort(
        (first, second) => first.value - second.value,
      );
      const stopMin = orderedStops[0]?.value ?? 0;
      const stopMax =
        orderedStops[orderedStops.length - 1]?.value ?? 100;
      const stops =
        mode.style === "Gradient" || mode.style === "Steps"
          ? colors.map((color, index) => ({
              value:
                stopMin +
                (index / Math.max(colors.length - 1, 1)) *
                  (stopMax - stopMin),
              color,
              opacity: mode.opacity,
            }))
          : mode.stops;
      return {
        ...mode,
        colors,
        stops,
        categoryLabels: Array.from(
          { length: visualValueCount },
          (_, index) => `Category ${index + 1}`,
        ),
      };
    }
    return configured;
  };

  const getValByKey = (group: string, name: string) => {
    const field = visualFields.find((o) => o.group === group && o.name === name);
    if (!field) return "";
    return getVal(field);
  };

  const navSections = settingsNavSections(displayVisualId, getValByKey);
  const visibleTabsKey = navSections.flatMap((section) => section.tabs).join("\n");

  useEffect(() => {
    const visibleTabs = visibleTabsKey.split("\n");
    if (subCategories.includes(activeSubCategory) && !visibleTabs.includes(activeSubCategory)) {
      setActiveSubCategory(visibleTabs[0] ?? "Mapping");
    }
  }, [visibleTabsKey, subCategories, activeSubCategory]);

  const normalizedSettingsQuery = query.trim().toLowerCase();
  const searchingVisualSettings = normalizedSettingsQuery.length > 0;
  const tabFields = visualFields.filter((o) => o.group === activeSubCategory);
  const settingsSearchResults = searchingVisualSettings
    ? visualFields.filter(
        (o) =>
          (o.level !== "advanced" || advancedSettingsOpen) &&
          isFieldVisible(o, getValByKey) &&
          isTabVisible(displayVisualId, o.group, getValByKey) &&
          `${o.group} ${o.name} ${o.desc}`.toLowerCase().includes(normalizedSettingsQuery),
      )
    : [];

  const mappingFields = visualFields.filter((o) => o.group === "Mapping");

  const resolvedConfig = useMemo(() => {
    const next: Config = { ...config };
    for (const o of visualFields) {
      const k = keyOf(o);
      if (
        next[k] === undefined ||
        (o.type === "field" && o.level === "required" && !isValueFilled(o, next[k]))
      ) {
        next[k] = defaultFor(o, displayVisualId);
      }
    }
    return next;
  }, [config, visualFields, displayVisualId]);

  const previewSeries = useMemo(
    () =>
      withPaletteCardinalityEdgeCase(
        derivePreviewSeries({
          visualId: displayVisualId,
          chartId: activeChart,
          config: resolvedConfig,
          title: generalInfo.name,
          insight: generalInfo.insight || generalInfo.description,
        }),
        paletteEdgeCase,
      ),
    [
      displayVisualId,
      activeChart,
      resolvedConfig,
      generalInfo.name,
      generalInfo.description,
      generalInfo.insight,
      paletteEdgeCase,
    ],
  );

  const paletteCategoryLabels = useMemo(() => {
    const candidates = previewSeries.groups?.length
      ? previewSeries.groups.map((group) => group.name)
      : previewSeries.mapPoints?.some((point) => point.category)
        ? previewSeries.mapPoints.map((point) => point.category)
        : previewSeries.polar?.some((point) => point.colorCategory || point.direction)
          ? previewSeries.polar.map((point) => point.colorCategory || point.direction)
          : previewSeries.scatterPoints?.some((point) => point.category)
            ? previewSeries.scatterPoints.map((point) => point.category ?? "")
            : previewSeries.colorCategories?.length
              ? previewSeries.colorCategories
              : previewSeries.labels?.length
                ? previewSeries.labels
                : previewSeries.ranges?.length
                  ? previewSeries.ranges.map((range) => range.label)
                  : previewSeries.availability?.length
                    ? previewSeries.availability.map((row) => row.label)
                    : previewSeries.kpiTiles?.length
                      ? previewSeries.kpiTiles.map((tile) => tile.status)
                      : previewSeries.markTips?.map((tip) => tip.category) ?? [];
    return Array.from(
      new Set(candidates.map((candidate) => String(candidate).trim()).filter(Boolean)),
    );
  }, [previewSeries]);

  const isHeatmap = displayVisualId === "heatmap";
  const isWaterSurfaces = displayVisualId === "water-surfaces";
  const isMapLayer = visualTypeById(displayVisualId)?.category === "map-layer";
  const waterMode = isWaterSurfaces ? waterSurfaceSettings(cfg).mode : null;
  const clipOutliers =
    (isHeatmap && heatmapSettings(cfg).clipOutliers) ||
    (isWaterSurfaces && waterMode !== "Spill" && waterSurfaceSettings(cfg).clipOutliers);
  const colorDataRange = useMemo(
    () =>
      clipOutliers
        ? numericPercentileExtent(mappedMeasureColumn(resolvedConfig), 10, 99)
        : numericExtent(mappedMeasureColumn(resolvedConfig)),
    [resolvedConfig, clipOutliers],
  );
  const fadeSetting = isMapLayer && waterMode !== "Spill" ? valueFade(cfg) : undefined;
  const fadeKey = fadeSetting ? `${fadeSetting.strength}:${fadeSetting.curve}` : String(fadeSetting);
  const valueOpacity = useMemo(
    () => fadeSetting,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fadeKey],
  );

  const goNext = () => {
    if (currentStep >= WIZARD_STEPS.length - 1) return;
    const completedStepId = WIZARD_STEPS[currentStep]?.id;
    if (completedStepId) {
      setCompletedStepIds((current) => {
        const next = new Set(current);
        next.add(completedStepId);
        return next;
      });
    }
    const next = currentStep + 1;
    setCurrentStep(next);
    setMaxUnlockedStep((m) => Math.max(m, next));
  };

  const goPrev = () => {
    if (currentStep <= 0) return;
    setCurrentStep(currentStep - 1);
  };

  const handlePrev = () => {
    if (isVizStep && vizPhase === "settings") {
      setSelectedVisualId(null);
      setVizPhase("picker");
      return;
    }
    goPrev();
  };

  const handleNext = () => {
    if (isDataSourceStep && (!dataSourceConfigured || dataSourceLoading)) {
      return;
    }
    if (WIZARD_STEPS[currentStep]?.id === "general-info") {
      if (generalInfoIncomplete) {
        return;
      }
      onClose?.();
      return;
    }
    if (isVizStep && vizPhase === "settings" && sectionHasErrors(mappingFields, getVal)) {
      return;
    }
    goNext();
  };

  const selectVisual = (visual: VisualType) => {
    const paletteField = fieldsForVisual(visual.id).find(isPaletteField);
    if (paletteField) {
      setConfig((current) => {
        const paletteKey = keyOf(paletteField);
        const palette = asColorMode(
          current[paletteKey] ?? defaultFor(paletteField, visual.id),
        );
        return {
          ...current,
          [paletteKey]: {
            ...palette,
            style: "Single",
            sequentialBasis: "Value",
            gradientAxis: defaultGradientAxisForVisual(visual.id),
          },
        };
      });
    }
    setSelectedVisualId(visual.id);
    setActiveChart(visual.chartId);
    setActiveSubCategory("Mapping");
    setQuery("");
    setVizPhase("settings");
  };

  const returnToVisualPicker = () => {
    setSelectedVisualId(null);
    setVizPhase("picker");
  };

  const selectStep = (index: number) => {
    if (index > maxUnlockedStep) return;
    setCurrentStep(index);
  };

  const wizardStepId = WIZARD_STEPS[currentStep]?.id ?? "viz-mapping";
  const isDataSourceStep = wizardStepId === "data-source";
  const isVizStep = wizardStepId === "viz-mapping";
  const isFiltersStep = wizardStepId === "filters";
  const isDeepDiveStep = wizardStepId === "deep-dive";
  const isAccessStep = wizardStepId === "access";
  const isGeneralInfoStep = wizardStepId === "general-info";
  const isDataSourcePicker = isDataSourceStep && !dataSourceTypeSelected;
  const isPreviewVizOnly = isDeepDiveStep || isAccessStep || isGeneralInfoStep;
  const isVizPicker = isVizStep && vizPhase === "picker";
  const isVizSettings = isVizStep && vizPhase === "settings";
  const mappingIncomplete = sectionHasErrors(mappingFields, getVal);
  const hasCompletedVisual =
    vizPhase === "settings" && Boolean(selectedVisualId) && !mappingIncomplete;
  const generalInfoIncomplete =
    !generalInfo.name.trim() ||
    !generalInfo.description.trim() ||
    generalInfo.tags.length === 0;

  useEffect(() => {
    if (!dataSourceConfigured || dataSourceLoading) return;
    const visualizationStep = WIZARD_STEPS.findIndex((step) => step.id === "viz-mapping");
    setMaxUnlockedStep((current) => Math.max(current, visualizationStep));
  }, [dataSourceConfigured, dataSourceLoading]);

  useEffect(() => {
    if (!isVizSettings || !selectedVisualId || mappingIncomplete) return;
    setMaxUnlockedStep(WIZARD_STEPS.length - 1);
  }, [isVizSettings, mappingIncomplete, selectedVisualId]);

  useEffect(() => {
    if (!isDataSourceStep || !hasCompletedVisual) return;
    setPreviewMode("asset");
  }, [hasCompletedVisual, isDataSourceStep]);

  const nextDisabled =
    (isDataSourceStep && (!dataSourceConfigured || dataSourceLoading)) ||
    isVizPicker ||
    (isVizSettings && mappingIncomplete) ||
    (isGeneralInfoStep && generalInfoIncomplete) ||
    currentStep >= WIZARD_STEPS.length;
  const displayVisualLabel = displayVisual?.label ?? chart.name;
  const displayVisualCategory = displayVisual?.category ?? "chart";
  const showChartPreview = !isDataSourceStep && !isVizPicker;

  const stepperRef = useRef<HTMLElement>(null);
  const stepRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [stepGlow, setStepGlow] = useState({ x: 0, width: 0 });

  const updateStepGlow = useCallback(() => {
    const stepper = stepperRef.current;
    const step = stepRefs.current[currentStep];
    if (!stepper || !step) return;
    const stepperRect = stepper.getBoundingClientRect();
    const stepRect = step.getBoundingClientRect();
    setStepGlow({
      x: stepRect.left - stepperRect.left,
      width: stepRect.width,
    });
  }, [currentStep]);

  useLayoutEffect(() => {
    updateStepGlow();
    const stepper = stepperRef.current;
    if (!stepper) return;
    const ro = new ResizeObserver(updateStepGlow);
    ro.observe(stepper);
    window.addEventListener("resize", updateStepGlow);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateStepGlow);
    };
  }, [updateStepGlow]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <ColorPaletteProvider
        dataRange={colorDataRange}
        categoryLabels={paletteCategoryLabels}
        edgeCase={paletteEdgeCase}
        valueOpacity={valueOpacity}
      >
      <div className="modal">
        {/* Header */}
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title">{creating ? "Create Asset" : "Edit Asset"}</h2>
            {(generalInfo.name || generalInfo.category) && (
              <p className="modal__subtitle">
                {[generalInfo.name, generalInfo.category].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="modal__header-actions">
            <div className="modal__dev-menu-wrap" ref={devMenuRef}>
              <button
                type="button"
                className={
                  "modal__dev-hint" +
                  (advancedSettingsOpen ? " is-on" : "") +
                  (devMenuOpen ? " is-open" : "")
                }
                aria-haspopup="menu"
                aria-expanded={devMenuOpen}
                onClick={() => setDevMenuOpen((open) => !open)}
              >
                <span>For Dev only</span>
                <ChevronDownIcon width={16} height={16} aria-hidden="true" />
              </button>
              {devMenuOpen && (
                <div className="modal__dev-menu cp-picker-menu" role="menu">
                  <div className="dropdown-menu__inner">
                    <span className="modal__dev-menu-label">Developer options</span>
                    <button
                      type="button"
                      className="modal__dev-menu-option"
                      role="menuitemcheckbox"
                      aria-checked={advancedSettingsOpen}
                      onClick={() => setAdvancedSettingsOpen((open) => !open)}
                    >
                      <span className="modal__dev-menu-copy">
                        <strong>Advanced settings</strong>
                        <small>
                          Show advanced visual controls
                          <kbd>Cmd + Ctrl + O</kbd>
                        </small>
                      </span>
                      <span
                        className={"ia-mini-switch" + (advancedSettingsOpen ? " on" : "")}
                        aria-hidden="true"
                      />
                    </button>
                    <span className="modal__dev-menu-separator" />
                    <span className="modal__dev-menu-label">Palette edge cases</span>
                    {[
                      {
                        id: "more-values" as const,
                        title: "More values than colors",
                        description: "10 visual values · expand palette as needed",
                      },
                      {
                        id: "fewer-values" as const,
                        title: "Fewer values than colors",
                        description: "3 visual values · preserve extra colors",
                      },
                    ].map((option) => {
                      const active = paletteEdgeCase === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={
                            "modal__dev-menu-option" +
                            (active ? " is-active" : "")
                          }
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() =>
                            setPaletteEdgeCase((current) =>
                              current === option.id ? null : option.id,
                            )
                          }
                        >
                          <span className="modal__dev-menu-copy">
                            <strong>{option.title}</strong>
                            <small>{option.description}</small>
                          </span>
                          <span
                            className={
                              "modal__dev-menu-radio" +
                              (active ? " is-on" : "")
                            }
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </header>

        <nav
          ref={stepperRef}
          className={"wizard-stepper wizard-stepper--" + WIZARD_STEPPER_DESIGN}
          aria-label="Asset setup steps"
        >
          {legacyStepper && (
            <div
              className="wizard-stepper__glow"
              aria-hidden="true"
              style={{
                transform: `translate(${stepGlow.x}px, 50%)`,
                width: stepGlow.width,
              }}
            >
              <div className="wizard-stepper__glow-bloom" />
            </div>
          )}
          {WIZARD_STEPS.map((step, i) => {
            const state = wizardStepState(i, currentStep, maxUnlockedStep);
            const complete =
              step.id === "data-source"
                ? dataSourceConfigured && !dataSourceLoading
                : step.id === "viz-mapping"
                  ? hasCompletedVisual
                  : step.id === "general-info"
                    ? !generalInfoIncomplete
                    : completedStepIds.has(step.id);
            return (
              <div key={step.id} className="wizard-stepper__slot">
                {legacyStepper && i > 0 && (
                  <span className="wizard-stepper__sep" aria-hidden="true">
                    <ArrowRightIcon width={14} height={14} />
                  </span>
                )}
                <button
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  type="button"
                  className={
                    "wizard-step wizard-step--" +
                    state +
                    (complete ? " wizard-step--complete" : "")
                  }
                  disabled={state === "disabled"}
                  aria-current={state === "selected" ? "step" : undefined}
                  onClick={() => selectStep(i)}
                >
                  <span className="wizard-step__marker">
                    {legacyStepper ? (
                      i + 1
                    ) : (
                      <span className="wizard-step__dot" aria-hidden="true" />
                    )}
                  </span>
                  <span className="wizard-step__label">{step.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <div
          className={
            "modal__body" +
            (isVizPicker ? " modal__body--viz-picker" : "") +
            (isDataSourcePicker ? " modal__body--single-pane" : "")
          }
        >
          <section className={"settings" + (isVizPicker ? " settings--viz-picker" : "")}>
            <div className="data-source-step-host" hidden={!isDataSourceStep}>
              <DataSourceStep
                onConfigurationChange={setDataSourceConfigured}
                onSourceTypeChange={setDataSourceTypeSelected}
                onSelectedDatabaseChange={setSelectedDatabaseId}
                onSourceSummaryChange={setDataSourceSummary}
                onQueryPreviewChange={setDataSourceQuery}
                onLoadingChange={setDataSourceLoading}
              />
            </div>
            {isVizPicker ? (
              <div className="settings__content settings__content--viz-picker">
                <VisualTypePicker
                  selectedId={selectedVisualId}
                  databaseId={selectedDatabaseId}
                  onSelect={selectVisual}
                />
              </div>
            ) : (
              <>
            {isVizStep && (
              <SelectedVisualBar
                label={displayVisualLabel}
                visualId={displayVisualId}
                category={displayVisualCategory}
                onChange={returnToVisualPicker}
              />
            )}

            <div
              hidden={isDataSourceStep}
              className={
                "settings__content" +
                (isDataSourceStep ? " settings__content--data-source" : "") +
                (isDataSourceStep && dataSourceQuery.trim()
                  ? " settings__content--query-fill"
                  : "") +
                (isFiltersStep ? " settings__content--filters" : "") +
                (isDeepDiveStep ? " settings__content--deep-dive" : "") +
                (isAccessStep ? " settings__content--access" : "") +
                (isGeneralInfoStep ? " settings__content--general-info" : "")
              }
            >
              {isFiltersStep && <FiltersStep />}

              {isDeepDiveStep && (
                <DeepDiveStep
                  onHasTabsChange={setDeepDiveHasTabs}
                  previewOpen={deepDivePreviewOpen}
                  onPreviewClose={() => setDeepDivePreviewOpen(false)}
                />
              )}

              {isAccessStep && <AccessStep />}

              {isGeneralInfoStep && (
                <GeneralInfoStep
                  value={generalInfo}
                  onChange={setGeneralInfo}
                  onFillWithAI={(instructions) =>
                    setGeneralInfo({
                      name: chart.name,
                      description:
                        instructions ||
                        `Shows ${chart.name.toLowerCase()} using the configured data source and visualization settings.`,
                      insight:
                        generalInfo.insight ||
                        `Monitor ${chart.name.toLowerCase()} to identify meaningful changes and trends.`,
                      aiContext: generalInfo.aiContext,
                      location: generalInfo.location,
                      tags:
                        generalInfo.tags.length > 0
                          ? generalInfo.tags
                          : [componentCategory || "Analytics"],
                      updateFrequency: generalInfo.updateFrequency,
                      customUpdateFrequency: generalInfo.customUpdateFrequency,
                      scheduleAutoRefresh: generalInfo.scheduleAutoRefresh,
                      category: generalInfo.category || componentCategory || "Operations",
                    })
                  }
                />
              )}

              {isVizStep && (
                <>
                  <div className="settings__subbar">
                    <p className="settings__subbar-label">Visual Settings</p>
                    <div className="settings__search-wrap">
                      <label className="settings__search">
                        <SearchIcon className="settings__search-ico" width={20} height={20} aria-hidden="true" />
                        <input
                          className="settings__search-input"
                          type="search"
                          role="combobox"
                          aria-expanded={searchingVisualSettings}
                          aria-controls="visual-settings-search-menu"
                          placeholder="Search options…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        {query && (
                          <button
                            type="button"
                            className="settings__search-clear"
                            aria-label="Clear search"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setQuery("")}
                          >
                            <CloseIcon width={14} height={14} strokeWidth={1} aria-hidden="true" />
                          </button>
                        )}
                      </label>
                      {searchingVisualSettings && (
                        <div
                          id="visual-settings-search-menu"
                          className="settings-search-menu"
                          role="listbox"
                          aria-label="Visual settings search results"
                        >
                          <div className="dropdown-menu__inner">
                            {settingsSearchResults.map((item) => (
                              <button
                                type="button"
                                className="settings-search-menu__item"
                                role="option"
                                aria-selected="false"
                                key={`${item.group}:${item.name}`}
                                onClick={() => {
                                  setActiveSubCategory(item.group);
                                  setQuery("");
                                }}
                              >
                                <span>{item.group}</span>
                                <ArrowRightIcon width={12} height={12} aria-hidden="true" />
                                <strong>{item.name}</strong>
                              </button>
                            ))}
                            {settingsSearchResults.length === 0 && (
                              <div className="settings-search-menu__empty">
                                No visual settings match “{query.trim()}”.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="vs-panel">
                    <nav className="vs-panel__nav" aria-label="Visual settings">
                      {navSections.map((section) => (
                        <div key={section.id} className="vs-nav-section">
                          <div className="vs-nav-section__head">
                            <p className="vs-nav-section__label">{section.label}</p>
                            <span className="vs-nav-section__rule" aria-hidden="true" />
                          </div>
                          {section.tabs.map((label) => {
                            const selected = activeSubCategory === label;
                            const catFields = visualFields.filter((o) => o.group === label);
                            const hasRequiredFields = catFields.some((o) => o.level === "required");
                            const hasErrors = sectionHasErrors(catFields, getVal);
                            const TabIcon = getSettingsTabIcon(label);
                            const featureOn = isFeatureTabOn(label, getValByKey, catFields);
                            return (
                              <button
                                key={label}
                                type="button"
                                className={"vs-tab" + (selected ? " is-selected" : "")}
                                aria-current={selected ? "true" : undefined}
                                onClick={() => {
                                  setActiveSubCategory(label);
                                  setQuery("");
                                }}
                              >
                                <span className="vs-tab__main">
                                  <TabIcon className="vs-tab__icon" size={16} weight="regular" aria-hidden="true" />
                                  <span className="vs-tab__label">{label}</span>
                                </span>
                                {(featureOn !== null || hasRequiredFields) && (
                                <span className="vs-tab__meta">
                                  {featureOn !== null && (
                                    <span className={"vs-tab__state" + (featureOn ? " is-on" : "")}>
                                      {featureOn ? "On" : "Off"}
                                    </span>
                                  )}
                                  {hasRequiredFields && (
                                    hasErrors ? (
                                      <HoverTip label={TAB_STATUS_INCOMPLETE} className="vs-tab__alert">
                                        <WarningCircle size={20} weight="fill" aria-hidden="true" />
                                      </HoverTip>
                                    ) : (
                                      <HoverTip label={TAB_STATUS_COMPLETE} className="vs-tab__complete">
                                        <CheckCircle size={20} weight="fill" aria-hidden="true" />
                                      </HoverTip>
                                    )
                                  )}
                                </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </nav>
                    <div className="vs-panel__content">
                      {activeSubCategory === "Flags" ? (
                        <FlagsSettings items={tabFields} getVal={getVal} setVal={setVal} />
                      ) : tabFields.length === 0 ? (
                        <div className="ia-empty">No options for this visual in this section.</div>
                      ) : (
                        <div className="ia-stack">
                          <GroupCard
                            key={`${displayVisualId}:${activeSubCategory}`}
                            items={tabFields}
                            advancedOpen={advancedSettingsOpen}
                            getVal={getVal}
                            setVal={setVal}
                            getValByKey={getValByKey}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!isDataSourceStep &&
                !isVizStep &&
                !isFiltersStep &&
                !isDeepDiveStep &&
                !isAccessStep &&
                !isGeneralInfoStep && (
                <div className="ia-empty">{WIZARD_STEPS[currentStep]?.label} — coming soon.</div>
              )}
            </div>
              </>
            )}
          </section>

          {!isVizPicker && !isDataSourcePicker && (
          <section className="preview">
            {isDataSourceStep ? (
              <>
                {hasCompletedVisual && (
                  <div className="preview__head">
                    <PreviewModeToggle value={previewMode} onChange={setPreviewMode} />
                  </div>
                )}

                {hasCompletedVisual && previewMode === "asset" ? (
                  <div className="preview__stage preview__stage--viz">
                    <div className="preview__size-toggle">
                      <div className="seg-toggle" role="group" aria-label="Preview size">
                        {(["small", "medium", "large"] as PreviewSize[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={"seg-toggle__btn" + (size === s ? " is-active" : "")}
                            onClick={() => setSize(s)}
                          >
                            {s[0].toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="preview__chart-slot">
                      <div className={"chart-card chart-card--" + size}>
                        <ChartPreview
                          type={chart.preview}
                          chartId={activeChart}
                          visualId={displayVisualId}
                          cfg={cfg}
                          series={previewSeries}
                          chartTitle={generalInfo.name || undefined}
                          size={size}
                        />
                      </div>
                    </div>
                  </div>
                ) : hasCompletedVisual && previewMode === "source" ? (
                  <div className="preview__stage preview__stage--source" role="tabpanel">
                    <div className="asset-source-preview">
                      <div className="asset-source-preview__eyebrow">Database connection</div>
                      <div className="asset-source-preview__connection">
                        <img
                          className="asset-source-preview__icon"
                          src={`${import.meta.env.BASE_URL}figma/source-types/database.svg?v=2`}
                          alt=""
                          width="30"
                          height="30"
                          draggable={false}
                          aria-hidden="true"
                        />
                        <span className="asset-source-preview__connection-copy">
                          <strong>Production MySQL</strong>
                          <small>mysql.prod.company.com:3306 - production_db</small>
                        </span>
                        <span className="asset-source-preview__status">
                          <span aria-hidden="true">●</span>
                          Connection established
                        </span>
                      </div>
                      <div className="asset-source-preview__query-head">
                        <h3>Query</h3>
                        <button type="button" className="ds-query__generate">
                          <Play size={13} weight="fill" aria-hidden="true" />
                          Run Query
                        </button>
                      </div>
                      <pre className="asset-source-preview__query">
                        <code>
                          <HighlightedSourceSql value={dataSourceQuery} />
                        </code>
                      </pre>
                    </div>
                  </div>
                ) : (
                  <>
                    {!dataSourceLoading && dataSourceConfigured && dataSourceQuery.trim() && (
                      <div className="preview__data-tabs" role="tablist" aria-label="Data preview">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={dataPreviewMode === "results"}
                          className={
                            "preview__data-tab" +
                            (dataPreviewMode === "results" ? " is-active" : "")
                          }
                          onClick={() => setDataPreviewMode("results")}
                        >
                          Data (1,467 rows)
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={dataPreviewMode === "profile"}
                          className={
                            "preview__data-tab" +
                            (dataPreviewMode === "profile" ? " is-active" : "")
                          }
                          onClick={() => setDataPreviewMode("profile")}
                        >
                          Data Profile
                        </button>
                      </div>
                    )}
                    {dataSourceLoading ? (
                      <div className="preview__empty preview__empty--loading" role="status">
                        <span className="preview__loading-spinner" aria-hidden="true" />
                        <p className="preview__empty-title">Loading query results...</p>
                      </div>
                    ) : dataSourceConfigured ? (
                      dataSourceQuery.trim() ? (
                        dataPreviewMode === "results" ? (
                          <div className="preview__stage preview__stage--query" role="tabpanel">
                            <DataSourceQueryPreview />
                          </div>
                        ) : (
                          <div className="preview__stage preview__stage--profile" role="tabpanel">
                            <DataSourceDataProfile />
                          </div>
                        )
                      ) : (
                        <div className="preview__empty">
                          <p className="preview__empty-title">Query will show here</p>
                          <p className="preview__empty-copy">
                            This data source does not have a generated query.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="preview__empty">
                        <p className="preview__empty-title">No data</p>
                        <p className="preview__empty-copy">
                          Select and configure a source to get data.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : showChartPreview ? (
              <>
                <div className="preview__head">
                  {isPreviewVizOnly ? (
                    <div className="preview__head-row">
                      <h3 className="preview__title">Chart Preview</h3>
                    </div>
                  ) : (
                    <PreviewModeToggle value={previewMode} onChange={setPreviewMode} />
                  )}
                </div>

                {previewMode === "asset" || isPreviewVizOnly ? (
                  <div className="preview__stage preview__stage--viz">
                    <div className="preview__size-toggle">
                      <div className="seg-toggle" role="group" aria-label="Preview size">
                        {(["small", "medium", "large"] as PreviewSize[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={"seg-toggle__btn" + (size === s ? " is-active" : "")}
                            onClick={() => setSize(s)}
                          >
                            {s[0].toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="preview__chart-slot">
                      <div
                        className={
                          "chart-card chart-card--" +
                          size +
                          (isDeepDiveStep && deepDiveHasTabs
                            ? " chart-card--deep-dive-preview"
                            : "")
                        }
                        role={isDeepDiveStep && deepDiveHasTabs ? "button" : undefined}
                        tabIndex={isDeepDiveStep && deepDiveHasTabs ? 0 : undefined}
                        aria-label={
                          isDeepDiveStep && deepDiveHasTabs
                            ? "Open Deep Dive preview"
                            : undefined
                        }
                        onClick={() => {
                          if (isDeepDiveStep && deepDiveHasTabs) {
                            setDeepDivePreviewOpen(true);
                          }
                        }}
                        onKeyDown={(event) => {
                          if ((event.target as HTMLElement).closest("button")) {
                            return;
                          }
                          if (
                            isDeepDiveStep &&
                            deepDiveHasTabs &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            setDeepDivePreviewOpen(true);
                          }
                        }}
                      >
                        {isDeepDiveStep && deepDiveHasTabs && (
                          <button
                            type="button"
                            className="chart-card__deep-dive-info"
                            aria-label="View asset information"
                            onClick={(event) => {
                              event.stopPropagation();
                              setAssetInfoOpen(true);
                            }}
                          >
                            <Info size={14} weight="regular" aria-hidden="true" />
                          </button>
                        )}
                        <ChartPreview
                          type={chart.preview}
                          chartId={activeChart}
                          visualId={displayVisualId}
                          cfg={cfg}
                          series={previewSeries}
                          chartTitle={generalInfo.name || undefined}
                          size={size}
                        />
                      </div>
                    </div>
                  </div>
                ) : previewMode === "data" ? (
                  <>
                    <div className="preview__data-tabs" role="tablist" aria-label="Asset data">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={dataPreviewMode === "results"}
                        className={
                          "preview__data-tab" +
                          (dataPreviewMode === "results" ? " is-active" : "")
                        }
                        onClick={() => setDataPreviewMode("results")}
                      >
                        Data (1,467 rows)
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={dataPreviewMode === "profile"}
                        className={
                          "preview__data-tab" +
                          (dataPreviewMode === "profile" ? " is-active" : "")
                        }
                        onClick={() => setDataPreviewMode("profile")}
                      >
                        Data Profile
                      </button>
                    </div>
                    {dataPreviewMode === "results" ? (
                      <div className="preview__stage preview__stage--query" role="tabpanel">
                        <DataSourceQueryPreview />
                      </div>
                    ) : (
                      <div className="preview__stage preview__stage--profile" role="tabpanel">
                        <DataSourceDataProfile />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="preview__stage preview__stage--source" role="tabpanel">
                    <div className="asset-source-preview">
                      <div className="asset-source-preview__eyebrow">Database connection</div>
                      <div className="asset-source-preview__connection">
                        <img
                          className="asset-source-preview__icon"
                          src={`${import.meta.env.BASE_URL}figma/source-types/database.svg?v=2`}
                          alt=""
                          width="30"
                          height="30"
                          draggable={false}
                          aria-hidden="true"
                        />
                        <span className="asset-source-preview__connection-copy">
                          <strong>Production MySQL</strong>
                          <small>mysql.prod.company.com:3306 - production_db</small>
                        </span>
                        <span className="asset-source-preview__status">
                          <span aria-hidden="true">●</span>
                          Connection established
                        </span>
                      </div>
                      <div className="asset-source-preview__query-head">
                        <h3>Query</h3>
                        <button type="button" className="ds-query__generate">
                          <Play size={13} weight="fill" aria-hidden="true" />
                          Run Query
                        </button>
                      </div>
                      <pre className="asset-source-preview__query">
                        <code>
                          <HighlightedSourceSql value={dataSourceQuery} />
                        </code>
                      </pre>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="preview__empty">
                <p className="preview__empty-title">Chart Preview</p>
                <p className="preview__empty-copy">Select a visualization to see a live preview.</p>
              </div>
            )}
          </section>
          )}

          <footer className="settings__footer">
            <button
              type="button"
              className="pg-btn pg-btn--secondary pg-btn--icon-left"
              disabled={currentStep === 0 && !(isVizStep && vizPhase === "settings")}
              onClick={handlePrev}
            >
              <ArrowLeftIcon className="pg-btn__icon" width={20} height={20} aria-hidden="true" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              className={
                "pg-btn pg-btn--primary" +
                (isGeneralInfoStep ? " pg-btn--create" : " pg-btn--icon-right")
              }
              disabled={nextDisabled}
              onClick={handleNext}
            >
              <span>{isGeneralInfoStep ? "Create asset" : "Next"}</span>
              {!isGeneralInfoStep && (
                <ArrowRightIcon className="pg-btn__icon" width={20} height={20} aria-hidden="true" />
              )}
            </button>
          </footer>
        </div>
      </div>
      {assetInfoOpen && (
        <AssetInformationModal
          onClose={() => setAssetInfoOpen(false)}
          visualLabel={displayVisualLabel}
          chartName={chart.name}
          size={size}
          source={dataSourceSummary}
          config={resolvedConfig}
          generalInfo={generalInfo}
        />
      )}
      </ColorPaletteProvider>
    </div>
  );
}
