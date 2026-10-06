# Decisions and rationale

Each entry states the decision, why, and what it costs. Cloudscape was used as a benchmark for documentation and playground rigor only; no third-party chart system or branded component library is used.

## Architecture

**Own the renderer; use small D3 utilities for math only.** React renders every SVG/HTML node; D3 modules compute scales, paths and layout. No charting framework, CSS framework or app-shell change was introduced.
*Tradeoff:* more code to own than wrapping a chart library, in exchange for full control of legend, axes, tooltip, data alternative, identity and states, and no visual language imported from another brand.

| Dependency | Purpose |
| --- | --- |
| `d3-scale` | Linear, time, band and sqrt scales; tick generation inputs. |
| `d3-shape` | Line, area, arc, pie and stack path generators. |
| `d3-sankey` | Sankey node/link layout (stage-aware IDs are added on top). |
| `d3-format` | Locale-safe number formatting under `format.ts`. |
| `d3-time-format` | UTC date formatting for time axes and tooltips. |
| `@playwright/test`, `vitest`, `vite-node` (dev) | Browser tests, unit tests, report generation. |

`d3-array`, `@testing-library/react` and `jsdom` were removed because nothing imports them (`d3-array` is still installed transitively by `d3-scale`).

**Pure model, thin views.** `buildChartModel(input)` turns saved config + dataset into a serialisable `ChartModel` with every adaptation, issue and conflict listed. Views only lay out and draw. This is what lets the coverage registry and behavior rules verify property effects without a browser.

**One renderer for the Lab and the builder.** `BuilderChart` wraps `LlumenChart` for the Edit Asset modal. Maps keep the legacy preview (out of scope).

**Saved config contract is unchanged.** Every setting is read by its persisted `group::name` key. Builder-only help (suggested columns while a required mapping is empty) travels in `suggestedMappings`, is disclosed in the notes panel as an adaptation, and is never written to the saved config.

## Data integrity

- **Time is spaced by elapsed time**, not row index, whenever the X column parses as dates; irregular gaps stay visible (`time-elapsed`).
- **Null is not zero.** Missing values break lines and appear as “—” in tooltips and the data table; zero is drawn as zero (`null-not-zero`).
- **Never substitute mock values.** Missing mappings produce a missing-mapping state naming the fields. Invalid Data-tab input keeps the last valid chart and says so.
- **Clamp geometry, never numbers.** Gauge, score and progress markers clamp to the track; labels, tooltips and the data view keep the real value (`gauge-clamp`, `progress-over-max`).
- **Range annotations** use interval statistics: Average is the mean of interval midpoints, Maximum the highest High, Minimum the lowest Low. Before this they were silently empty because range points have no single y.
- **Scatter size encodes area**, above a minimum legible area (`scatter-size-area`).
- **Availability buckets show the worst state**, never an average, and empty buckets are unknown (grey), never “up” (`availability-worst`).
- **Sankey stages get distinct node IDs**, so the same label in two stages cannot form a cycle.

## Layout

- **Four size modes** at fixed widths (micro under 320, compact 320–479, regular 480–767, wide 768 and up) drive padding, header density and label strategy.
- **Space is allocated in a documented order** (header, essentials, legend, plot minimum per family). When even the plot minimum cannot fit, a compact summary with **View data** replaces an unreadable miniature.
- **Legend relocation is effective, not saved.** A side legend that would squeeze the plot moves below it; the readout and notes report requested vs effective position; the saved value is restored when space returns.
- **Donut and polar plots are square**, so surplus height goes to extra legend rows rather than empty space above and below the circle.
- **Legend never slices items.** Overflow shows “Show all N”; hiding every series shows an explicit recovery state.
- **Legend “Only” is an overlay** revealed on hover/focus. It previously reflowed the centred row under the pointer, so presses landed on the wrong item; it is static and always visible on touch devices.
- **Sankey scrolls horizontally** when each stage cannot get a readable pitch (104 px with labels, 84 px in micro mode, 32 px without labels). Labels sit after their node with a halo and are thinned so they never collide; full names stay in the tooltip and data view. Only first-stage nodes take palette colours; downstream nodes use the neutral mark colour so flows are traced by their source.
- **Axis labels** are clamped inside the plot, then thinned by their final positions so no two overlap; hidden ticks stay in the tooltip and data view. Rotation follows the saved Tick rotation setting and reserves its height below the plot.
- **Nice tick domains.** With an automatic domain and an explicit tick count, the domain is widened to round steps (1/2/2.5/5 × 10ⁿ) so ticks read 0, 25, 50… instead of 26.7, 73.3. Manual bounds are honoured exactly, even if ticks are not round.
- **Data stays left-to-right in RTL.** Chrome (header, legend, notes, Lab resize handles) mirrors; SVG content keeps `direction: ltr` so time runs left to right and numbers are not reordered. This is a deliberate default to review with Arabic-speaking users.

## Assets

- **Score indicator headline** shows the value with its unit, “/ max” and the range, because the bar alone is not readable.
- **KPI comparison** always names its basis (“vs Previous period”) and the arrow follows the sign of the delta.
- **Aggregation conflicts are disclosed.** On the score indicator, when Aggregation is set the value combines every row and KPI value calculation is listed under Setting conflicts as not used.
- **Flag expressions** are evaluated by a small tokenizer and recursive-descent parser (`expr.ts`): literals, names, arithmetic, comparisons, `&& || !`, and a fixed function list. There is no `eval`, no property access and no function construction. Unknown names or syntax errors hide the flag and raise an issue.
- **Availability palette** maps states (up/degraded/down/unknown), not categories, so category palette properties are invalid combinations for that asset.

## Colour

- Chart colours encode data only. UI chrome uses `--lc-*` UI tokens; marks use the categorical palette, the neutral mark token (`--lcc-mark-neutral`) or explicit palette settings. No decorative gradients are drawn by default; gradient fills appear only when the saved palette asks for them.
- Series identity (colour + dash + marker) is assigned once per series ID, so 12 identical series or 50 series stay distinguishable without colour alone.

## Tokens

Spacing, radius, font size and line height use the product tokens wherever a token has the exact value. Chart text at 11 px and 13 px has no product token, so it is defined once as `--lcc-text-micro` / `--lcc-text-body` (and measured with the same values by `textMeasure.ts`). Remaining raw pixel values are 1 px borders, 2 px focus outlines and component geometry, for which no token exists.

## Performance

- **Fixtures are memoised by parameters** and the model is cached by dataset identity, so resizing never regenerates data or re-derives the model.
- **The plot is memoised** (`React.memo`) with stable interaction callbacks, so tooltip, announcement and report updates do not re-trace marks. Resizing a 50-series × 720-point line chart went from 3,059 ms to 125 ms median per step on the benchmark machine; see benchmark.md.
- No decimation is applied: at the benchmarked sizes each series has fewer points than horizontal pixels. Larger series would need min/max decimation (not implemented).

## Builder integration

- The Edit Asset preview card loses its inner padding for native charts so the chart card is the preview (`.chart-card--native`).
- **Library thumbnails** (Add Asset modal, Deep Dive lists) and `StaticVisualPreview` still use the legacy `ChartPreview`. They are image-first previews of catalog items with no user data; moving them is mechanical but was not needed for the authoring flow. Until then the legacy index-spaced renderer still exists in those places.
