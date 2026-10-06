import { useMemo, useState } from "react";
import type { Opt } from "../chartModel";
import { visibleWhenConditions } from "../chartModel";
import { FlagsSettings, GroupCard } from "../EditComponentModal";
import { FieldOptionsContext, type FieldOption } from "../fieldOptionsContext";
import { isColumnCompatible } from "../mockDataset";
import { keyOf, resolveFieldValue, type Config } from "../settingsDefaults";
import { FEATURE_TAB_MASTERS, fieldsForVisual, isFieldVisible, settingsNavSections } from "../visualSettingsCatalog";
import type { ChartDataset } from "../charts/data/values";
import type { CoverageEntry } from "../charts/coverage";

const TYPE_LABEL: Record<string, string> = { string: "String", number: "Number", boolean: "Boolean", datetime: "Date", geometry: "Location" };

/** Why the editor hides a field right now, or null when it is shown. */
export function unavailableReason(o: Opt, getValByKey: (g: string, n: string) => unknown): string | null {
  if (isFieldVisible(o, getValByKey)) return null;
  const master = FEATURE_TAB_MASTERS[o.group];
  if (master && master !== o.name) {
    const v = getValByKey(o.group, master);
    if (v === false || v === "false") return `Turn on “${master}” to use this setting.`;
  }
  const unmet = visibleWhenConditions(o.visibleWhen).filter((c) => {
    const cur = String(getValByKey(c.group, c.name) ?? "");
    const list = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
    return "is" in c ? !list(c.is).includes(cur) : list(c.isNot).includes(cur);
  });
  if (!unmet.length) return "Hidden by a catalog condition.";
  return unmet
    .map((c) => {
      const fmt = (v: string | string[]) => (Array.isArray(v) ? v : [v]).map((x) => (x === "" ? "set" : x === "true" ? "On" : x === "false" ? "Off" : `“${x}”`)).join(" or ");
      if ("is" in c) return `Requires ${c.name} to be ${fmt(c.is)}.`;
      const not = Array.isArray(c.isNot) ? c.isNot : [c.isNot];
      return not.length === 1 && not[0] === "" ? `Requires ${c.name} to be set.` : `Not available while ${c.name} is ${fmt(c.isNot)}.`;
    })
    .join(" ");
}

type Props = {
  visualId: string;
  config: Config;
  dataset: ChartDataset;
  advanced: boolean;
  onAdvanced: (v: boolean) => void;
  onChange: (key: string, value: unknown) => void;
  onResetField: (key: string) => void;
  explicitKeys: Set<string>;
  coverage: CoverageEntry[] | null;
};

