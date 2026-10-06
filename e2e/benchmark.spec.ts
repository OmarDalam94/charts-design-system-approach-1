import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { expect, test } from "@playwright/test";
import { makeFixture, type FixtureVariant } from "../src/charts/fixtures";
import { openScenario } from "./helpers";

/**
 * Dense-data benchmark. Opt-in (BENCH=1) because timings depend on the machine.
 * All timings are taken inside the page with performance.now() and
 * requestAnimationFrame, so Playwright round-trips are not counted. "Settled"
 * means the plot's DOM stopped changing for two consecutive frames.
 */
test.skip(!process.env.BENCH, "Set BENCH=1 to run the dense-data benchmark.");
test.describe.configure({ mode: "serial" });

type Case = { id: string; visualId: string; variant: FixtureVariant; series?: number; width: number; height: number };
const CASES: Case[] = [
  { id: "line-50x720", visualId: "line-chart", variant: "dense", series: 50, width: 1024, height: 420 },
  { id: "line-5x720", visualId: "line-chart", variant: "dense", series: 5, width: 640, height: 360 },
  { id: "area-stacked-12x720", visualId: "area-chart", variant: "dense", series: 12, width: 1024, height: 420 },
  { id: "scatter-5000", visualId: "scatter-plot", variant: "dense", width: 1024, height: 480 },
  { id: "bar-60", visualId: "vertical-bar", variant: "dense", width: 1024, height: 420 },
  { id: "availability-2000", visualId: "availability", variant: "dense", width: 1024, height: 240 },
  { id: "table-400", visualId: "table", variant: "dense", width: 1024, height: 480 },
];

type Result = Case & { rows: number; svgNodes: number; firstRenderMs: number; resizeMsMedian: number; resizeMsP95: number; hoverMsMedian: number | null; hoverMsP95: number | null; adaptations: string[] };
const results: Result[] = [];

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
const r1 = (n: number) => Math.round(n * 10) / 10;

for (const c of CASES) {
  test(`benchmark ${c.id}`, async ({ page }) => {
    test.setTimeout(120_000);
    await openScenario(page, `${c.visualId}:default`);
    await page.getByTestId("lab-width").fill(String(c.width));
    await page.getByTestId("lab-width").press("Enter");
    await page.getByTestId("lab-height").fill(String(c.height));
    await page.getByTestId("lab-height").press("Enter");
    if (c.series) await page.getByTestId("lab-series").selectOption(String(c.series));
    await page.waitForTimeout(200);

    const firstRenderMs = await page.evaluate(async (variant) => {
      const frame = document.querySelector('[data-testid="lab-frame"]')!;
      const select = document.querySelector<HTMLSelectElement>('[data-testid="lab-fixture"]')!;
      const sig = () => `${frame.querySelectorAll("*").length}:${frame.querySelector(".lc-chart")?.getAttribute("data-mode")}`;
      const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
      const t0 = performance.now();
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, variant);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      let last = "";
      let stable = 0;
      let tEnd = t0;
      for (let i = 0; i < 600 && stable < 2; i++) {
        await raf();
        const s = sig();
        if (s === last) stable++;
        else {
          stable = 0;
          tEnd = performance.now();
        }
        last = s;
      }
      return tEnd - t0;
    }, c.variant);
    await expect(page.getByTestId("lab-fixture")).toHaveValue(c.variant);
    await expect(page.getByTestId("readout-state")).toBeVisible();

    const resize = await page.evaluate(async () => {
      const corner = document.querySelector<HTMLElement>('[data-testid="lab-frame"] .lab-frame__corner')!;
      const readout = document.querySelector('[data-testid="readout-container"]')!;
      const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
      const out: number[] = [];
      for (let i = 0; i < 16; i++) {
        const before = readout.textContent;
        const t0 = performance.now();
        corner.dispatchEvent(new KeyboardEvent("keydown", { key: i % 2 ? "ArrowLeft" : "ArrowRight", shiftKey: true, bubbles: true }));
        for (let f = 0; f < 120; f++) {
          await raf();
          if (readout.textContent !== before) break;
        }
        await raf();
        out.push(performance.now() - t0);
      }
      return out;
    });

    const hover = await page.evaluate(async () => {
      const svg = document.querySelector<SVGSVGElement>('[data-testid="lab-frame"] .lc-plot-surface svg');
      if (!svg) return [];
      const target = svg.closest<HTMLElement>(".lc-plot-surface")!;
      const box = svg.getBoundingClientRect();
      const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
      const out: number[] = [];
      for (let i = 0; i < 20; i++) {
        const x = box.left + box.width * (0.1 + (0.8 * i) / 19);
        const y = box.top + box.height * 0.5;
        const t0 = performance.now();
        const init = { clientX: x, clientY: y, bubbles: true, pointerType: "mouse", pointerId: 1 };
        (document.elementFromPoint(x, y) ?? target).dispatchEvent(new PointerEvent("pointermove", init));
        await raf();
        await raf();
        if (document.querySelector(".lc-tooltip")) out.push(performance.now() - t0);
      }
      return out;
    });

    const svgNodes = await page.locator('[data-testid="lab-frame"] svg *').count();
    const adaptations = await page.locator('[data-testid="lab-readout"] li').allTextContents();
    const fx = makeFixture(c.visualId, c.variant, { series: c.series });
    results.push({
      ...c,
      rows: fx.dataset.rows.length,
      svgNodes,
      firstRenderMs: r1(firstRenderMs),
      resizeMsMedian: r1(median(resize)),
      resizeMsP95: r1(p95(resize)),
      hoverMsMedian: hover.length ? r1(median(hover)) : null,
      hoverMsP95: hover.length ? r1(p95(hover)) : null,
      adaptations,
    });
  });
}

