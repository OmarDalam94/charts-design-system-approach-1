import { getVisualIcon } from "./visualIcons";
import {
  getChartPickerIconSrc,
  getChartVisualSrc,
  isChartVisualAsset,
} from "./chartVisualAssets";
import {
  getMapPickerIconSrc,
  getMapVisualSrc,
  isMapVisualAsset,
} from "./mapVisualAssets";

type Props = {
  visualId: string;
  category: "chart" | "map-layer";
  size?: "card" | "bar" | "preview" | "map" | "stack";
};

export default function VisualArtwork({ visualId, category, size = "card" }: Props) {
  const selectedIconSrc =
    size === "bar"
      ? category === "chart"
        ? getChartPickerIconSrc(visualId)
        : getMapPickerIconSrc(visualId)
      : undefined;
  const pickerIconSrc =
    category === "chart" && size === "card" ? getChartPickerIconSrc(visualId) : undefined;
  const mapPickerIconSrc =
    category === "map-layer" && size === "map" ? getMapPickerIconSrc(visualId) : undefined;
  const enlargePickerIcon =
    visualId === "donut-chart" ||
    visualId === "gauge-linear" ||
    visualId === "polar-wind-rose";

  if (size === "stack") {
    const src =
      category === "chart" ? getChartPickerIconSrc(visualId) : getMapPickerIconSrc(visualId);
    if (src) {
      return (
        <img
          className="visual-artwork visual-artwork--stack"
          src={src}
          alt=""
          draggable={false}
        />
      );
    }
    const Icon = getVisualIcon(visualId);
    return (
      <span className="visual-artwork visual-artwork--phosphor visual-artwork--stack" aria-hidden="true">
        <Icon size={132} weight="regular" />
      </span>
    );
  }

  if (selectedIconSrc) {
    return (
      <img
        className="visual-artwork visual-artwork--bar"
        src={selectedIconSrc}
        width={32}
        height={32}
        alt=""
        draggable={false}
      />
    );
  }

  if (pickerIconSrc) {
    return (
      <img
        className={
          "visual-artwork visual-artwork--card visual-artwork--chart-picker" +
          (enlargePickerIcon ? " visual-artwork--chart-picker-large" : "")
        }
        src={pickerIconSrc}
        width={44}
        height={44}
        alt=""
        draggable={false}
      />
    );
  }

  if (mapPickerIconSrc) {
    return (
      <img
        className="visual-artwork visual-artwork--map visual-artwork--map-picker"
        src={mapPickerIconSrc}
        width={44}
        height={44}
        alt=""
        draggable={false}
      />
    );
  }

  const src =
    category === "chart"
      ? getChartVisualSrc(visualId)
      : category === "map-layer"
        ? getMapVisualSrc(visualId)
        : undefined;

  if (src) {
    return (
      <img
        className={"visual-artwork visual-artwork--" + size}
        src={src}
        alt=""
        draggable={false}
      />
    );
  }

  if (!isChartVisualAsset(visualId) && !isMapVisualAsset(visualId)) {
    const Icon = getVisualIcon(visualId);
    const iconSize = size === "bar" ? 22 : size === "preview" ? 64 : size === "map" ? 48 : 24;
    return (
      <span className={"visual-artwork visual-artwork--phosphor visual-artwork--" + size} aria-hidden="true">
        <Icon size={iconSize} weight="regular" />
      </span>
    );
  }

  return null;
}
