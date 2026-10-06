import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { LlumenChart, type ChartReport } from "../charts/LlumenChart";
import type { ChartInput } from "../charts/build";
import { SIZE_LIMITS, type LabEnv } from "./labState";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

type FrameProps = {
  width: number;
  height: number;
  input: ChartInput;
  env: LabEnv;
  dataView: boolean;
  onResize?: (w: number, h: number) => void;
  onReport?: (r: ChartReport) => void;
  label: string;
  testId?: string;
};

/**
 * One live chart card at an exact CSS size. Zoom simulates browser zoom: the
 * card keeps its physical size while the chart sees width/zoom CSS pixels.
 */
export function PreviewFrame({ width, height, input, env, dataView, onResize, onReport, label, testId }: FrameProps) {
  const start = useRef<{ x: number; y: number; w: number; h: number; axis: "x" | "y" | "xy" } | null>(null);
  const [dragging, setDragging] = useState(false);

  const down = (axis: "x" | "y" | "xy") => (e: ReactPointerEvent<HTMLElement>) => {
    if (!onResize) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, w: width, h: height, axis };
    setDragging(true);
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || !onResize) return;
    const w = s.axis === "y" ? s.w : clamp(s.w + (e.clientX - s.x) * (env.dir === "rtl" ? -1 : 1), SIZE_LIMITS.width[0], SIZE_LIMITS.width[1]);
    const h = s.axis === "x" ? s.h : clamp(s.h + (e.clientY - s.y), SIZE_LIMITS.height[0], SIZE_LIMITS.height[1]);
    onResize(w, h);
  };
  const up = () => {
    start.current = null;
    setDragging(false);
  };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (!onResize) return;
    const step = e.shiftKey ? 40 : 8;
    const map: Record<string, [number, number]> = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowUp: [0, -step] };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    onResize(clamp(width + d[0], SIZE_LIMITS.width[0], SIZE_LIMITS.width[1]), clamp(height + d[1], SIZE_LIMITS.height[0], SIZE_LIMITS.height[1]));
  };

  const z = env.zoom || 1;
  const inner: CSSProperties = z === 1 ? { width, height } : { width: width / z, height: height / z, zoom: z };

  return (
    <div className={"lab-frame" + (dragging ? " is-dragging" : "")} style={{ width, height }} data-testid={testId} aria-label={label} role="group">
      <div className="lab-frame__inner" dir={env.dir} style={inner}>
        <LlumenChart {...input} onReport={onReport} initialDataView={dataView} />
      </div>
      {onResize && (
        <>
          <span className="lab-frame__edge lab-frame__edge--x" onPointerDown={down("x")} onPointerMove={move} onPointerUp={up} aria-hidden="true" />
          <span className="lab-frame__edge lab-frame__edge--y" onPointerDown={down("y")} onPointerMove={move} onPointerUp={up} aria-hidden="true" />
          <span
            className="lab-frame__corner"
            role="slider"
            tabIndex={0}
            aria-label={`Resize card, ${width} by ${height} pixels. Arrow keys resize by 8, Shift+Arrow by 40.`}
            aria-valuenow={width}
            aria-valuemin={SIZE_LIMITS.width[0]}
            aria-valuemax={SIZE_LIMITS.width[1]}
            aria-valuetext={`${width} × ${height} px`}
            onPointerDown={down("xy")}
            onPointerMove={move}
            onPointerUp={up}
            onKeyDown={key}
          />
        </>
      )}
    </div>
  );
}

export function Readout({ report, zoom }: { report: ChartReport | null; zoom: number }) {
  if (!report) return <div className="lab-readout" aria-live="off">Measuring…</div>;
  const adaptations = report.adaptations;
  return (
    <div className="lab-readout" data-testid="lab-readout">
      <dl className="lab-readout__grid">
        <div>
          <dt>Container</dt>
          <dd data-testid="readout-container">
            {Math.round(report.container.width)} × {Math.round(report.container.height)} px{zoom !== 1 ? ` (CSS, at ${Math.round(zoom * 100)}% zoom)` : ""}
          </dd>
        </div>
        <div>
          <dt>Plot</dt>
          <dd data-testid="readout-plot">{report.compactSummary ? "Compact summary" : `${Math.round(report.plot.width)} × ${Math.round(report.plot.height)} px`}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd data-testid="readout-mode">{report.mode}</dd>
        </div>
        <div>
          <dt>Series</dt>
          <dd data-testid="readout-series">
            {report.visibleSeries} / {report.totalSeries} visible
          </dd>
        </div>
        <div>
          <dt>Legend</dt>
          <dd data-testid="readout-legend">
            {report.legend.visible ? `${report.legend.position}, ${report.legend.visibleRows}/${report.legend.rows} rows` : report.legend.collapsed ? "collapsed to button" : "off"}
          </dd>
        </div>
        <div>
          <dt>State</dt>
          <dd data-testid="readout-state">{report.state}</dd>
        </div>
      </dl>
      {adaptations.length > 0 ? (
        <details className="lab-readout__adapt">
          <summary>
            {adaptations.length} applied adaptation{adaptations.length === 1 ? "" : "s"}
          </summary>
          <ul>
            {adaptations.map((a, i) => (
              <li key={a.id + i} data-adaptation={a.id}>
                {a.setting && a.requested !== undefined && (
                  <span className="lab-readout__req">
                    {a.setting.split("::").pop()}: requested <b>{a.requested}</b> → effective <b>{a.effective}</b>.{" "}
                  </span>
                )}
                {a.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="lab-readout__none">No adaptations: every requested setting is applied as saved.</p>
      )}
    </div>
  );
}

export function useReport() {
  const [report, setReport] = useState<ChartReport | null>(null);
  const onReport = useCallback((r: ChartReport) => setReport(r), []);
  return [report, onReport] as const;
}
