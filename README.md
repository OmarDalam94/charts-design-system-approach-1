# Llumen Asset Builder

A React prototype for creating and editing data visualization **assets** in the Llumen platform. The experience centers on a full-screen **Edit Asset** modal: a six-step wizard, a schema-driven settings panel, and a live preview that actually responds to mapping, color, layout, and tooltip settings.

Click **Create** (or any row in the Assets table) to open the flow.

## Quick start

```bash
npm install
npm run dev
```

Open the local Vite URL (default `http://localhost:5173`).

```bash
npm run build   # production build
npm run preview # preview the production build
```

## Chart system and Chart System Lab

Chart previews are drawn by the Llumen chart system in `src/charts/`. The **Chart System Lab** (left nav, or `npm run lab`, route `#/chart-lab`) documents and tests every chart asset with live controls, scenarios, behavior rules, data editing and property coverage. The Lab and the Edit Asset preview use the same renderer.

```bash
npm run lab              # open the Lab
npm test                 # unit tests
npm run test:e2e         # browser tests (run `npx playwright install chromium` once)
npm run coverage:report  # regenerate coverage and behavior docs
```

Documentation, run guide, decisions and status: [docs/chart-system/](docs/chart-system/README.md).

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | CSS custom properties (Llumen tokens) — no CSS-in-JS |
| Icons | `@phosphor-icons/react` + inline SVG glyphs |
| Fonts | Innovator Grotesk (self-hosted), IBM Plex Mono (Google Fonts) |

---

## What it does now

### Assets, not components

User-facing copy uses **asset**: Assets nav, Create Asset, Edit Asset, Add Asset, empty states, and the page title (`Lumen — Asset Builder`). Internal file and type names still say `component` in places; that is code, not product language.

### Visualization & Mapping

The viz step has two phases:

1. **Picker** — Charts vs Maps (`VisualTypePicker`). Types live in `visualCatalog.ts` (bars, line, area, scatter, donut, gauges, KPIs, table, and map layers such as points, heatmap, discs, wind).
2. **Settings** — Left rail + right form + live preview. A compact `SelectedVisualBar` lets you change type without leaving settings.

### Schema-driven settings

Configurable fields come from `visualSettingsCatalog.ts` (Notion “Visualization Configuration Fields”, Configurable = Yes). Each field has a **subcategory** (nav tab), control type, defaults, and optional `visibleWhen` rules.

The rail is grouped, not a flat list:

| Section | Tabs |
|---------|------|
| **Core** | Mapping, Story card KPI, Color mode |
| **Extra** | Layout, legend, status badge, chart-specific styling, scaling / axes, tooltips, annotations, map options, and the rest — filtered to the current visual |

Tabs that do not apply to the selected visual stay hidden. Incomplete required fields show an alert on the tab. Phosphor icons are mapped in `visualIcons.ts`.

Dependent fields stay mounted and **reveal** (`Show legend` → Position / Content, `Sort by value` → Sort order, `Show label` → Axis label, `Manual override` → KPI Value / Min / Max / Unit). Toggles sit on the same row as their label.

### Live preview

Settings are not decorative. A mock dataset (`mockDataset.ts`) is mapped through `derivePreviewSeries.ts` into a `PreviewSeries`. `previewTheme.ts` is the shared interpreter for palettes, gradients, number formats, and min/max.

| Preview | Renderer |
|---------|----------|
| Charts / KPIs / tables | `ChartPreview` (SVG) |
| Map layers | `MapPreview` |
| Data query | `ChartDataQueryPreview` |
| Data Source step | `ApiResponsePreview` |

Hover uses a **floating overlay** (portaled, not clipped by the chart card). Tooltip content comes from selected fields (`value`, `category`, `timestamp`, `unit`, `status` on charts; `name`, `value`, `type`, `status` on maps) with a D3-style format (default `.0f`).

### Color mode

`ColorPalette` is the color control:

