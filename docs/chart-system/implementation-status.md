# Implementation status

Last updated 2026-10-06. Counts come from the generated reports; rerun `npm run coverage:report` and the test suites to refresh them.

## Inventory

| Area | State |
| --- | --- |
| Assets | 17 chart assets on the native renderer (maps out of scope, keep the legacy preview). |
| Catalog coverage | 1,197 property × asset entries: 1,168 verified, 10 unverified, 0 missing, 16 invalid combinations, 3 not applicable. See coverage.md. |
| Behavior rules | 38 executable rules, all passing. See behavior.md. |
| Scenarios | 191 built-in, including 10 compound scenarios; 18 seeded fixture variants. |
| Lab | Playground, Scenarios, Behavior, Data and Coverage tabs; size presets, compare 320/640/1024, readout of sizes and adaptations, URL / JSON / local presets, theme, direction, zoom, reduced motion, host status. |
| Builder | Edit Asset live preview uses `LlumenChart` through `BuilderChart`. |
| Tests | 145 unit tests; 83 browser tests (+7 opt-in benchmark cases). |
| Docs | README (run guide and code map), decisions, behavior, coverage, benchmark, screenshots in both themes. |

## Acceptance criteria

| Requirement | Status | Evidence |
| --- | --- | --- |
| Llumen-owned renderer, existing visual language, no third-party chart system | Done | `src/charts/*`; D3 used for math only (decisions.md). |
| No framework, CSS-system or app-shell migration | Done | Same React/Vite app; Lab is a lazy-loaded hash route. |
| ChartFrame, responsive layout, legend, axes, annotations, tooltip, data alternative, identity, status | Done | `LlumenChart.tsx`, `frame.ts`, `layout.ts`, `primitives/*`; behavior rules by area. |
| Chart colours encode data; no decorative gradients by default | Done | decisions.md › Colour. |
| Elapsed-time spacing; null vs zero | Done | Rules `time-elapsed`, `null-not-zero`. |
| Preserve `group::name` saved config | Done | Settings read by key; suggestions never written (rule and builder e2e). |
| Coverage registry generated from the catalog with five statuses | Done | `coverage.ts`, `npm run coverage:report`, Lab Coverage tab. |
| Lab dashboard tabs, toolbar, compare, readout, savable/exportable scenarios, URLs | Done | `e2e/lab.spec.ts`. |
| Required compound scenarios | Done | 10 compound scenarios, each with a visual test in both themes. |
| Lab and builder share the renderer | Done | `BuilderChart`; `e2e/builder.spec.ts`. |
| Never substitute mock values for invalid or empty input | Done | Missing-mapping state; Data tab keeps last valid result (e2e). Builder suggestions are labelled as suggestions in the notes panel. |
| Unit and browser tests (resize, legend, keyboard/touch, scenario round-trips, property effects) | Done | See README › Tests. Touch is emulated (Playwright `hasTouch`), not a physical device. |
| Screenshots in both themes | Done | `screenshots/dark`, `screenshots/light` (32 each), plus Lab and builder shots. |
| Dense-data benchmark | Done | benchmark.md (Apple M4, headless Chromium, dev build). |
| WCAG 2.2 AA | Partial | Keyboard paths, names and focus are tested; no automated axe audit, contrast sweep or screen-reader pass yet (see Gaps). |
| Implementation-status doc, decisions, run guide | Done | This file, decisions.md, README.md. |

## Checks completed

- `npm test`: 145 unit tests pass (derivation, layout, expressions, behavior rules, coverage probes, builder suggestions, performance contracts).
- `npm run test:e2e`: 83 browser tests pass.
  - **Visual (64):** geometry checks (no text outside the card, no overlapping SVG labels) for 32 scenarios × 2 themes.
  - **Lab (18):** resize by input, preset, drag and keyboard; mode boundaries; compact summary; legend toggle, Only, all-hidden recovery, Show all, keyboard toggles; keyboard tooltip (arrows, Enter to pin, Escape); hover; emulated touch tap and close; URL reload round-trip with Modified/Reset; JSON export/import round-trip; compare cells at exact widths; Data tab invalid input and CSV replacement; inspector switch changes the chart; small-viewport drawers with focus return; workspace scroll containment; RTL; 200% zoom reflow; documentation screenshots.
  - **Builder (1):** native preview, suggestion disclosure, mapping edits, Small/Medium/Large fill, asset creation.
- `BENCH=1` benchmark: 7 dense cases recorded.
- `npm run build`: type-check and production build succeed.

## Defects found and fixed in the final pass

- Resizing re-generated fixture data and re-derived the model on every step (3 s per step at 36,000 points). Fixtures are now memoised; the plot is memoised with stable callbacks (8 → 2 renders per resize).
- Legend “Only” presses were lost after toggling an item, because revealing the button reflowed the centred row. It is now an overlay.
- The Data tab's derived table escaped its container and covered **Apply data**.
- The modal's toggle switches (also used by the Lab inspector) had no accessible name and could not be reached or operated by keyboard.
- The dense table fixture produced 60 rows instead of 400.

## Implemented but unverified (10 coverage entries)

The renderer reads these, but no probe shows an observable model change:

- Scatter: `Colors::Palette`, `Palette › categoryColors`, `Palette › categoryField`, `Colors::Gradient type` (radial gradient checked visually only), `Tooltips::Enable hover effects`.
- Donut: `Tooltips::Enable hover effects`.
- Gauge: `Colors::Palette`, `Palette › categoryField`.
- Polar: `Mapping::Aggregation`.
- Availability: `Colors::Palette`.

## Unresolved gaps

- **Single-series scatter ignores Gradient/Steps palettes**: the renderer has no per-point colour channel.
- **Legacy preview still exists** for library thumbnails (Add Asset modal, Deep Dive lists) and `StaticVisualPreview`, with its index-based spacing. Maps also keep it (out of scope).
- **Accessibility not yet verified**: automated axe audit, palette contrast against both themes, Windows High Contrast / forced colours, 200% text-only zoom (page zoom is tested), and screen-reader passes (VoiceOver, NVDA).
- **Touch** is tested with emulation only; no physical device runs.
- **No pixel-baseline visual regression**: screenshots are reviewed, not diffed.
- **No line decimation**: series wider than the plot in pixels would draw every point.
- **Pairwise property coverage** is not exhaustive. Probes check each property alone; interactions are covered only by the compound scenarios and conflict rules.
- **Benchmark** was run on one machine with a development build; there is no production-build or low-end device run.
- **RTL decision** (data stays LTR) should be reviewed with Arabic-speaking users.
