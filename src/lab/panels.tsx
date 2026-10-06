import { useEffect, useMemo, useRef, useState } from "react";
import { CHART_ASSETS, chartAsset } from "../charts/assets";
import { BEHAVIOR_RULES, type BehaviorRule, type RuleResult } from "../charts/behavior";
import { coverageForAsset, EXTENSIONS, LAB_CONTROLS, summarize, type CoverageEntry, type CoverageStatus } from "../charts/coverage";
import type { ChartDataset } from "../charts/data/values";
import type { ChartModel } from "../charts/model";
import { BUILT_IN_SCENARIOS, scenarioById, type Scenario } from "../charts/scenarios";
import { fieldsForVisual } from "../visualSettingsCatalog";
import { isColumnCompatible } from "../mockDataset";
import { DataTableView } from "../charts/primitives/DataTableView";
import type { LabPreset } from "./labState";
import { datasetToCsv, parseDatasetText } from "./dataInput";

/* ---------------- Scenarios ---------------- */

export function ScenariosPanel({
  visualId,
  current,
  presets,
  onLoad,
  onDeletePreset,
}: {
  visualId: string;
  current: Scenario;
  presets: LabPreset[];
  onLoad: (s: Scenario) => void;
  onDeletePreset: (id: string) => void;
}) {
  const [scope, setScope] = useState<"asset" | "compound" | "all">("asset");
  const [tag, setTag] = useState("");
  const list = BUILT_IN_SCENARIOS.filter((s) => (scope === "asset" ? s.visualId === visualId : scope === "compound" ? s.tags.includes("compound") : true)).filter((s) => !tag || s.tags.includes(tag));
  const tags = [...new Set(BUILT_IN_SCENARIOS.flatMap((s) => s.tags))].sort();
  const mine = presets.filter((p) => scope !== "asset" || p.scenario.visualId === visualId);
  return (
    <div className="lab-panel" aria-label="Scenarios">
      <div className="lab-panel__bar">
        <div className="lab-seg" role="radiogroup" aria-label="Scenario scope">
          {(
            [
              ["asset", `This asset`],
              ["compound", "Compound"],
              ["all", `All (${BUILT_IN_SCENARIOS.length})`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={scope === id} className={"lab-seg__btn" + (scope === id ? " is-active" : "")} onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="lab-field-inline">
          <span>Tag</span>
          <select className="lab-input" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Any</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <span className="lab-hint">{list.length} scenarios</span>
      </div>
      {mine.length > 0 && (
        <section className="lab-section">
          <h3 className="lab-section__title">
            Saved on this device <span className="lab-pill">Local only — not shared or synced</span>
          </h3>
          <ul className="lab-cards">
            {mine.map((p) => (
              <li key={p.scenario.id} className="lab-card">
                <div className="lab-card__head">
                  <strong>{p.scenario.name}</strong>
                  <span className="lab-hint">{chartAsset(p.scenario.visualId).label}</span>
                </div>
                <p className="lab-card__desc">Saved {new Date(p.savedAt).toLocaleString()}</p>
                <div className="lab-card__actions">
                  <button type="button" className="lab-btn lab-btn--primary" onClick={() => onLoad(p.scenario)}>
                    Open
                  </button>
                  <button type="button" className="lab-btn" onClick={() => onDeletePreset(p.scenario.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="lab-cards">
        {list.map((s) => (
          <li key={s.id} className={"lab-card" + (current.id === s.id ? " is-current" : "")}>
            <div className="lab-card__head">
              <strong>{s.name}</strong>
              {scope !== "asset" && <span className="lab-hint">{chartAsset(s.visualId).label}</span>}
            </div>
            <p className="lab-card__desc">{s.description}</p>
            <p className="lab-card__expected">
              <span>Expected</span> {s.expected}
            </p>
            <div className="lab-card__foot">
              <span className="lab-tags">
                {s.tags.map((t) => (
                  <span key={t} className="lab-pill">
                    {t}
                  </span>
                ))}
                <span className="lab-pill">
                  {s.width}×{s.height}
                </span>
              </span>
              <button type="button" className="lab-btn lab-btn--primary" onClick={() => onLoad(s)} aria-label={`Open scenario ${s.name}`}>
                {current.id === s.id ? "Reopen" : "Open"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Behavior ---------------- */

export function BehaviorPanel({ visualId, onTry }: { visualId: string; onTry: (scenarioId: string) => void }) {
  const [scope, setScope] = useState<"asset" | "all">("all");
  const [results, setResults] = useState<Record<string, RuleResult>>({});
  const rules = BEHAVIOR_RULES.filter((r) => scope === "all" || r.scenarioId.startsWith(`${visualId}:`));
  useEffect(() => {
    let cancelled = false;
    const queue = rules.filter((r) => !results[r.id]);
    const run = (i: number) => {
      if (cancelled || i >= queue.length) return;
      const r = queue[i];
      let res: RuleResult;
      try {
        res = r.verify();
      } catch (e) {
        res = { pass: false, detail: `Threw: ${(e as Error).message}` };
      }
      setResults((p) => ({ ...p, [r.id]: res }));
      window.setTimeout(() => run(i + 1), 0);
    };
    run(0);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, visualId]);
  const areas = [...new Set(rules.map((r) => r.area))];
  const passed = rules.filter((r) => results[r.id]?.pass).length;
  return (
    <div className="lab-panel" aria-label="Behavior">
      <div className="lab-panel__bar">
        <div className="lab-seg" role="radiogroup" aria-label="Rule scope">
          {(
            [
              ["all", `All rules (${BEHAVIOR_RULES.length})`],
              ["asset", `${chartAsset(visualId).label}`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={scope === id} className={"lab-seg__btn" + (scope === id ? " is-active" : "")} onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="lab-hint" aria-live="polite">
          {passed} of {rules.length} executable checks pass in this browser
        </span>
      </div>
      {rules.length === 0 && <p className="lab-empty">No asset-specific rules for this asset yet; shared rules apply. Switch to All rules.</p>}
      {areas.map((area) => (
        <section key={area} className="lab-section">
          <h3 className="lab-section__title">{area}</h3>
          <ul className="lab-rules">
            {rules
              .filter((r) => r.area === area)
              .map((r) => (
                <RuleRow key={r.id} rule={r} result={results[r.id]} onTry={onTry} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RuleRow({ rule, result, onTry }: { rule: BehaviorRule; result?: RuleResult; onTry: (id: string) => void }) {
  const sc = scenarioById(rule.scenarioId);
  return (
    <li className="lab-rule" data-rule={rule.id}>
      <dl>
        <div>
          <dt>When</dt>
          <dd>{rule.when}</dd>
        </div>
        <div>
          <dt>Expected behavior</dt>
          <dd>{rule.expected}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{rule.reason}</dd>
        </div>
      </dl>
      <div className="lab-rule__foot">
        <span className={"lab-check" + (result ? (result.pass ? " is-pass" : " is-fail") : "")} title={result?.detail}>
          {result ? (result.pass ? "✓ Check passes" : "✕ Check fails") : "Running…"}
          {result && <span className="lab-check__detail">{result.detail}</span>}
        </span>
        <button type="button" className="lab-btn" onClick={() => onTry(rule.scenarioId)} disabled={!sc}>
          Try it{sc ? `: ${sc.name}` : ""}
        </button>
      </div>
    </li>
  );
}

/* ---------------- Data ---------------- */

export function DataPanel({
  scenario,
  dataset,
  model,
  config: cfg,
  onDataset,
}: {
  scenario: Scenario;
  dataset: ChartDataset;
  model: ChartModel;
  config: Record<string, unknown>;
  onDataset: (ds: ChartDataset | null) => void;
}) {
  const custom = !!scenario.dataset;
  const [text, setText] = useState(() => datasetToCsv(dataset));
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const lastSource = useRef(dataset);
  useEffect(() => {
    if (lastSource.current !== dataset && !error) setText(datasetToCsv(dataset));
    lastSource.current = dataset;
  }, [dataset, error]);
  const fields = fieldsForVisual(scenario.visualId).filter((o) => o.type === "field" || (o.type === "multi" && o.group === "Mapping" && /column/i.test(o.name)));
  const PAGE = 50;
  const pages = Math.max(1, Math.ceil(dataset.rows.length / PAGE));
  const apply = () => {
    const r = parseDatasetText(text);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setNotes(r.notes);
    onDataset(r.dataset);
  };
  return (
    <div className="lab-panel lab-panel--data" aria-label="Data">
      <section className="lab-section">
        <h3 className="lab-section__title">Field mapping</h3>
        <table className="lab-table">
          <thead>
            <tr>
              <th scope="col">Setting</th>
              <th scope="col">Column</th>
              <th scope="col">Type</th>
              <th scope="col">Check</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((o) => {
              const key = `${o.group}::${o.name}`;
              const v = cfg[key];
              const cols = Array.isArray(v) ? (v as string[]) : v ? [String(v)] : [];
              return (
                <tr key={key}>
                  <th scope="row">
                    {o.name}
                    {o.level === "required" && <span className="lab-req"> required</span>}
                    <div className="lab-hint">{o.group}</div>
                  </th>
                  <td>{cols.length ? cols.join(", ") : <span className="lab-hint">Unmapped</span>}</td>
                  <td>{cols.map((c) => dataset.columns.find((x) => x.name === c)?.type ?? "missing").join(", ")}</td>
                  <td>
                    {cols.length === 0
                      ? o.level === "required"
                        ? "⚠ Required"
                        : "—"
                      : cols.every((c) => {
                            const col = dataset.columns.find((x) => x.name === c);
                            return col && (o.type === "multi" || isColumnCompatible(o.name, col.type));
                          })
                        ? "✓"
                        : "✕ Not in data or incompatible type"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="lab-section">
        <h3 className="lab-section__title">Validation</h3>
        {model.issues.length === 0 ? (
          <p className="lab-hint">No data issues. State: {model.state}.</p>
        ) : (
          <ul className="lab-issues">
            {model.issues.map((i) => (
              <li key={i.id} data-severity={i.severity}>
                <b>{i.severity}</b> {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="lab-section">
        <h3 className="lab-section__title">
          Raw input <span className="lab-pill">{dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns</span>
          {custom && <span className="lab-pill lab-pill--brand">Edited data</span>}
        </h3>
        <div className="lab-scroll-x">
          <table className="lab-table lab-table--data">
            <thead>
              <tr>
                <th scope="col">#</th>
                {dataset.columns.map((c) => (
                  <th key={c.name} scope="col">
                    {c.label}
                    <div className="lab-hint">
                      {c.name} · {c.type}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.rows.slice(page * PAGE, page * PAGE + PAGE).map((r, i) => (
                <tr key={i}>
                  <td className="lab-hint">{page * PAGE + i + 1}</td>
                  {dataset.columns.map((c) => {
                    const v = r[c.name];
                    return <td key={c.name}>{v === null || v === undefined ? <span className="lab-null">null</span> : String(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="lab-pager">
            <button type="button" className="lab-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Rows {page * PAGE + 1}–{Math.min(dataset.rows.length, (page + 1) * PAGE)} of {dataset.rows.length.toLocaleString()}
            </span>
            <button type="button" className="lab-btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </section>
      <section className="lab-section">
        <h3 className="lab-section__title">Derived data (what the chart draws)</h3>
        <div className="lab-derived">
          <DataTableView table={model.table} />
        </div>
      </section>
      <section className="lab-section">
        <h3 className="lab-section__title">Edit fixture input</h3>
        <p className="lab-hint">CSV with a header row, a JSON array of rows, or {"{ columns, rows }"}. Invalid input is never replaced with mock values.</p>
        <textarea className="lab-input lab-textarea" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Fixture data" rows={10} />
        {error && (
          <p className="lab-error" role="alert">
            {error} The chart still shows the last valid result.
          </p>
        )}
        {notes.length > 0 && (
          <ul className="lab-issues">
            {notes.map((n) => (
              <li key={n} data-severity="info">
                {n}
              </li>
            ))}
          </ul>
        )}
        <div className="lab-card__actions">
          <button type="button" className="lab-btn lab-btn--primary" onClick={apply}>
            Apply data
          </button>
          {custom && (
            <button
              type="button"
              className="lab-btn"
              onClick={() => {
                setError(null);
                onDataset(null);
              }}
            >
              Restore generated fixture
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Coverage ---------------- */

const STATUS_ORDER: CoverageStatus[] = ["implemented-verified", "implemented-unverified", "missing", "invalid-combination", "not-applicable"];
const STATUS_LABEL: Record<CoverageStatus, string> = {
  "implemented-verified": "Implemented & verified",
  "implemented-unverified": "Implemented, unverified",
  missing: "Missing",
  "invalid-combination": "Invalid combination",
  "not-applicable": "Not applicable",
};

export function CoveragePanel({ visualId, entries }: { visualId: string; entries: CoverageEntry[] | null }) {
  const [status, setStatus] = useState<CoverageStatus | "">("");
  const [q, setQ] = useState("");
  const [all, setAll] = useState<Record<string, Record<CoverageStatus, number>> | null>(null);
  const shown = useMemo(() => (entries ?? []).filter((e) => (!status || e.status === status) && (!q || `${e.key} ${e.nested ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [entries, status, q]);
  const sum = entries ? summarize(entries) : null;
  const computeAll = () => {
    const out: Record<string, Record<CoverageStatus, number>> = {};
    const step = (i: number) => {
      if (i >= CHART_ASSETS.length) return setAll({ ...out });
      out[CHART_ASSETS[i].visualId] = summarize(coverageForAsset(CHART_ASSETS[i].visualId));
      setAll({ ...out });
      window.setTimeout(() => step(i + 1), 0);
    };
    step(0);
  };
  return (
    <div className="lab-panel" aria-label="Coverage">
      <p className="lab-hint">
        Generated from the live catalog (<code>fieldsForVisual</code>) and probed against the real derivation: a field is <b>verified</b> when changing it (with its prerequisites satisfied) changes the chart model or an executable behavior rule covers it. This is binding evidence, not visual sign-off. The full report is in <code>docs/chart-system/coverage.md</code>.
      </p>
      {sum && (
        <div className="lab-summary" role="group" aria-label="Status filter">
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" className={`lab-summary__item lab-status--${s}` + (status === s ? " is-active" : "")} aria-pressed={status === s} onClick={() => setStatus(status === s ? "" : s)}>
              <b>{sum[s]}</b> {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      <div className="lab-panel__bar">
        <input className="lab-input" type="search" placeholder="Filter by key" aria-label="Filter coverage by key" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="lab-hint">
          {shown.length} of {entries?.length ?? 0} entries for {chartAsset(visualId).label}
        </span>
      </div>
      {!entries ? (
        <p className="lab-empty">Computing coverage…</p>
      ) : (
        <div className="lab-scroll-x">
          <table className="lab-table lab-table--coverage">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Control</th>
                <th scope="col">Default</th>
                <th scope="col">Units</th>
                <th scope="col">Depends on</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence / note</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <th scope="row">
                    <code>{e.key}</code>
                    {e.nested && <div className="lab-hint">↳ {e.nested}</div>}
                    <div className="lab-hint">
                      {e.level}
                      {e.values.length ? ` · ${e.values.slice(0, 6).join(" / ")}${e.values.length > 6 ? " …" : ""}` : ""}
                    </div>
                  </th>
                  <td>{e.control}</td>
                  <td>
                    <code className="lab-code-sm">{fmtDefault(e.resolvedDefault)}</code>
                  </td>
                  <td>{e.units ?? "—"}</td>
                  <td>{e.dependencies.length ? e.dependencies.map((d) => <div key={d}>{d}</div>) : "—"}</td>
                  <td>
                    <span className={`lab-status lab-status--${e.status}`}>{STATUS_LABEL[e.status]}</span>
                  </td>
                  <td className="lab-evidence">
                    {e.note && <div>{e.note}</div>}
                    {e.evidence.slice(0, 2).map((x) => (
                      <div key={x} className="lab-hint">
                        {x}
                      </div>
                    ))}
                    {e.scenarios.length > 0 && <div className="lab-hint">Scenarios: {e.scenarios.join(", ")}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="lab-section">
        <h3 className="lab-section__title">All assets</h3>
        {!all ? (
          <button type="button" className="lab-btn" onClick={computeAll}>
            Compute coverage for all 17 assets
          </button>
        ) : (
          <div className="lab-scroll-x">
            <table className="lab-table">
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  {STATUS_ORDER.map((s) => (
                    <th key={s} scope="col">
                      {STATUS_LABEL[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHART_ASSETS.map((a) => (
                  <tr key={a.visualId}>
                    <th scope="row">{a.label}</th>
                    {STATUS_ORDER.map((s) => (
                      <td key={s}>{all[a.visualId]?.[s] ?? "…"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="lab-section">
        <h3 className="lab-section__title">Lab controls (not asset properties)</h3>
        <ul className="lab-list">
          {LAB_CONTROLS.map((c) => (
            <li key={c.id}>
              <b>{c.name}</b> — {c.values}. {c.purpose}
            </li>
          ))}
        </ul>
        <h3 className="lab-section__title">Product extensions (explicitly not in the catalog)</h3>
        <ul className="lab-list">
          {EXTENSIONS.map((c) => (
            <li key={c.id}>
              <b>{c.name}</b> <code>{c.id}</code> — default {String(c.default)}; {c.compatibility}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function fmtDefault(v: unknown): string {
  if (v === undefined) return "—";
  if (typeof v === "string") return v === "" ? '""' : v;
  const s = JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}
