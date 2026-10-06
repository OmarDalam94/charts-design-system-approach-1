# Llumen chart system

A Llumen-owned renderer for the 17 chart assets in the Asset Builder, and the **Chart System Lab** that documents and tests it. The Lab and the Edit Asset modal's live preview render through the same component (`LlumenChart`) and the same model builder (`buildChartModel`), so what passes in the Lab is what an author sees.

| Document | What it is |
| --- | --- |
| [implementation-status.md](implementation-status.md) | Inventory, acceptance criteria, checks completed, unverified work and open gaps. |
| [decisions.md](decisions.md) | Design decisions, rationale, tradeoffs and dependency purposes. |
| [behavior.md](behavior.md) | Executable behavior rules (generated). |
| [coverage.md](coverage.md) / [coverage.json](coverage.json) | Every catalog property × asset with a status and evidence (generated). |
| [benchmark.md](benchmark.md) / [benchmark.json](benchmark.json) | Dense-data timings with environment (generated). |
| [screenshots/](screenshots/) | Every default and compound scenario in dark and light, the builder preview, and Lab views. |

## Run guide

Requirements: Node 20+ and npm. The repository is a Vite app served under `/charts-design-system-approach-1/`.

```bash
npm install
npm run dev        # Asset Builder at http://localhost:5173/charts-design-system-approach-1/
npm run lab        # same server, opens the Lab at #/chart-lab
```

The Lab is also linked from the left navigation (**Chart System Lab**). Any scenario opens directly with `#/chart-lab?s=id:<scenario-id>`, for example `#/chart-lab?s=id:line-chart:compound-50-legend`. Edited scenarios are encoded into the URL (**Copy link**) when they fit in 1,800 characters; otherwise use **Export JSON** / **Import JSON**. **Save locally** keeps presets in this browser's `localStorage` only.

### Tests and reports

```bash
npm test                     # unit tests (vitest): derivation, layout, expressions, behavior rules, coverage probes
npx playwright install chromium   # once, for browser tests
npm run test:e2e             # browser tests; starts its own Vite server on port 5181
BENCH=1 npx playwright test e2e/benchmark.spec.ts --workers=1   # dense-data benchmark → benchmark.{md,json}
npm run coverage:report      # regenerates coverage.{md,json} and behavior.md
npm run build                # type-check and production build
```

Browser tests write screenshots to `docs/chart-system/screenshots/` as a side effect, so run them before reviewing visual changes.

| Suite | File | What it checks |
| --- | --- | --- |
| Visual | `e2e/visual.spec.ts` | 32 scenarios (every asset's default, the 10 compound scenarios, 5 edge cases) in both themes: no text outside the card and no overlapping SVG labels. Saves screenshots for review; they are not pixel-compared against a baseline. |
| Lab interaction | `e2e/lab.spec.ts` | Resize by input, preset, drag and keyboard; size-mode boundaries; compact summary; legend toggle/Only/all-hidden/Show all; keyboard and touch tooltips; URL and JSON round-trips; compare; Data tab invalid input; inspector property effect; small-viewport drawers; RTL. |
| Builder | `e2e/builder.spec.ts` | The Edit Asset preview uses the native renderer, discloses suggested columns, follows mapping edits, fills the card at Small/Medium/Large, and the asset can still be created. |
| Benchmark | `e2e/benchmark.spec.ts` | Opt-in timings (see benchmark.md). |

## Code map

| Path | Role |
| --- | --- |
| `src/charts/LlumenChart.tsx` | The card: frame, header, legend, plot, tooltip, data view, notes, status, reports. |
| `src/charts/build.ts`, `derive/*` | `ChartInput` (saved `group::name` config + dataset + context) → `ChartModel`. Pure and cached by dataset identity. |
| `src/charts/frame.ts`, `layout.ts` | Size modes and space allocation (header, legend, plot minimums, compact summary). |
| `src/charts/families/*` | SVG/HTML renderers per family (cartesian, radial, metric). |
| `src/charts/primitives/*` | Legend, tooltip, header, data table, status. |
| `src/charts/scales.ts`, `format.ts`, `identity.ts`, `color.ts`, `expr.ts` | Ticks and domains, number/time formatting, series identity, palettes, the safe flag-expression evaluator. |
| `src/charts/scenarios.ts`, `fixtures.ts` | Seeded fixtures (18 variants) and 191 built-in scenarios, 10 of them compound. |
| `src/charts/behavior.ts`, `coverage.ts` | Executable behavior rules and the property coverage registry. |
| `src/charts/BuilderChart.tsx` | Adapter used by the Edit Asset modal. |
| `src/lab/*` | The Lab UI (Playground, Scenarios, Behavior, Data, Coverage). |