- Palette type: **Solid**, **Gradient**, or **Steps**
- Gradient: distribution (Linear / Quantile / Quantize), **gradient axis** (X / Y), **reverse direction**
- Bars are **masks** over a plot-space `linearGradient` (`userSpaceOnUse`) — a short bar shows only the lower part of the ramp, not a stretched copy
- Stop knobs stay fully inside the track; **DATA RANGE** label and values share 12px IBM Plex Mono
- Chip lists (e.g. Tooltip content fields) sit directly under the label — no extra boxed surface

### Story card KPI

Default KPI calculation is **Sum**. **Manual override** replaces mapped value / range / unit with static Value, Min, Max, and Unit fields.

---

## Design decisions

### 1. Schema-first, visual-type filtered

`EditComponentModal` renders `fieldsForVisual(visualId)` at runtime. Adding a field is a catalog change; the nav, cards, and preview bindings follow. `chartModel.ts` still holds chart type metadata and the `Opt` shape.

### 2. Llumen design system as the single source of truth

`llumen-design-system.css` defines the token layer:

- **Semantic UI colors** — `--color-primary-*`, `--color-positive-*`, etc. (never used for chart series)
- **Data visualization colors** — refract + categorical palettes (charts only)
- **Semantic aliases** — `--lc-bg-brand`, `--lc-text-primary`, `--lc-border-control`, `--lc-surface-*`
- **Spacing** — `--space-xxs` through `--space-11xl`
- **Radius** — `--radius-md`, `--lc-ui-radius` (12px for UI chrome)
- **Typography** — `--lc-font-body` (Innovator Grotesk), `--lc-font-small` + `--lc-font-mono` for section labels

`styles.css` aliases legacy app variables (`--bg`, `--text`, `--muted`) onto Llumen tokens.

**Practice:** prefer `var(--lc-*)` and `var(--space-*)` over hardcoded hex or pixel values.

### 3. Surface hierarchy

| Layer | Token | Usage |
|-------|-------|-------|
| Shell base | `--lc-surface-base` | Header, wizard stepper, settings column, footer |
| Raised panel | `--lc-surface-1` | Visual-settings tab rail + content area |
| Group card | `--lc-surface-2` | Option groups, data-source cards, param tables |
| Tooltip / flyout | `--lc-surface-3` | Dropdown menus, in-app tooltips |

The **preview panel** stays transparent so the chart reads on the modal backdrop. Chart hover tooltips render on `document.body` above the modal.

Backdrop blur (`--lc-backdrop-blur-ui`) is applied on chrome surfaces.

### 4. Modal layout

```
┌─────────────────────────────────────────────────────────┐
│ Header (Edit Asset + name · category)                   │
├─────────────────────────────────────────────────────────┤
│ Wizard stepper (6 steps)                                │
├──────────────────────┬──────────────────────────────────┤
│ Settings (scroll)    │ Preview (chart / map / query)    │
│                      │                                  │
├──────────────────────┴──────────────────────────────────┤
│ Footer (Previous / Next · Create asset)                 │
└─────────────────────────────────────────────────────────┘
```

- **Size:** `min(95vw, 3648px) × 95vh`
- **Column split:** settings **40% / preview 60%** on wide modals; **50 / 50** below 1360px. Animated via `@property --modal-settings-col` and container queries on `.modal`
- **Footer** lives in the settings column, not full modal width

### 5. Wizard stepper

Six linear steps: Data Source → Visualization & Mapping → Filters → Deep Dive → Access → General Info.

- **States:** `disabled` (locked), `active` (unlocked), `selected` (current)
- **Default entry:** Visualization & Mapping (picker first); Data Source is unlocked
- **Indicator:** a blue bloom under the selected step (`ResizeObserver` + vertical mask)
- Final step primary action is **Create asset**

### 6. Visual settings panel (`vs-panel`)

- **Left rail** — Core / Extra section labels with hairlines, then icon + label tabs
- **Right content** — grouped option cards with search
- **Tab split:** rail **30%** / content **70%** (wide); **40 / 60** when the settings column is ≤680px (`@property --vs-nav-col`)

**Group cards:**

- Title sits outside the card; the card holds fields
- Advanced fields collapse with a CSS grid `0fr → 1fr` transition
- Conditional fields use the same reveal pattern (`.ia-reveal`)
- Vertical rhythm: `--ia-block-gap` (`--space-4xl`) between major blocks

