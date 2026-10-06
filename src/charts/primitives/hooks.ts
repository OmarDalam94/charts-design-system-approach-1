import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { invalidateTextMetrics } from "../textMeasure";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type ElementSize = { width: number; height: number; ready: boolean };

/**
 * Measures an element with ResizeObserver. Zero-size containers (hidden
 * tabs, collapsed panels) report `ready: false` until they get a size.
 */
export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0, ready: false });
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (w: number, h: number) => {
      const width = Math.floor(w);
      const height = Math.floor(h);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height, ready: width > 0 && height > 0 }));
    };
    const rect = el.getBoundingClientRect();
    update(rect.width, rect.height);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) update(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Callback-ref variant for elements that mount after the first render. */
export function useMeasure<T extends HTMLElement>(): [(el: T | null) => void, ElementSize, T | null] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0, ready: false });
  useIsoLayoutEffect(() => {
    if (!el) {
      setSize((p) => (p.ready ? { width: 0, height: 0, ready: false } : p));
      return;
    }
    const update = (w: number, h: number) => {
      const width = Math.floor(w);
      const height = Math.floor(h);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height, ready: width > 0 && height > 0 }));
    };
    const rect = el.getBoundingClientRect();
    update(rect.width, rect.height);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) update(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size, el];
}

/** Re-renders once web fonts finish loading so text measurements are redone. */
export function useFontsVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    let alive = true;
    const bump = () => {
      if (!alive) return;
      invalidateTextMetrics();
      setV((x) => x + 1);
    };
    fonts.ready.then(bump).catch(() => undefined);
    fonts.addEventListener?.("loadingdone", bump);
    return () => {
      alive = false;
      fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);
  return v;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

let idCounter = 0;
export function useStableId(prefix: string): string {
  const ref = useRef<string>();
  if (!ref.current) ref.current = `${prefix}-${++idCounter}`;
  return ref.current;
}

/** Calls `onChange` when the JSON form of `value` changes. */
export function useReport<T>(value: T, onChange: ((v: T) => void) | undefined) {
  const last = useRef<string>("");
  useEffect(() => {
    if (!onChange) return;
    const key = JSON.stringify(value);
    if (key === last.current) return;
    last.current = key;
    onChange(value);
  });
}
