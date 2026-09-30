import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Question } from "@phosphor-icons/react";
import Dropdown from "./Dropdown";
import { DirectColorPicker } from "./ColorPalette";
import { uniqueValues } from "./mockDataset";
import {
  DEFAULT_COLOR_MODE,
  opacityPercentFromColor,
  paletteColorAt,
  stripHexAlpha,
  sequentialRamp,
  type ColorModeConfig,
} from "./previewTheme";
import type {
  ColorPickerMode,
  VisualColorPickerProfile,
} from "./visualSettingsCatalog";

type Props = {
  value: ColorModeConfig;
  profile: VisualColorPickerProfile;
  columns: string[];
  dataRange: { min: number; max: number } | null;
  mappedField: (name: string) => string;
  onChange: (next: ColorModeConfig) => void;
  onModeChange?: (mode: ColorPickerMode) => void;
};

function PickerHelpTip({ description }: { description: string }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const syncPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const show = () => {
    syncPosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const sync = () => syncPosition();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, syncPosition]);

  return (
    <>
      <span className="ia-field-info">
        <button
          ref={anchorRef}
          type="button"
          className="ia-field-info__btn"
          aria-label={description}
          onMouseEnter={show}
          onMouseLeave={() => setOpen(false)}
          onFocus={show}
          onBlur={() => setOpen(false)}
        >
          <Question
            className="ia-field-info__icon"
            size={20}
            weight="regular"
            aria-hidden="true"
          />
        </button>
      </span>
      {open &&
        createPortal(
          <span
            className="ia-field-info__tip ia-field-info__tip--flyout"
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
          >
            {description}
          </span>,
          document.body,
        )}
    </>
  );
}

function modeForStyle(style: ColorModeConfig["style"]): ColorPickerMode {
  if (style === "Per Category") return "Categorical Colors";
  if (style === "Gradient" || style === "Steps") return "Sequential Colors";
  return "Single Color";
}

function MiniSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <span
      role="switch"
      tabIndex={0}
      aria-checked={value}
      className={"ia-mini-switch" + (value ? " on" : "")}
      onClick={() => onChange(!value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onChange(!value);
      }}
    />
  );
}

