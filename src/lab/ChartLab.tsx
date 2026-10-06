import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "../charts/charts.css";
import "./lab.css";
import { chartAsset, type ChartAssetDef } from "../charts/assets";
import { buildChartModelCached } from "../charts/build";
import { coverageForAsset, type CoverageEntry } from "../charts/coverage";
import { FIXTURE_VARIANTS, type FixtureVariant } from "../charts/fixtures";
import { scenarioById, scenarioInput, scenariosFor, type Scenario } from "../charts/scenarios";
import { fieldsForVisual } from "../visualSettingsCatalog";
import { Inspector } from "./Inspector";
import { BehaviorPanel, CoveragePanel, DataPanel, ScenariosPanel } from "./panels";
import { PreviewFrame, Readout, useReport } from "./Preview";
import {
  COMPARE_WIDTHS,
  downloadText,
  HEIGHT_PRESETS,
  LAB_TABS,
  scenarioFileName,
  serializeScenario,
  SIZE_LIMITS,
  useLabState,
  WIDTH_PRESETS,
  type LabTab,
} from "./labState";

const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Cartesian", ids: ["line-chart", "area-chart", "vertical-bar", "horizontal-bar", "scatter-plot", "range"] },
  { label: "Part-to-whole & flow", ids: ["donut-chart", "polar-wind-rose", "sankey-chart"] },
  { label: "Metric & status", ids: ["kpi-card", "kpi-grid", "legacy-kpi", "progress-bar", "gauge-linear", "score-indicator", "availability"] },
  { label: "Tabular", ids: ["table"] },
];

const ICON_FALLBACK: Record<string, string> = { "legacy-kpi": "kpi-card" };

/** Fixture variants that only make sense for some assets; the reason is shown on the disabled option. */
export function fixtureRestriction(asset: ChartAssetDef, variant: FixtureVariant): string | null {
  switch (variant) {
    case "identical":
      return asset.supportsSeries ? null : "Needs an asset with a Series mapping.";
    case "unknown-intervals":
      return asset.visualId === "availability" ? null : "Unknown intervals are an Availability fixture.";
    case "wide":
      return asset.visualId === "table" ? null : "Wide column sets are a Table fixture.";
    case "ml-forecast":
      return fieldsForVisual(asset.visualId).some((o) => o.name === "Y-axis values (ML only)") ? null : "This asset has no ML Actual/Predicted setting.";
    case "gaps":
      return ["line", "area", "scatter", "bar"].includes(asset.family) ? null : "Time gaps only change time-based or point assets.";
    case "dense":
      return ["kpi", "legacy-kpi", "gauge", "score"].includes(asset.family) ? "Single-value assets read one row; density does not apply." : null;
    default:
      return null;
  }
}

function useCoverage(visualId: string) {
  const cache = useRef(new Map<string, CoverageEntry[]>());
  const [entries, setEntries] = useState<CoverageEntry[] | null>(() => cache.current.get(visualId) ?? null);
  useEffect(() => {
    const hit = cache.current.get(visualId);
    if (hit) return setEntries(hit);
    setEntries(null);
    const t = window.setTimeout(() => {
      const e = coverageForAsset(visualId);
      cache.current.set(visualId, e);
      setEntries(e);
    }, 60);
    return () => window.clearTimeout(t);
  }, [visualId]);
  return entries;
}

