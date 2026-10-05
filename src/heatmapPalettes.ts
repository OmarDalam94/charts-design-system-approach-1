import { DEFAULT_COLOR_MODE, type ColorModeConfig } from "./previewTheme";

/**
 * Sequential multi-hue ramps, low to high. Inferno, Magma, Viridis and Turbo
 * are sampled from the matplotlib maps; Yellow → Red is ColorBrewer YlOrRd;
 * Dust is the Map 3D heat map default.
 */
export const MULTI_HUE_PALETTES: { name: string; colors: string[] }[] = [
  { name: "Dust", colors: ["#f4e4c4", "#ebc387", "#e2a14a", "#e18633", "#e06a1c", "#ad4f17", "#7a3412"] },
  { name: "Yellow → Red", colors: ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"] },
  { name: "Inferno", colors: ["#280b54", "#65156e", "#9f2a63", "#d44842", "#f57d15", "#fac127", "#fcffa4"] },
  { name: "Magma", colors: ["#2c115f", "#5f187f", "#982d80", "#d3436e", "#f8765c", "#febb81", "#fcfdbf"] },
  { name: "Viridis", colors: ["#440154", "#443983", "#31688e", "#21918c", "#35b779", "#90d743", "#fde725"] },
  { name: "Turbo", colors: ["#466be3", "#28bceb", "#2ef19c", "#a4fc3c", "#f3c63a", "#fb8022", "#900c00"] },
];

const DUST = MULTI_HUE_PALETTES[0].colors;

/** Placeholder stop values; the palette editor refits them to the data range. */
export const HEATMAP_DEFAULT_PALETTE: ColorModeConfig = {
  ...DEFAULT_COLOR_MODE,
  paletteName: "Dust",
  paletteFamily: "Sequential",
  colors: DUST,
  style: "Gradient",
  color: DUST[0],
  stops: [0, 2, 3, 5, 6].map((i, n) => ({ value: n * 25, color: DUST[i], opacity: 100 })),
};
