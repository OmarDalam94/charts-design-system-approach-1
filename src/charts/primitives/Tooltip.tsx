import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markerPath, type MarkerShape } from "../identity";

export type TooltipRow = {
  id: string;
  label: string;
  value: string;
  color?: string;
  dash?: string;
  marker?: MarkerShape;
  active?: boolean;
};

export type TooltipContent = {
  title: string;
  rows: TooltipRow[];
  footer?: string[];
};

export type TooltipAnchor = { x: number; y: number; width?: number; height?: number };

export function Swatch({ color, dash, marker, size = 12 }: { color?: string; dash?: string; marker?: MarkerShape; size?: number }) {
  return (
    <svg className="lc-legend__swatch" width={size + 4} height={size} viewBox={`0 0 ${size + 4} ${size}`} aria-hidden="true">
      {dash !== undefined ? (
        <line x1={0} x2={size + 4} y1={size / 2} y2={size / 2} stroke={color} strokeWidth={2} strokeDasharray={dash || undefined} />
      ) : null}
      {marker ? (
        <path d={markerPath(marker, size * 0.28)} transform={`translate(${(size + 4) / 2},${size / 2})`} fill={color} />
      ) : dash === undefined ? (
        <rect x={2} y={1} width={size} height={size - 2} rx={2} fill={color} />
      ) : null}
    </svg>
  );
}

/**
 * Hover tooltips are role="tooltip" and never take focus. Pinned tooltips
 * are role="dialog" with a close button; Escape closes them and focus goes
 * back to the element that opened them (handled by the caller).
 */
export function ChartTooltip({
  content,
  anchor,
  pinned,
  id,
  onClose,
}: {
  content: TooltipContent;
  anchor: TooltipAnchor;
  pinned: boolean;
  id: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 12;
    const aw = anchor.width ?? 0;
    const ah = anchor.height ?? 0;
    const candidates = [
      { left: anchor.x + aw + gap, top: anchor.y + ah / 2 - h / 2 },
      { left: anchor.x - w - gap, top: anchor.y + ah / 2 - h / 2 },
      { left: anchor.x + aw / 2 - w / 2, top: anchor.y - h - gap },
      { left: anchor.x + aw / 2 - w / 2, top: anchor.y + ah + gap },
    ];
    const fits = (c: { left: number; top: number }) => c.left >= 8 && c.left + w <= vw - 8 && c.top >= 8 && c.top + h <= vh - 8;
    const horizontalFits = (c: { left: number }) => c.left >= 8 && c.left + w <= vw - 8;
    const pick = candidates.find(fits) ?? candidates.slice(0, 2).find(horizontalFits) ?? candidates[2];
    setPos({
      left: Math.max(8, Math.min(vw - w - 8, pick.left)),
      top: Math.max(8, Math.min(vh - h - 8, pick.top)),
    });
  }, [anchor.x, anchor.y, anchor.width, anchor.height, content]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      className={"lc-tooltip" + (pinned ? " lc-tooltip--pinned" : "")}
      role={pinned ? "dialog" : "tooltip"}
      aria-label={pinned ? content.title : undefined}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="lc-tooltip__title">
        <span>{content.title}</span>
        {pinned && (
          <button type="button" className="lc-chart__iconbtn lc-tooltip__close" aria-label="Close details" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
      </div>
      {content.rows.length > 0 && (
        <div className="lc-tooltip__rows">
          {content.rows.map((r) => (
            <div key={r.id} style={{ display: "contents" }} className={r.active ? "lc-tooltip__row--active" : undefined}>
              <Swatch color={r.color} dash={r.dash} marker={r.marker} size={10} />
              <span className="lc-tooltip__label" title={r.label}>
                {r.label}
              </span>
              <span className="lc-tooltip__value">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {content.footer?.map((f, i) => (
        <div className="lc-tooltip__foot" key={i}>
          {f}
        </div>
      ))}
    </div>,
    document.body,
  );
}