export default function ColorPickerSettings({
  value,
  profile,
  columns,
  dataRange,
  mappedField,
  onChange,
  onModeChange,
}: Props) {
  const derivedMode = modeForStyle(value.style);
  const mode = profile.modes.includes(derivedMode)
    ? derivedMode
    : profile.modes[0];
  const autoCategoryField =
    profile.autoCategoryFields.map(mappedField).find(Boolean) ||
    profile.categoryFallback;
  const selectedCategoryField = value.categoryField || "Auto";
  const effectiveCategoryField =
    selectedCategoryField === "Auto"
      ? autoCategoryField
      : selectedCategoryField;
  const categoryValues = effectiveCategoryField
    ? uniqueValues(effectiveCategoryField)
    : [];

  const sequentialPatch = (color: string) => {
    const sourceStops = value.stops.length
      ? value.stops
      : DEFAULT_COLOR_MODE.stops;
    const stopCount = Math.max(3, sourceStops.length);
    const shades = sequentialRamp(color, stopCount);
    const firstValue = dataRange?.min ?? sourceStops[0]?.value ?? 0;
    const lastValue =
      dataRange?.max ?? sourceStops[sourceStops.length - 1]?.value ?? 100;
    const span = lastValue - firstValue;
    return {
      color,
      colors: shades,
      stops: shades.map((shade, index) => ({
        value:
          firstValue +
          (index / Math.max(stopCount - 1, 1)) * span,
        color: shade,
        opacity: value.opacity,
      })),
    };
  };

  const setMode = (nextMode: string) => {
    const pickerMode = nextMode as ColorPickerMode;
    const style =
      pickerMode === "Categorical Colors"
        ? "Per Category"
        : pickerMode === "Sequential Colors"
          ? "Gradient"
          : "Single";
    const next: ColorModeConfig = {
      ...value,
      style,
      paletteFamily:
        pickerMode === "Categorical Colors" ? "Categorical" : "Sequential",
      categoryLabels:
        pickerMode === "Categorical Colors" ? categoryValues : value.categoryLabels,
    };
    onChange(
      pickerMode === "Sequential Colors"
        ? { ...next, ...sequentialPatch(value.color) }
        : next,
    );
    onModeChange?.(pickerMode);
  };

  return (
    <div className="vs-color-picker-settings">
      <div className="cp-field">
        <span className="cp-label-with-info">
          <span className="cp-label">Mode</span>
          <PickerHelpTip description="Single = one color, Categorical = category groups, Sequential = value ramp." />
        </span>
        <Dropdown
          value={mode}
          options={profile.modes.map((item) => ({
            value: item,
            label: item,
          }))}
          onChange={setMode}
        />
      </div>

      {mode === "Categorical Colors" ? (
        <>
          <div className="cp-field">
            <span className="cp-label-with-info">
              <span className="cp-label">Category field</span>
              <PickerHelpTip description="Auto uses the visual’s mapped category or series field." />
            </span>
            <Dropdown
              value={selectedCategoryField}
              options={[
                { value: "Auto", label: "Auto" },
                ...columns.map((column) => ({
                  value: column,
                  label: column,
                })),
              ]}
              onChange={(categoryField) => {
                const effectiveField =
                  categoryField === "Auto"
                    ? autoCategoryField
                    : categoryField;
                onChange({
                  ...value,
                  categoryField,
                  categoryLabels: effectiveField
                    ? uniqueValues(effectiveField)
                    : [],
                });
              }}
            />
          </div>

          <div className="vs-color-picker-categories">
            <span className="cp-label-with-info">
              <span className="cp-label">Category values</span>
              {!categoryValues.length && (
                <PickerHelpTip description="No values found for the selected category field. Configure mapping or preview data first." />
              )}
            </span>
            {categoryValues.length ? (
              <div className="vs-color-picker-categories__list">
                {categoryValues.map((category, index) => {
                  const storedColor = value.categoryColors[category];
                  const assigned = paletteColorAt(value.colors, index);
                  const color = storedColor
                    ? stripHexAlpha(storedColor)
                    : assigned.color;
                  const opacity =
                    value.categoryOpacities[index] ??
                    (storedColor
                      ? opacityPercentFromColor(storedColor)
                      : assigned.opacity);
                  return (
                    <div
                      className="vs-color-picker-category"
                      key={category}
                    >
                      <span className="cp-label">{category}</span>
                      <DirectColorPicker
                        value={color}
                        opacity={opacity}
                        onChange={(nextColor) =>
                          onChange({
                            ...value,
                            categoryLabels: categoryValues,
                            categoryColors: {
                              ...value.categoryColors,
                              [category]: nextColor,
                            },
                          })
                        }
                        onOpacityChange={(opacity) => {
                          const categoryOpacities = [
                            ...value.categoryOpacities,
                          ];
                          categoryOpacities[index] = opacity;
                          onChange({
                            ...value,
                            categoryOpacities,
                            categoryColors: {
                              ...value.categoryColors,
                              [category]: stripHexAlpha(color),
                            },
                          });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </>
      ) : mode === "Sequential Colors" ? (
        <>
          <div className="cp-field">
            <span className="cp-label">Sequential based on</span>
            <Dropdown
              value={value.sequentialBasis}
              options={[
                { value: "Value", label: "Value" },
                { value: "Category", label: "Category" },
              ]}
              onChange={(sequentialBasis) =>
                onChange({
                  ...value,
                  sequentialBasis:
                    sequentialBasis === "Category"
                      ? "Category"
                      : "Value",
                  categoryLabels:
                    sequentialBasis === "Category"
                      ? categoryValues
                      : value.categoryLabels,
                })
              }
            />
          </div>

          {value.sequentialBasis === "Category" && (
            <div className="cp-field">
              <span className="cp-label-with-info">
                <span className="cp-label">Category field</span>
                <PickerHelpTip description="Auto uses the visual’s mapped category or series field." />
              </span>
              <Dropdown
                value={selectedCategoryField}
                options={[
                  { value: "Auto", label: "Auto" },
                  ...columns.map((column) => ({
                    value: column,
                    label: column,
                  })),
                ]}
                onChange={(categoryField) => {
                  const effectiveField =
                    categoryField === "Auto"
                      ? autoCategoryField
                      : categoryField;
                  onChange({
                    ...value,
                    categoryField,
                    categoryLabels: effectiveField
                      ? uniqueValues(effectiveField)
                      : [],
                  });
                }}
              />
            </div>
          )}

          <div className="vs-color-picker-settings__rule" />

          <div className="cp-field">
            <span className="cp-label-with-info">
              <span className="cp-label">Base color</span>
              <PickerHelpTip description="Sequential uses lighter and darker shades of this color based on value or category." />
            </span>
            <DirectColorPicker
              value={value.color}
              opacity={value.opacity}
              onChange={(color) =>
                onChange({ ...value, ...sequentialPatch(color) })
              }
              onOpacityChange={(opacity) =>
                onChange({
                  ...value,
                  opacity,
                  stops: value.stops.map((stop) => ({ ...stop, opacity })),
                })
              }
            />
          </div>

          <div className="vs-color-picker-reverse">
            <div>
              <span className="cp-label-with-info">
                <span>Reverse ramp</span>
                <PickerHelpTip description="High values or categories use the end of the ramp." />
              </span>
              <MiniSwitch
                value={value.gradientReverse}
                onChange={(gradientReverse) =>
                  onChange({ ...value, gradientReverse })
                }
              />
            </div>
          </div>
        </>
      ) : (
        <div className="cp-field">
          <span className="cp-label">Color</span>
          <DirectColorPicker
            value={value.color}
            opacity={value.opacity}
            onChange={(color) => onChange({ ...value, color })}
            onOpacityChange={(opacity) => onChange({ ...value, opacity })}
          />
        </div>
      )}
    </div>
  );
}
