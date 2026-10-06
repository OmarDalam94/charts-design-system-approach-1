/**
 * Chart Lab view state. The working scenario holds persisted-format asset
 * settings plus Lab-only inputs (fixture, size, host status, environment);
 * nothing here is written back to an asset.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHART_ASSETS } from "../charts/assets";
import {
  baseScenario,
  decodeScenarioFromUrl,
  encodeScenarioForUrl,
  parseScenario,
  scenarioById,
  SCENARIO_VERSION,
  type Scenario,
} from "../charts/scenarios";
import { LAB_ROUTE } from "./route";

export { isLabHash, LAB_ROUTE } from "./route";

export type LabTab = "playground" | "scenarios" | "behavior" | "data" | "coverage";
export const LAB_TABS: { id: LabTab; label: string }[] = [
  { id: "playground", label: "Playground" },
  { id: "scenarios", label: "Scenarios" },
  { id: "behavior", label: "Behavior" },
  { id: "data", label: "Data" },
  { id: "coverage", label: "Coverage" },
];

export type LabEnv = {
  theme: "dark" | "light";
  dir: "ltr" | "rtl";
  reducedMotion: boolean;
  /** Simulated browser zoom (1 = 100%). The card keeps its physical size. */
  zoom: number;
};

export const DEFAULT_ENV: LabEnv = { theme: "dark", dir: "ltr", reducedMotion: false, zoom: 1 };

export const WIDTH_PRESETS = [240, 320, 375, 480, 640, 768, 1024, 1440];
export const HEIGHT_PRESETS = [160, 240, 320, 480, 640];
export const COMPARE_WIDTHS = [320, 640, 1024];
export const SIZE_LIMITS = { width: [120, 2400], height: [100, 1600] } as const;

function hashParams(hash: string): URLSearchParams {
  const q = hash.indexOf("?");
  return new URLSearchParams(q >= 0 ? hash.slice(q + 1) : "");
}

export type InitialLabState = { scenario: Scenario; origin: Scenario; tab: LabTab; notice: string | null };

export function readLabHash(hash: string): InitialLabState {
  const p = hashParams(hash);
  const tab = (LAB_TABS.find((t) => t.id === p.get("tab"))?.id ?? "playground") as LabTab;
  const s = p.get("s");
  if (s) {
    const r = decodeScenarioFromUrl(s);
    if (r.ok) {
      const origin = scenarioById(r.scenario.id) ?? r.scenario;
      return { scenario: r.scenario, origin, tab, notice: r.notes.join(" ") || null };
    }
    const fallback = baseScenario("line-chart");
    return { scenario: fallback, origin: fallback, tab, notice: `${r.error} Showing the Line Chart default instead.` };
  }
  const asset = p.get("asset");
  const visualId = CHART_ASSETS.some((a) => a.visualId === asset) ? (asset as string) : "line-chart";
  const sc = baseScenario(visualId);
  return { scenario: sc, origin: sc, tab, notice: null };
}

/* ---------------- device-only presets ---------------- */

const PRESET_KEY = "llumen.chartLab.presets.v1";

export type LabPreset = { savedAt: string; scenario: Scenario };

export function loadPresets(): LabPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((p) => {
      const r = parseScenario(p?.scenario);
      return r.ok ? [{ savedAt: String(p.savedAt ?? ""), scenario: r.scenario }] : [];
    });
  } catch {
    return [];
  }
}

function storePresets(list: LabPreset[]): string | null {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
    return null;
  } catch {
    return "This browser blocked local storage, so the preset was not saved.";
  }
}

/* ---------------- export / import ---------------- */

export function scenarioFileName(s: Scenario): string {
  return `llumen-chart-${s.visualId}-${s.id.split(":").pop()}.json`.replace(/[^a-z0-9.-]+/gi, "-");
}

export function serializeScenario(s: Scenario, env: LabEnv): string {
  return JSON.stringify({ ...s, version: SCENARIO_VERSION, env }, null, 2);
}

export function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ---------------- hook ---------------- */

