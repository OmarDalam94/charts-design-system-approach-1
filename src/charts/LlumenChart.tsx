import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./charts.css";
import { buildChartModelCached, type ChartInput } from "./build";
import { planFrame } from "./frame";
import type { LayoutPlan, SizeMode } from "./layout";
import type { ChartModel, DataState, Issue } from "./model";
import type { Adaptation, ConflictNote } from "./settings";
import { textMetricsVersion } from "./textMeasure";
import { ChartHeader } from "./primitives/ChartHeader";
import { ChartState, CompactSummary, stateReplacesPlot } from "./primitives/ChartStatus";
import { DataTableView } from "./primitives/DataTableView";
import { Legend } from "./primitives/Legend";
import { ChartTooltip, type TooltipAnchor, type TooltipContent } from "./primitives/Tooltip";
import { useElementSize, useFontsVersion, useMeasure, useReport, useStableId } from "./primitives/hooks";
import { FamilyPlot, legendInteractive } from "./families";
import type { PlotInteraction } from "./families/shared";

export type ChartReport = {
  visualId: string;
  container: { width: number; height: number };
  plot: { width: number; height: number };
  mode: SizeMode;
  state: DataState;
  legend: { visible: boolean; position: string; rows: number; visibleRows: number; collapsed: boolean };
  compactSummary: boolean;
  visibleSeries: number;
  totalSeries: number;
  adaptations: Adaptation[];
  issues: Issue[];
  conflicts: ConflictNote[];
  dataView: boolean;
};

export type LlumenChartProps = ChartInput & {
  onReport?: (r: ChartReport) => void;
  /** Builder preview disables the data view toggle when space is tight. */
  showActions?: boolean;
  /** Starts with the data view open (Lab “View data”). */
  initialDataView?: boolean;
  className?: string;
};

type TipState = { content: TooltipContent; anchor: TooltipAnchor; pinned: boolean } | null;

const TableIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M2 6.5h12M2 10h12M6 6.5V13" />
  </svg>
);
const NotesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2V11M8 5v.2" strokeLinecap="round" />
  </svg>
);

