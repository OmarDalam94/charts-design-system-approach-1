/**
 * Visual evidence: captures representative scenarios in both themes and
 * asserts there is no clipped or colliding text inside the card. Screenshots
 * are written to docs/chart-system/screenshots for manual inspection.
 */
import { expect, test } from "@playwright/test";
import { geometryIssues, openScenario } from "./helpers";

const SHOTS = [
  "kpi-card:default",
  "kpi-grid:default",
  "legacy-kpi:default",
  "vertical-bar:default",
  "horizontal-bar:default",
  "line-chart:default",
  "area-chart:default",
  "scatter-plot:default",
  "donut-chart:default",
  "progress-bar:default",
  "gauge-linear:default",
  "gauge-linear:circular",
  "score-indicator:default",
  "polar-wind-rose:default",
  "range:default",
  "availability:default",
  "sankey-chart:default",
  "table:default",
  "line-chart:compound-compact-kitchen-sink",
  "line-chart:compound-12-identical",
  "line-chart:compound-50-legend",
  "donut-chart:compound-side-legend-narrow",
  "vertical-bar:compound-mixed-stack-labels",
  "sankey-chart:compound-8-stage-narrow",
  "range:compound-axis-conflict",
  "kpi-grid:compound-50-tiles",
  "availability:compound-dense-unknown",
  "table:compound-wide-small",
  "horizontal-bar:cartesian-long",
  "vertical-bar:top-n-auto",
  "polar-wind-rose:bands",
  "line-chart:gaps",
];

for (const theme of ["dark", "light"] as const) {
  for (const id of SHOTS) {
    test(`${theme} · ${id}`, async ({ page }) => {
      await openScenario(page, id, theme);
      const frame = page.getByTestId("lab-frame");
      await frame.screenshot({ path: `docs/chart-system/screenshots/${theme}/${id.replace(/:/g, "--")}.png`, animations: "disabled" });
      const issues = await geometryIssues(frame);
      expect(issues, JSON.stringify(issues.slice(0, 6))).toEqual([]);
    });
  }
}
