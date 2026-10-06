import type { ChartModel, DataState } from "../model";

const TITLES: Record<Exclude<DataState, "ready">, string> = {
  loading: "Loading",
  error: "Data could not be loaded",
  "missing-mapping": "Map the required fields",
  empty: "No data",
  "all-null": "No values",
  "all-zero": "All values are zero",
  "no-matches": "No matching data",
  invalid: "Data cannot be read",
};

/** States that replace the plot. "all-zero" still draws, so it is not here. */
export function stateReplacesPlot(state: DataState): boolean {
  return state !== "ready" && state !== "all-zero";
}

export function ChartState({ model, onViewData }: { model: ChartModel; onViewData?: () => void }) {
  const state = model.state as Exclude<DataState, "ready">;
  if (state === "loading")
    return (
      <div className="lc-state" role="status" aria-live="polite">
        <div className="lc-skeleton" aria-hidden="true" />
        <span className="lc-sr">{model.stateMessage ?? "Loading data"}</span>
      </div>
    );
  const issues = model.issues.filter((i) => i.severity === "error").slice(0, 3);
  return (
    <div className={"lc-state" + (state === "error" || state === "invalid" ? " lc-state--error" : "")} role={state === "error" ? "alert" : "status"}>
      <span className="lc-state__title">{TITLES[state] ?? "No data"}</span>
      {model.stateMessage && <span>{model.stateMessage}</span>}
      {!model.stateMessage && issues.map((i) => <span key={i.id}>{i.message}</span>)}
      {onViewData && model.table.rows.length > 0 && (
        <button type="button" className="lc-linkbtn" onClick={onViewData}>
          View data
        </button>
      )}
    </div>
  );
}

/** Shown when the plot would fall below its minimum readable size. */
export function CompactSummary({ model, onViewData }: { model: ChartModel; onViewData: () => void }) {
  const kpi = model.header.kpi;
  return (
    <div className="lc-summary" role="group" aria-label="Chart summary">
      {kpi && <span className="lc-summary__value">{kpi.text}</span>}
      <span>{model.summary}</span>
      <span className="lc-summary__actions">
        <button type="button" className="lc-linkbtn" onClick={onViewData}>
          View data
        </button>
      </span>
    </div>
  );
}