### 7. Control patterns

| Pattern | Implementation |
|---------|----------------|
| Dropdowns | Custom `Dropdown` flyout (not native `<select>`) |
| Buttons | `pg-btn pg-btn--primary` / `--secondary` from the design-system playground |
| Inline controls | `--lc-control-height: 36px` |
| Color | `ColorPalette` — full (palette + gradient/steps) or simple swatch |
| Manual range | Split Min / Max inputs, stored as `"min / max"` for `parseMinMax` |
| Toggles | Mini switch opposite the setting name |
| Multi (chips) | Pill chips, no extra surface wrapper |
| Margins | 2×2 grid + lock toggle |

Form controls use `--lc-ui-radius`; the modal shell uses `--radius-2xl`.

### 8. Other wizard steps

| Step | Role |
|------|------|
| **Data Source** | Postman-style API config (method, URL, params, auth, headers, body). Preview shows `ApiResponsePreview`. |
| **Filters** | Filter mapping UI (`FiltersStep`) |
| **Deep Dive** | Tabbed layout of existing assets (`AddComponentModal` + `DeepDiveStep`) |
| **Access** | Who can see the asset |
| **General Info** | Asset name, description, category |

### 9. Accessibility & motion

- Wizard uses `aria-current="step"`; settings nav is `aria-label="Visual settings"`
- Icon-only buttons have `aria-label`
- `prefers-reduced-motion` disables layout and glow transitions
- Focus rings use `--lc-ring-brand` / `--lc-shadow-control-focus`

### 10. Theming

`html[data-theme="dark"]` (default) and `html[data-theme="light"]` via Llumen semantic tokens. The mesh gradient (`#mesh-gradient-bg`) swaps per theme.

---

## Project structure

```
src/
├── App.tsx                      # Shell: Assets nav, table, create/edit
├── CreateComponentPopup.tsx     # Create Asset name prompt
├── EditComponentModal.tsx       # Modal, wizard, settings renderer, preview
├── visualSettingsCatalog.ts     # Notion field catalog + Core/Extra nav
├── visualCatalog.ts             # Chart and map type list
├── visualIcons.ts               # Visual + settings-tab Phosphor icons
├── chartModel.ts                # Chart metadata and Opt type
├── mockDataset.ts               # Preview rows and columns
├── derivePreviewSeries.ts       # Config → PreviewSeries
├── previewTheme.ts              # Palettes, gradients, formats, min/max
├── ChartPreview.tsx             # SVG chart / KPI / table preview
├── MapPreview.tsx               # Map-layer preview
├── ChartDataQueryPreview.tsx    # Data-query preview
├── ColorPalette.tsx             # Palette, gradient, steps editor
├── VisualTypePicker.tsx         # Charts vs Maps picker
├── SelectedVisualBar.tsx        # Compact type switcher in settings
├── DataSourceStep.tsx
├── FiltersStep.tsx
├── DeepDiveStep.tsx
├── AddComponentModal.tsx        # Add Asset picker for deep dive
├── AccessStep.tsx
├── GeneralInfoStep.tsx
├── Dropdown.tsx
├── llumen-design-system.css
└── styles.css
```

---

## Core design practices (summary)

1. **Tokens over literals** — spacing, color, type, and radius come from the design system
2. **Catalog-first settings** — fields and nav groups are data, filtered by visual type
3. **Preview is bound to settings** — mock data + derivation + theme helpers, not a static mockup
4. **Progressive disclosure** — Core vs Extra, `visibleWhen` reveals, advanced per group
5. **Container-query responsiveness** — splits react to column width, not just viewport
6. **Animated layout with `@property`** — column ratios interpolate; respect reduced motion
7. **One picker language** — dropdowns, palette triggers, and flyouts share the same patterns
8. **Surface discipline** — three elevation levels + transparent preview; hover tooltips float above chrome
9. **Asset language** — product copy says asset; keep wind U/V *Component* fields as vector terms
10. **Platform consistency** — playground button classes (`pg-btn`) and Llumen tokens everywhere

---

## License

Private / internal Llumen prototype. Font files (Innovator Grotesk) are bundled for development preview — confirm licensing before external distribution.