function Drawer({ open, onClose, label, children, side }: { open: boolean; onClose: () => void; label: string; children: ReactNode; side: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    ref.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="lab-drawer" data-side={side}>
      <div className="lab-drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div className="lab-drawer__panel" role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        <div className="lab-drawer__head">
          <strong>{label}</strong>
          <button type="button" className="lab-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AssetNav({ current, onSelect }: { current: string; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const match = (a: ChartAssetDef) => !q || `${a.label} ${a.visualId} ${a.family}`.toLowerCase().includes(q.trim().toLowerCase());
  const base = import.meta.env.BASE_URL;
  return (
    <nav className="lab-nav" aria-label="Chart assets">
      <input className="lab-input" type="search" placeholder="Search 17 assets" aria-label="Search assets" value={q} onChange={(e) => setQ(e.target.value)} />
      {NAV_GROUPS.map((g) => {
        const items = g.ids.map((id) => chartAsset(id)).filter(match);
        if (!items.length) return null;
        return (
          <div key={g.label} className="lab-nav__group">
            <p className="lab-nav__caption">{g.label}</p>
            <ul>
              {items.map((a) => (
                <li key={a.visualId}>
                  <button type="button" className={"lab-nav__item" + (a.visualId === current ? " is-active" : "")} aria-current={a.visualId === current ? "page" : undefined} onClick={() => onSelect(a.visualId)} data-visual={a.visualId}>
                    <img src={`${base}figma/chart-types/${ICON_FALLBACK[a.visualId] ?? a.visualId}.svg`} alt="" width={20} height={20} />
                    <span className="lab-nav__label">{a.label}</span>
                    <span className="lab-nav__count" title="Built-in scenarios">
                      {scenariosFor(a.visualId).length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function NumberWithPresets({ label, value, presets, min, max, onChange, testId }: { label: string; value: number; presets: number[]; min: number; max: number; onChange: (v: number) => void; testId: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
    else setDraft(String(value));
  };
  return (
    <div className="lab-sizer">
      <label className="lab-field-inline">
        <span>{label}</span>
        <input
          className="lab-input lab-input--num"
          type="number"
          min={min}
          max={max}
          value={draft}
          data-testid={testId}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        <span className="lab-hint">px</span>
      </label>
      <div className="lab-presets" role="group" aria-label={`${label} presets`}>
        {presets.map((p) => (
          <button key={p} type="button" className={"lab-preset" + (p === value ? " is-active" : "")} aria-pressed={p === value} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChartLab() {
  const lab = useLabState();
  const { scenario, env } = lab;
  const asset = chartAsset(scenario.visualId);
  const [dataView, setDataView] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [report, onReport] = useReport();
  const lastValid = useRef<{ key: string; input: ReturnType<typeof scenarioInput> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverage = useCoverage(scenario.visualId);

  const built = useMemo(() => {
    try {
      const r = scenarioInput(scenario);
      lastValid.current = { key: scenario.id, input: r };
      return { ...r, error: null as string | null };
    } catch (e) {
      const prev = lastValid.current?.input ?? scenarioInput({ ...scenario, dataset: null });
      return { ...prev, error: `This configuration could not be derived (${(e as Error).message}). Showing the last valid result.` };
    }
  }, [scenario]);
  const model = buildChartModelCached(built.input);

  // Theme applies to the whole document; restore the app theme when leaving the Lab.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    return () => {
      if (prev) el.setAttribute("data-theme", prev);
    };
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", env.theme);
  }, [env.theme]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = LAB_TABS[(i + d + LAB_TABS.length) % LAB_TABS.length];
    lab.setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const explicitKeys = useMemo(() => new Set(Object.keys(scenario.config).filter((k) => scenario.config[k] !== null)), [scenario.config]);
  const assetScenarios = scenariosFor(scenario.visualId);
  const localForAsset = lab.presets.filter((p) => p.scenario.visualId === scenario.visualId);

  const setSize = (w: number, h: number) => lab.update({ width: w, height: h });
  const fx = scenario.fixture;
  const tryScenario = (id: string) => {
    const s = scenarioById(id);
    if (s) {
      lab.load(s);
      lab.setTab("playground");
    }
  };

  const share = async () => {
    const r = lab.shareUrl();
    if (!r.ok) return setToast(r.reason);
    try {
      await navigator.clipboard.writeText(r.url);
      setToast("Link copied. It reproduces this scenario and its settings.");
    } catch {
      window.prompt("Copy this link", r.url);
    }
  };

  const onImportFile = async (file: File) => {
    const err = lab.importText(await file.text());
    setToast(err ?? `Imported “${file.name}”.`);
  };

  const inspector = (
    <Inspector
      visualId={scenario.visualId}
      config={built.input.config}
      dataset={built.input.dataset}
      advanced={lab.advanced}
      onAdvanced={lab.setAdvanced}
      onChange={lab.setConfigValue}
      onResetField={(key) =>
        lab.update((s) => {
          const config = { ...s.config };
          delete config[key];
          return { ...s, config };
        })
      }
      explicitKeys={explicitKeys}
      coverage={coverage}
    />
  );
  const nav = (
    <AssetNav
      current={scenario.visualId}
      onSelect={(id) => {
        lab.selectAsset(id);
        setNavOpen(false);
      }}
    />
  );
  const showInspector = lab.tab === "playground" || lab.tab === "data";

  return (
    <div className="lab" data-reduced-motion={env.reducedMotion || undefined} data-testid="chart-lab">
      <header className="lab-header">
        <a className="lab-btn lab-btn--ghost" href="#/">
          ← Assets
        </a>
        <button type="button" className="lab-btn lab-only-narrow" onClick={() => setNavOpen(true)} aria-haspopup="dialog">
          Assets list
        </button>
        <div className="lab-header__title">
          <h1>Chart System Lab</h1>
          <span className="lab-hint">
            {asset.label} · <code>{asset.visualId}</code>
            {asset.chartId !== asset.visualId && (
              <>
                {" "}
                · renderer <code>{asset.chartId}</code>
              </>
            )}
          </span>
        </div>
        <div className="lab-seg" role="radiogroup" aria-label="Theme">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={env.theme === t} className={"lab-seg__btn" + (env.theme === t ? " is-active" : "")} onClick={() => lab.setEnv({ ...env, theme: t })}>
              {t === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
        {showInspector && (
          <button type="button" className="lab-btn lab-only-medium" onClick={() => setInspectorOpen(true)} aria-haspopup="dialog">
            Properties
          </button>
        )}
      </header>

      {lab.notice && (
        <div className="lab-notice" role="status">
          {lab.notice}
          <button type="button" className="lab-btn lab-btn--ghost" onClick={() => lab.setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className={"lab-body" + (showInspector ? "" : " lab-body--no-inspector")}>
        <aside className="lab-nav-panel lab-hide-narrow">{nav}</aside>

        <main className="lab-main">
          <div className="lab-tabs" role="tablist" aria-label="Lab views">
            {LAB_TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => (tabRefs.current[t.id] = el)}
                type="button"
                role="tab"
                id={`lab-tab-${t.id}`}
                aria-selected={lab.tab === t.id}
                aria-controls={`lab-panel-${t.id}`}
                tabIndex={lab.tab === t.id ? 0 : -1}
                className={"lab-tab" + (lab.tab === t.id ? " is-active" : "")}
                onClick={() => lab.setTab(t.id as LabTab)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="lab-tabpanel" role="tabpanel" id={`lab-panel-${lab.tab}`} aria-labelledby={`lab-tab-${lab.tab}`}>
            {lab.tab === "playground" && (
              <>
                <div className="lab-scenario">
                  <label className="lab-field-inline lab-scenario__pick">
                    <span>Scenario</span>
                    <select
                      className="lab-input"
                      value={scenario.id}
                      onChange={(e) => {
                        const s = assetScenarios.find((x) => x.id === e.target.value) ?? localForAsset.find((p) => p.scenario.id === e.target.value)?.scenario;
                        if (s) lab.load(s);
                      }}
                      data-testid="scenario-select"
                    >
                      {!assetScenarios.some((s) => s.id === scenario.id) && !localForAsset.some((p) => p.scenario.id === scenario.id) && <option value={scenario.id}>{scenario.name}</option>}
                      <optgroup label="Built-in">
                        {assetScenarios.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                      {localForAsset.length > 0 && (
                        <optgroup label="Saved on this device">
                          {localForAsset.map((p) => (
                            <option key={p.scenario.id} value={p.scenario.id}>
                              {p.scenario.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  {lab.modified && <span className="lab-pill lab-pill--brand" data-testid="modified-pill">Modified</span>}
                  <span className="lab-scenario__actions">
                    <button type="button" className="lab-btn" onClick={lab.reset} disabled={!lab.modified} data-testid="reset-scenario">
                      Reset
                    </button>
                    <button
                      type="button"
                      className="lab-btn"
                      onClick={() => {
                        const name = window.prompt("Name this preset (saved in this browser only)", `${scenario.name} (modified)`);
                        if (name === null) return;
                        const err = lab.savePreset(name);
                        setToast(err ?? "Saved on this device only. Export JSON to share it.");
                      }}
                    >
                      Save locally
                    </button>
                    <button type="button" className="lab-btn" onClick={share} title={lab.urlStatus.ok ? "Copy a link to this configuration" : lab.urlStatus.reason}>
                      Copy link
                    </button>
                    <button type="button" className="lab-btn" onClick={() => downloadText(scenarioFileName(scenario), serializeScenario(scenario, env))}>
                      Export JSON
                    </button>
                    <button type="button" className="lab-btn" onClick={() => fileRef.current?.click()}>
                      Import JSON
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onImportFile(f);
                        e.target.value = "";
                      }}
                    />
                  </span>
                </div>
                {(scenario.description || scenario.expected) && (
                  <div className="lab-expect">
                    {scenario.description && <p>{scenario.description}</p>}
                    {scenario.expected && (
                      <p>
                        <b>Expected:</b> {scenario.expected}
                      </p>
                    )}
                    {!lab.urlStatus.ok && <p className="lab-hint">Link sharing: {lab.urlStatus.reason}</p>}
                  </div>
                )}

                <div className="lab-toolbar" role="toolbar" aria-label="Preview controls">
                  <NumberWithPresets label="Width" value={scenario.width} presets={WIDTH_PRESETS} min={SIZE_LIMITS.width[0]} max={SIZE_LIMITS.width[1]} onChange={(w) => setSize(w, scenario.height)} testId="lab-width" />
                  <NumberWithPresets label="Height" value={scenario.height} presets={HEIGHT_PRESETS} min={SIZE_LIMITS.height[0]} max={SIZE_LIMITS.height[1]} onChange={(h) => setSize(scenario.width, h)} testId="lab-height" />
                </div>
                <div className="lab-toolbar lab-toolbar--wrap" role="toolbar" aria-label="Data and environment">
                  <label className="lab-field-inline">
                    <span>Fixture</span>
                    <select className="lab-input" value={fx.variant} onChange={(e) => lab.update({ fixture: { ...fx, variant: e.target.value as FixtureVariant }, dataset: null })} data-testid="lab-fixture">
                      {FIXTURE_VARIANTS.map((v) => {
                        const reason = fixtureRestriction(asset, v.id);
                        return (
                          <option key={v.id} value={v.id} disabled={!!reason} title={reason ?? v.description}>
                            {v.label}
                            {reason ? ` — ${reason}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {asset.supportsSeries ? (
                    <label className="lab-field-inline">
                      <span>Series</span>
                      <select className="lab-input" value={fx.series} onChange={(e) => lab.update({ fixture: { ...fx, series: Number(e.target.value) }, dataset: null })} data-testid="lab-series">
                        {[...new Set([...asset.seriesCounts, fx.series])].sort((a, b) => a - b).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="lab-hint" title="This asset has no Series mapping.">
                      Series: n/a
                    </span>
                  )}
                  {asset.categoryCounts.length > 0 && (
                    <label className="lab-field-inline">
                      <span>{asset.family === "kpi-grid" ? "Tiles" : asset.family === "availability" ? "Intervals" : asset.family === "table" ? "Rows" : "Categories"}</span>
                      <select className="lab-input" value={fx.categories} onChange={(e) => lab.update({ fixture: { ...fx, categories: Number(e.target.value) }, dataset: null })} data-testid="lab-categories">
                        {[...new Set([...asset.categoryCounts, fx.categories])].sort((a, b) => a - b).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {asset.visualId === "sankey-chart" && (
                    <label className="lab-field-inline">
                      <span>Stages</span>
                      <select
                        className="lab-input"
                        value={fx.stages ?? 3}
                        onChange={(e) => {
                          const stages = Number(e.target.value);
                          lab.update((s) => ({ ...s, fixture: { ...s.fixture, stages }, dataset: null, config: { ...s.config, "Mapping::Number of stages": String(stages) } }));
                        }}
                      >
                        {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="lab-field-inline">
                    <span>Seed</span>
                    <input className="lab-input lab-input--num" type="number" value={fx.seed} onChange={(e) => lab.update({ fixture: { ...fx, seed: Number(e.target.value) || 0 }, dataset: null })} />
                  </label>
                  <label className="lab-field-inline">
                    <span>Host state</span>
                    <select className="lab-input" value={scenario.status ?? "ready"} onChange={(e) => lab.update({ status: e.target.value as Scenario["status"] })} data-testid="lab-status">
                      <option value="ready">Ready</option>
                      <option value="loading">Loading</option>
                      <option value="error">Error (retry)</option>
                      <option value="stale">Stale</option>
                      <option value="partial">Partial</option>
                    </select>
                  </label>
                  <label className="lab-field-inline">
                    <span>Direction</span>
                    <select className="lab-input" value={env.dir} onChange={(e) => lab.setEnv({ ...env, dir: e.target.value as "ltr" | "rtl" })}>
                      <option value="ltr">LTR</option>
                      <option value="rtl">RTL</option>
                    </select>
                  </label>
                  <label className="lab-field-inline" title="Simulates browser zoom: the card keeps its size while text and spacing grow.">
                    <span>Zoom</span>
                    <select className="lab-input" value={env.zoom} onChange={(e) => lab.setEnv({ ...env, zoom: Number(e.target.value) })} data-testid="lab-zoom">
                      {[1, 1.25, 1.5, 2].map((z) => (
                        <option key={z} value={z}>
                          {z * 100}%
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="lab-switch">
                    <input type="checkbox" role="switch" checked={env.reducedMotion} onChange={(e) => lab.setEnv({ ...env, reducedMotion: e.target.checked })} />
                    <span className="lab-switch__track" aria-hidden="true" />
                    <span>Reduced motion</span>
                  </label>
                  <span className="lab-toolbar__spacer" />
                  <label className="lab-switch">
                    <input type="checkbox" role="switch" checked={lab.compare} onChange={(e) => lab.setCompare(e.target.checked)} data-testid="lab-compare" />
                    <span className="lab-switch__track" aria-hidden="true" />
                    <span>Compare 320 / 640 / 1024</span>
                  </label>
                  <button type="button" className="lab-btn" aria-pressed={dataView} onClick={() => setDataView((v) => !v)} data-testid="lab-view-data">
                    {dataView ? "Show chart" : "View data"}
                  </button>
                  <button type="button" className="lab-btn" aria-pressed={showSummary} aria-expanded={showSummary} onClick={() => setShowSummary((v) => !v)}>
                    Text summary
                  </button>
                </div>

                {built.error && (
                  <p className="lab-error" role="alert">
                    {built.error}
                  </p>
                )}
                {showSummary && (
                  <div className="lab-summary-text" aria-live="polite">
                    <p>{model.summary}</p>
                  </div>
                )}

                <section className="lab-workspace" aria-label={`Preview workspace, ${lab.compare ? "comparing 320, 640 and 1024 px" : `${scenario.width} by ${scenario.height} px`}`} tabIndex={-1}>
                  {lab.compare ? (
                    <div className="lab-compare">
                      {COMPARE_WIDTHS.map((w) => (
                        <CompareCell key={w} width={w} height={scenario.height} built={built} env={env} dataView={dataView} />
                      ))}
                    </div>
                  ) : (
                    <PreviewFrame width={scenario.width} height={scenario.height} input={built.input} env={env} dataView={dataView} onResize={setSize} onReport={onReport} label={`${asset.label} card`} testId="lab-frame" />
                  )}
                </section>
                {!lab.compare && <Readout report={report} zoom={env.zoom} />}
              </>
            )}
            {lab.tab === "scenarios" && <ScenariosPanel visualId={scenario.visualId} current={scenario} presets={lab.presets} onLoad={(s) => (lab.load(s), lab.setTab("playground"))} onDeletePreset={lab.deletePreset} />}
            {lab.tab === "behavior" && <BehaviorPanel visualId={scenario.visualId} onTry={tryScenario} />}
            {lab.tab === "data" && <DataPanel scenario={scenario} dataset={built.input.dataset} model={model} config={built.input.config} onDataset={(ds) => lab.update({ dataset: ds })} />}
            {lab.tab === "coverage" && <CoveragePanel visualId={scenario.visualId} entries={coverage} />}
          </div>
        </main>

        {showInspector && <aside className="lab-inspector-panel lab-hide-medium">{inspector}</aside>}
      </div>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Chart assets" side="left">
        {nav}
      </Drawer>
      <Drawer open={inspectorOpen && showInspector} onClose={() => setInspectorOpen(false)} label="Properties" side="right">
        {inspector}
      </Drawer>
      {toast && (
        <div className="lab-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function CompareCell({ width, height, built, env, dataView }: { width: number; height: number; built: ReturnType<typeof scenarioInput>; env: ReturnType<typeof useLabState>["env"]; dataView: boolean }) {
  const [report, onReport] = useReport();
  return (
    <figure className="lab-compare__cell">
      <figcaption>
        <b>{width}px</b>
        {report && (
          <span className="lab-hint">
            {" "}
            · {report.mode} · plot {report.compactSummary ? "summary" : `${Math.round(report.plot.width)}×${Math.round(report.plot.height)}`} · {report.adaptations.length} adaptation{report.adaptations.length === 1 ? "" : "s"}
          </span>
        )}
      </figcaption>
      <PreviewFrame width={width} height={height} input={built.input} env={env} dataView={dataView} onReport={onReport} label={`${width} pixel comparison card`} testId={`lab-compare-${width}`} />
      {report && report.adaptations.length > 0 && (
        <ul className="lab-compare__notes">
          {report.adaptations.map((a, i) => (
            <li key={a.id + i}>{a.reason}</li>
          ))}
        </ul>
      )}
    </figure>
  );
}