export function useLabState() {
  const initial = useMemo(() => readLabHash(window.location.hash), []);
  const [scenario, setScenarioState] = useState<Scenario>(initial.scenario);
  const [origin, setOrigin] = useState<Scenario>(initial.origin);
  const [tab, setTab] = useState<LabTab>(initial.tab);
  const [env, setEnv] = useState<LabEnv>({ ...DEFAULT_ENV, ...(initial.scenario.env ?? {}) });
  const [compare, setCompare] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [notice, setNotice] = useState<string | null>(initial.notice);
  const [presets, setPresets] = useState<LabPreset[]>(() => loadPresets());
  const [urlStatus, setUrlStatus] = useState<{ ok: boolean; reason?: string }>({ ok: true });

  const modified = useMemo(() => JSON.stringify({ ...scenario, env: undefined }) !== JSON.stringify({ ...origin, env: undefined }), [scenario, origin]);

  const update = useCallback((patch: Partial<Scenario> | ((s: Scenario) => Scenario)) => {
    setScenarioState((s) => (typeof patch === "function" ? patch(s) : { ...s, ...patch }));
  }, []);

  const setConfigValue = useCallback((key: string, value: unknown) => {
    setScenarioState((s) => ({ ...s, config: { ...s.config, [key]: value } }));
  }, []);

  const load = useCallback((s: Scenario) => {
    setScenarioState(s);
    setOrigin(s);
    if (s.env) setEnv((e) => ({ ...e, ...s.env }));
    setNotice(null);
  }, []);

  const selectAsset = useCallback((visualId: string) => load(baseScenario(visualId)), [load]);
  const reset = useCallback(() => setScenarioState(origin), [origin]);

  // Sync the URL (replaceState: Lab edits are not navigation history).
  const syncTimer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      const enc = encodeScenarioForUrl({ ...scenario, env });
      const params = new URLSearchParams();
      if (tab !== "playground") params.set("tab", tab);
      if (enc.ok) params.set("s", enc.value);
      else params.set("asset", scenario.visualId);
      setUrlStatus(enc.ok ? { ok: true } : { ok: false, reason: enc.reason });
      const next = `${LAB_ROUTE}?${params.toString()}`;
      if (window.location.hash !== next) history.replaceState(null, "", next);
    }, 150);
    return () => window.clearTimeout(syncTimer.current);
  }, [scenario, env, tab]);

  const savePreset = useCallback(
    (name: string) => {
      const id = `preset:${Date.now()}`;
      const s: Scenario = { ...scenario, id, name: name || `${scenario.name} (modified)`, tags: [...new Set([...scenario.tags.filter((t) => t !== "default"), "local"])] };
      const next = [{ savedAt: new Date().toISOString(), scenario: s }, ...presets];
      const err = storePresets(next);
      if (err) return err;
      setPresets(next);
      setOrigin(s);
      setScenarioState(s);
      return null;
    },
    [scenario, presets],
  );

  const deletePreset = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.scenario.id !== id);
      storePresets(next);
      setPresets(next);
    },
    [presets],
  );

  const importText = useCallback(
    (text: string): string | null => {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return "The file is not valid JSON.";
      }
      const r = parseScenario(raw);
      if (!r.ok) return r.error;
      load(r.scenario);
      if (r.notes.length) setNotice(r.notes.join(" "));
      return null;
    },
    [load],
  );

  const shareUrl = useCallback(() => {
    const enc = encodeScenarioForUrl({ ...scenario, env });
    if (!enc.ok) return { ok: false as const, reason: enc.reason };
    const params = new URLSearchParams({ s: enc.value });
    return { ok: true as const, url: `${window.location.origin}${window.location.pathname}${LAB_ROUTE}?${params}` };
  }, [scenario, env]);

  return {
    scenario,
    origin,
    modified,
    update,
    setConfigValue,
    load,
    selectAsset,
    reset,
    tab,
    setTab,
    env,
    setEnv,
    compare,
    setCompare,
    advanced,
    setAdvanced,
    notice,
    setNotice,
    presets,
    savePreset,
    deletePreset,
    importText,
    shareUrl,
    urlStatus,
  };
}

export type LabStateApi = ReturnType<typeof useLabState>;
