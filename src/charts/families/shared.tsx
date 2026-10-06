import { forwardRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { SizeMode } from "../layout";
import type { Adaptation } from "../settings";
import type { TooltipAnchor, TooltipContent } from "../primitives/Tooltip";

export type PlotInteraction = {
  hidden: Set<string>;
  show: (content: TooltipContent, anchor: TooltipAnchor, opts?: { pin?: boolean }) => void;
  hide: () => void;
  pinned: boolean;
  /** Tooltips open on click only (Tooltips › Show on click). */
  clickOnly: boolean;
  tooltipsEnabled: boolean;
  announce: (text: string) => void;
  tooltipId: string;
};

export type PlotProps<M> = {
  model: M;
  width: number;
  height: number;
  mode: SizeMode;
  ix: PlotInteraction;
  report: (adaptations: Adaptation[]) => void;
};

export type NavAction = "next" | "prev" | "up" | "down" | "home" | "end" | "enter" | "escape";

const KEYMAP: Record<string, NavAction> = {
  ArrowRight: "next",
  ArrowLeft: "prev",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "home",
  End: "end",
  Enter: "enter",
  " ": "enter",
  Escape: "escape",
};

/**
 * The plot is one tab stop. Arrow keys move between data points inside it;
 * Enter pins details; Escape closes them.
 */
export const PlotSurface = forwardRef<
  HTMLDivElement,
  {
    label: string;
    children: ReactNode;
    onNav?: (a: NavAction) => void;
    onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerLeave?: () => void;
    onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
    onBlur?: () => void;
    onFocus?: () => void;
    describedBy?: string;
    scroll?: boolean;
    navigable?: boolean;
  }
>(function PlotSurface({ label, children, onNav, onPointerMove, onPointerLeave, onPointerDown, onBlur, onFocus, describedBy, scroll, navigable = true }, ref) {
  return (
    <div
      ref={ref}
      className={scroll ? "lc-plot-surface lc-plot-scroll" : "lc-plot-surface"}
      tabIndex={navigable ? 0 : -1}
      role="group"
      aria-roledescription="chart"
      aria-label={label}
      aria-describedby={describedBy}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        const a = KEYMAP[e.key];
        if (!a || !onNav) return;
        e.preventDefault();
        onNav(a);
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onBlur={onBlur}
      onFocus={onFocus}
    >
      {children}
    </div>
  );
});

export function anchorFromSvg(svg: SVGSVGElement | null, x: number, y: number, w = 0, h = 0): TooltipAnchor {
  const r = svg?.getBoundingClientRect();
  return { x: (r?.left ?? 0) + x, y: (r?.top ?? 0) + y, width: w, height: h };
}

export function applyTemplate(template: string | undefined, value: string, fields: Record<string, string | undefined>): string {
  if (!template) return value;
  return template.replace(/\{([^}]+)\}/g, (_, k: string) => (k.trim() === "value" ? value : fields[k.trim()] ?? ""));
}

export function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((i % n) + n) % n;
}