test.afterAll(async ({ browser }) => {
  if (!results.length) return;
  const env = {
    date: new Date().toISOString(),
    browser: `Chromium ${browser.version()} (headless)`,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: `${os.cpus()[0]?.model ?? "unknown"} × ${os.cpus().length}`,
    memoryGb: Math.round(os.totalmem() / 2 ** 30),
    build: "Vite dev server (unminified React development build)",
  };
  mkdirSync("docs/chart-system", { recursive: true });
  writeFileSync("docs/chart-system/benchmark.json", JSON.stringify({ env, results }, null, 2) + "\n");
  const rows = results.map((r) => `| ${r.id} | ${r.rows.toLocaleString("en-US")} | ${r.width}×${r.height} | ${r.svgNodes.toLocaleString("en-US")} | ${r.firstRenderMs} | ${r.resizeMsMedian} / ${r.resizeMsP95} | ${r.hoverMsMedian ?? "—"} / ${r.hoverMsP95 ?? "—"} |`);
  const notes = results.filter((r) => r.adaptations.length).map((r) => `- **${r.id}**: ${r.adaptations.join("; ")}`);
  writeFileSync(
    "docs/chart-system/benchmark.md",
    [
      "# Dense-data benchmark",
      "",
      "Generated by `BENCH=1 npx playwright test e2e/benchmark.spec.ts`. Numbers are machine-specific; compare runs on the same machine only.",
      "",
      `- Date: ${env.date}`,
      `- Browser: ${env.browser}`,
      `- OS: ${env.os}`,
      `- CPU: ${env.cpu}, ${env.memoryGb} GB RAM`,
      `- Build: ${env.build}. A production build is faster; these are upper bounds.`,
      "",
      "Timings are measured inside the page. **First render** is from switching the fixture to the dense variant until the card's DOM is unchanged for two frames (includes data generation, model derivation, layout and React commit). **Resize** is one 40px keyboard resize until the readout updates plus one frame. **Hover** is one pointer move until the tooltip is present after two frames (the floor is two frames, about 33 ms at 60 Hz).",
      "",
      "| Case | Rows | Card | SVG nodes | First render (ms) | Resize median / p95 (ms) | Hover median / p95 (ms) |",
      "| --- | ---: | --- | ---: | ---: | ---: | ---: |",
      ...rows,
      "",
      "## Adaptations reported at these sizes",
      "",
      ...(notes.length ? notes : ["- None."]),
      "",
    ].join("\n"),
  );
});