export function Inspector({ visualId, config, dataset, advanced, onAdvanced, onChange, onResetField, explicitKeys, coverage }: Props) {
  const fields = useMemo(() => fieldsForVisual(visualId), [visualId]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ Mapping: true });

  const getVal = (o: Opt) => resolveFieldValue(o, config, visualId);
  const getValByKey = (g: string, n: string) => {
    const f = fields.find((o) => o.group === g && o.name === n);
    return f ? getVal(f) : "";
  };
  const setVal = (o: Opt, v: unknown) => onChange(keyOf(o), v);

  const fieldOptions = useMemo(
    () =>
      (fieldName: string): FieldOption[] =>
        dataset.columns.map((c) => {
          const ok = isColumnCompatible(fieldName, c.type);
          return { value: c.name, label: c.label, dataType: TYPE_LABEL[c.type] ?? c.type, disabled: !ok, disabledReason: ok ? undefined : "Incompatible" };
        }),
    [dataset],
  );

  const sections = settingsNavSections(visualId, getValByKey);
  const q = query.trim().toLowerCase();
  const gaps = new Map<string, CoverageEntry[]>();
  for (const e of coverage ?? []) {
    if (e.status === "missing" || e.status === "implemented-unverified" || e.status === "invalid-combination") {
      const list = gaps.get(e.key) ?? [];
      list.push(e);
      gaps.set(e.key, list);
    }
  }
  const advancedCount = fields.filter((o) => o.level === "advanced").length;

  return (
    <FieldOptionsContext.Provider value={fieldOptions}>
      <div className="lab-inspector" aria-label="Properties">
        <div className="lab-inspector__head">
          <h2 className="lab-panel-title">Properties</h2>
          <label className="lab-switch">
            <input type="checkbox" role="switch" checked={advanced} onChange={(e) => onAdvanced(e.target.checked)} />
            <span className="lab-switch__track" aria-hidden="true" />
            <span>Advanced ({advancedCount})</span>
          </label>
        </div>
        <input
          className="lab-input lab-inspector__search"
          type="search"
          placeholder="Search properties"
          aria-label="Search properties"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="lab-hint">Edits use the persisted <code>group::name</code> keys of the asset. Lab controls (size, fixture, theme) are separate and never saved to an asset.</p>
        {sections.map((section) => (
          <div key={section.id} className="lab-inspector__section">
            <h3 className="lab-inspector__section-title">{section.label}</h3>
            {section.tabs.map((tab) => {
              const all = fields.filter((o) => o.group === tab);
              const matches = (o: Opt) => !q || `${o.group} ${o.name} ${o.desc}`.toLowerCase().includes(q);
              const items = all.filter(matches);
              if (!items.length) return null;
              const hidden = items
                .filter((o) => o.level !== "advanced" || advanced)
                .map((o) => ({ o, reason: unavailableReason(o, getValByKey) }))
                .filter((x): x is { o: Opt; reason: string } => !!x.reason);
              const advHidden = !advanced ? items.filter((o) => o.level === "advanced").length : 0;
              const changed = items.filter((o) => explicitKeys.has(keyOf(o)));
              const groupGaps = items.flatMap((o) => gaps.get(keyOf(o)) ?? []);
              const isOpen = q ? true : open[tab] ?? false;
              return (
                <details
                  key={tab}
                  className="lab-group"
                  open={isOpen}
                  onToggle={(e) => {
                    const el = e.currentTarget;
                    if (!q) setOpen((p) => (p[tab] === el.open ? p : { ...p, [tab]: el.open }));
                  }}
                >
                  <summary className="lab-group__summary">
                    <span>{tab}</span>
                    <span className="lab-group__meta">
                      {changed.length > 0 && <span className="lab-pill lab-pill--brand">{changed.length} changed</span>}
                      {groupGaps.length > 0 && <span className="lab-pill lab-pill--warn" title="Coverage gaps in this group">{groupGaps.length} gap{groupGaps.length === 1 ? "" : "s"}</span>}
                      <span className="lab-group__count">{items.length}</span>
                    </span>
                  </summary>
                  {isOpen && (
                    <div className="lab-group__body">
                      {tab === "Flags" ? (
                        <FlagsSettings items={items} getVal={getVal} setVal={setVal} />
                      ) : (
                        <GroupCard items={items} advancedOpen={advanced} getVal={getVal} setVal={setVal} getValByKey={getValByKey} />
                      )}
                      {changed.length > 0 && (
                        <div className="lab-group__changed">
                          <span>Changed from default:</span>
                          {changed.map((o) => (
                            <button key={o.name} type="button" className="lab-chip" onClick={() => onResetField(keyOf(o))} title={`Reset ${o.name} to its resolved default`}>
                              {o.name} <span aria-hidden="true">↺</span>
                              <span className="lab-sr"> reset</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {(hidden.length > 0 || advHidden > 0) && (
                        <div className="lab-unavailable">
                          <p className="lab-unavailable__title">Not available right now</p>
                          <ul>
                            {hidden.map(({ o, reason }) => (
                              <li key={o.name}>
                                <strong>{o.name}</strong> — {reason}
                              </li>
                            ))}
                            {advHidden > 0 && (
                              <li>
                                <strong>{advHidden} advanced setting{advHidden === 1 ? "" : "s"}</strong> — turn on Advanced to show {advHidden === 1 ? "it" : "them"}.
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {groupGaps.length > 0 && (
                        <div className="lab-unavailable lab-unavailable--gap">
                          <p className="lab-unavailable__title">Coverage notes</p>
                          <ul>
                            {groupGaps.map((g) => (
                              <li key={g.id}>
                                <strong>
                                  {g.name}
                                  {g.nested ? ` · ${g.nested}` : ""}
                                </strong>{" "}
                                <span className={`lab-status lab-status--${g.status}`}>{g.status.replace(/-/g, " ")}</span> — {g.note ?? g.evidence[0] ?? ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        ))}
      </div>
    </FieldOptionsContext.Provider>
  );
}