function NotesPanel({ model, plan, family, onClose, id }: { model: ChartModel; plan: LayoutPlan; family: Adaptation[]; onClose: () => void; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const adaptations = [...model.adaptations, ...plan.adaptations, ...family];
  return (
    <div className="lc-notes" role="dialog" aria-label="About this chart" id={id} ref={ref} tabIndex={-1}>
      <div className="lc-notes__head">
        <strong>About this chart</strong>
        <button type="button" className="lc-chart__iconbtn" onClick={onClose} aria-label="Close notes">
          ×
        </button>
      </div>
      {model.header.description && <p>{model.header.description}</p>}
      {model.header.info && <p>{model.header.info}</p>}
      <p className="lc-notes__summary">{model.summary}</p>
      {model.issues.length > 0 && (
        <>
          <h4>Data notes</h4>
          <ul>
            {model.issues.map((i) => (
              <li key={i.id} data-severity={i.severity}>
                <span className="lc-sr">{i.severity}: </span>
                {i.message}
              </li>
            ))}
          </ul>
        </>
      )}
      {adaptations.length > 0 && (
        <>
          <h4>Adapted to fit</h4>
          <ul>
            {adaptations.map((a, k) => (
              <li key={a.id + k}>
                {a.reason}
                {a.setting && a.requested !== undefined && (
                  <span className="lc-notes__meta">
                    {" "}
                    {a.setting.split("::").pop()}: {a.requested} → {a.effective}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {model.conflicts.length > 0 && (
        <>
          <h4>Setting conflicts</h4>
          <ul>
            {model.conflicts.map((c, k) => (
              <li key={k}>{c.resolution}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The one chart implementation shared by the Chart Lab and the Asset
 * Builder. Interaction state (hidden series, tooltip, data view) is view
 * state and never written back to settings.
 */
export function LlumenChart(props: LlumenChartProps) {
  const { onReport, showActions = true, initialDataView = false, className, ...input } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(hostRef);
  const [plotRef, plotSize] = useMeasure<HTMLDivElement>();
  const fonts = useFontsVersion();
  const tipId = useStableId("lc-tip");
  const notesId = useStableId("lc-notes");

  const model = buildChartModelCached(input);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [dataView, setDataView] = useState(initialDataView);
  const [notesOpen, setNotesOpen] = useState(false);
  const [tip, setTip] = useState<TipState>(null);
  const [announcement, setAnnouncement] = useState("");
  const familyNotes = useRef<Adaptation[]>([]);
  const [familyAdaptations, setFamilyAdaptations] = useState<Adaptation[]>([]);

  useEffect(() => setDataView(initialDataView), [initialDataView]);

  // Keep hidden ids that still exist after data/settings change.
  const itemIds = model.legend.items.map((i) => i.id).join("\u0000");
  useEffect(() => {
    setHidden((prev) => {
      if (!prev.size) return prev;
      const ids = new Set(itemIds.split("\u0000"));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [itemIds]);

  const plan = useMemo(
    () => planFrame(model, size.width, size.height, legendExpanded),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size.width, size.height, model, legendExpanded, fonts, textMetricsVersion()],
  );

  const hideTip = useCallback(() => setTip(null), []);
  const showTip = useCallback<PlotInteraction["show"]>((content, anchor, opts) => setTip({ content, anchor, pinned: !!opts?.pin }), []);
  const announceTimer = useRef<number>();
  const announce = useCallback((text: string) => {
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => setAnnouncement(text), 120);
  }, []);
  const pinned = !!tip?.pinned;
  const ix = useMemo<PlotInteraction>(
    () => ({ hidden, show: showTip, hide: hideTip, pinned, clickOnly: model.tooltip.onClick, tooltipsEnabled: model.tooltip.enabled, announce, tooltipId: tipId }),
    [hidden, showTip, hideTip, pinned, model.tooltip.onClick, model.tooltip.enabled, announce, tipId],
  );
  const reportFamily = useCallback((a: Adaptation[]) => {
    familyNotes.current = a;
  }, []);

  // Close a pinned tooltip on outside press.
  useEffect(() => {
    if (!tip?.pinned) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(".lc-tooltip") || hostRef.current?.contains(t)) return;
      setTip(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [tip?.pinned]);

  // Collect adaptations reported by the family renderer during render.
  useEffect(() => {
    const next = familyNotes.current;
    setFamilyAdaptations((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });

  const legendMode = legendInteractive(model);
  const totalSeries = model.legend.items.length || 1;
  const visibleSeries = model.legend.items.length ? model.legend.items.filter((i) => !hidden.has(i.id)).length : 1;
  const allHidden = model.legend.items.length > 0 && visibleSeries === 0;

  useReport<ChartReport>(
    {
      visualId: model.visualId,
      container: { width: size.width, height: size.height },
      plot: { width: plotSize.width, height: plotSize.height },
      mode: plan.mode,
      state: model.state,
      legend: { visible: plan.legend.visible, position: plan.legend.position, rows: plan.legend.rows, visibleRows: plan.legend.visibleRows, collapsed: plan.legend.collapsed },
      compactSummary: plan.compactSummary,
      visibleSeries,
      totalSeries,
      adaptations: [...model.adaptations, ...plan.adaptations, ...familyAdaptations],
      issues: model.issues,
      conflicts: model.conflicts,
      dataView,
    },
    onReport,
  );

  const noteCount = model.issues.filter((i) => i.severity !== "info").length;
  const actions = showActions ? (
    <>
      <button type="button" className="lc-chart__iconbtn" aria-pressed={dataView} onClick={() => setDataView((v) => !v)} title={dataView ? "Show chart" : "View data"} aria-label={dataView ? "Show chart" : "View data as table"}>
        <TableIcon />
      </button>
      <button type="button" className="lc-chart__iconbtn" aria-expanded={notesOpen} aria-controls={notesOpen ? notesId : undefined} onClick={() => setNotesOpen((v) => !v)} title="About this chart" aria-label={`About this chart${noteCount ? `, ${noteCount} data note${noteCount === 1 ? "" : "s"}` : ""}`}>
        <NotesIcon />
        {noteCount > 0 && <span className="lc-chart__count">{noteCount}</span>}
      </button>
    </>
  ) : null;

  const legendNode =
    plan.legend.visible && !dataView ? (
      <Legend
        model={model.legend}
        plan={plan.legend}
        interactive={legendMode.interactive}
        hidden={hidden}
        expanded={legendExpanded}
        onExpand={setLegendExpanded}
        onToggle={(id) =>
          setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            const item = model.legend.items.find((i) => i.id === id);
            setAnnouncement(`${item?.label ?? id} ${next.has(id) ? "hidden" : "shown"}. ${model.legend.items.length - next.size} of ${model.legend.items.length} visible.`);
            return next;
          })
        }
        onOnly={(id) => {
          setHidden(new Set(model.legend.items.filter((i) => i.id !== id).map((i) => i.id)));
          setAnnouncement(`Only ${model.legend.items.find((i) => i.id === id)?.label ?? id} shown.`);
        }}
        onShowAll={() => {
          setHidden(new Set());
          setAnnouncement("All series shown.");
        }}
      />
    ) : plan.legend.collapsed && !dataView ? (
      <div className="lc-legend">
        <button type="button" className="lc-linkbtn" onClick={() => setLegendExpanded(true)} aria-label={`Show legend, ${model.legend.items.length} items`}>
          Legend ({model.legend.items.length})
        </button>
      </div>
    ) : null;

  let body: JSX.Element;
  if (dataView) {
    body = <DataTableView table={model.table} />;
  } else if (stateReplacesPlot(model.state)) {
    body = <ChartState model={model} onViewData={() => setDataView(true)} />;
  } else if (plan.compactSummary) {
    body = <CompactSummary model={model} onViewData={() => setDataView(true)} />;
  } else if (allHidden) {
    body = (
      <div className="lc-state" role="status">
        <span className="lc-state__title">All series are hidden</span>
        <button type="button" className="lc-linkbtn" onClick={() => setHidden(new Set())}>
          Show all series
        </button>
      </div>
    );
  } else if (plotSize.ready) {
    body = (
      <FamilyPlot
        model={model}
        width={plotSize.width}
        height={plotSize.height}
        mode={plan.mode}
        ix={ix}
        report={reportFamily}
      />
    );
  } else body = <></>;
  if (body.type !== FamilyPlot) familyNotes.current = [];

  const side = plan.legend.visible && (plan.legend.position === "left" || plan.legend.position === "right");
  const legendFirst = plan.legend.position === "top" || plan.legend.position === "left";
  const warning = model.issues.find((i) => i.id.startsWith("host:"));

  return (
    <div ref={hostRef} className={"lc-host" + (className ? ` ${className}` : "")} data-visual={model.visualId}>
      {size.ready && (
        <section
          className={"lc-chart" + (model.cardOutline ? "" : " lc-chart--nooutline")}
          data-mode={plan.mode}
          data-state={model.state}
          aria-label={model.header.title}
          style={{ padding: plan.pad }}
        >
          <ChartHeader header={model.header} plan={plan} actions={actions} />
          <div className={"lc-chart__body" + (side ? "" : " lc-chart__body--column")}>
            {legendFirst && legendNode}
            <div className="lc-chart__plot" ref={plotRef} data-testid="lc-plot">
              {body}
              {warning && !dataView && <p className="lc-notice">{warning.message}</p>}
            </div>
            {!legendFirst && legendNode}
          </div>
          {plan.insight.visible && model.insight && !dataView && (
            <p className="lc-chart__insight" style={{ WebkitLineClamp: plan.insight.lines }} title={model.insight}>
              {model.insight}
            </p>
          )}
          {notesOpen && <NotesPanel model={model} plan={plan} family={familyAdaptations} onClose={() => setNotesOpen(false)} id={notesId} />}
          <div className="lc-sr" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>
        </section>
      )}
      {tip && <ChartTooltip content={tip.content} anchor={tip.anchor} pinned={tip.pinned} id={tipId} onClose={hideTip} />}
    </div>
  );
}
