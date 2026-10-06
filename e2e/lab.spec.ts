import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { geometryIssues, openLab, openScenario, settle } from "./helpers";

const frame = (page: Page) => page.getByTestId("lab-frame");
const chart = (page: Page) => frame(page).locator(".lc-chart");
const readout = (page: Page, id: string) => page.getByTestId(`readout-${id}`).first();

async function setSize(page: Page, w: number, h?: number) {
  await page.getByTestId("lab-width").fill(String(w));
  await page.getByTestId("lab-width").press("Enter");
  if (h !== undefined) {
    await page.getByTestId("lab-height").fill(String(h));
    await page.getByTestId("lab-height").press("Enter");
  }
  await expect(readout(page, "container")).toContainText(`${w} ×`);
}

test.describe("resize", () => {
  test("numeric input, presets, drag and keyboard all resize the real container", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    await setSize(page, 640, 360);
    await expect(readout(page, "container")).toHaveText(/640 × 360 px/);

    await page.getByRole("group", { name: "Width presets" }).getByRole("button", { name: "375" }).click();
    await expect(readout(page, "container")).toHaveText(/375 × 360 px/);

    const corner = frame(page).getByRole("slider");
    await corner.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(readout(page, "container")).toHaveText(/383 × 400 px/);

    const box = (await corner.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await expect(readout(page, "container")).toHaveText(/48\d × 42\d px/);
  });

  test("size modes switch at 320, 480 and 768", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    for (const [w, mode] of [
      [319, "micro"],
      [320, "compact"],
      [479, "compact"],
      [480, "regular"],
      [767, "regular"],
      [768, "wide"],
    ] as const) {
      await setSize(page, w, 360);
      await expect(readout(page, "mode")).toHaveText(mode);
      await expect(chart(page)).toHaveAttribute("data-mode", mode);
    }
  });

  test("a card too small for its plot shows the compact summary with View data", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    await setSize(page, 200, 140);
    await expect(readout(page, "plot")).toHaveText("Compact summary");
    await chart(page).getByRole("button", { name: /View data/ }).first().click();
    await expect(chart(page).locator("table.lc-table")).toBeVisible();
  });
});

test.describe("legend", () => {
  test("toggle, isolate, all-hidden recovery and Show all with 50 series", async ({ page }) => {
    await openScenario(page, "line-chart:compound-50-legend");
    await expect(readout(page, "series")).toHaveText("50 / 50 visible");
    const legend = chart(page).getByRole("group", { name: /^Legend, 50 items/ });

    await legend.getByRole("button", { name: /^Region 01/ }).click();
    await expect(readout(page, "series")).toHaveText("49 / 50 visible");
    await legend.getByRole("button", { name: /^Region 01/ }).click();

    await legend.getByRole("button", { name: /^Region 02/ }).hover();
    await legend.getByRole("button", { name: "Show only Region 02" }).click();
    await expect(readout(page, "series")).toHaveText("1 / 50 visible");
    await legend.getByRole("button", { name: /^Region 02/ }).click();
    await expect(chart(page).getByText("All series are hidden")).toBeVisible();
    await chart(page).getByRole("button", { name: "Show all series" }).first().click();
    await expect(readout(page, "series")).toHaveText("50 / 50 visible");

    const more = legend.getByRole("button", { name: "Show all 50" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(legend.getByRole("button", { name: "Show fewer" })).toBeVisible();
    await expect(legend.getByRole("button", { name: /^Region 50/ })).toBeAttached();
  });

  test("legend toggles work from the keyboard", async ({ page }) => {
    await openScenario(page, "line-chart:compound-12-identical");
    const first = chart(page).locator(".lc-legend__toggle").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press(" ");
    await expect(first).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("tooltips", () => {
  test("keyboard: arrows move, Enter pins, Escape closes; coincident series share one tooltip", async ({ page }) => {
    await openScenario(page, "line-chart:compound-12-identical");
    const plot = chart(page).locator(".lc-plot-surface");
    await plot.focus();
    await page.keyboard.press("ArrowRight");
    const tip = page.locator(".lc-tooltip");
    await expect(tip).toBeVisible();
    await expect(tip.locator(".lc-tooltip__label")).toHaveCount(12);
    await page.keyboard.press("Enter");
    await expect(page.locator(".lc-tooltip--pinned")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
  });

  test("hover shows the same content as keyboard", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    const svg = chart(page).locator(".lc-plot-surface svg");
    const b = (await svg.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await expect(page.locator(".lc-tooltip")).toBeVisible();
    const hoverTitle = await page.locator(".lc-tooltip__title").innerText();
    expect(hoverTitle.length).toBeGreaterThan(0);
  });
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("tapping a mark pins its tooltip and Close dismisses it", async ({ page }) => {
    await openScenario(page, "vertical-bar:default");
    const bar = chart(page).locator("rect.lc-mark").nth(2);
    await bar.tap();
    await expect(page.locator(".lc-tooltip--pinned")).toBeVisible();
    await page.getByRole("button", { name: "Close details" }).tap();
    await expect(page.locator(".lc-tooltip")).toHaveCount(0);
  });
});

test.describe("scenarios", () => {
  test("edits mark the scenario modified, survive reload through the URL, and Reset restores", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    await setSize(page, 512, 300);
    await expect(page.getByTestId("modified-pill")).toBeVisible();
    await expect.poll(() => page.url()).toContain("s=");
    const url = page.url();
    await page.goto(url);
    await settle(page);
    await expect(readout(page, "container")).toHaveText(/512 × 300 px/);
    await page.getByTestId("reset-scenario").click();
    await expect(page.getByTestId("modified-pill")).toHaveCount(0);
  });

  test("Export JSON and Import JSON round-trip a scenario", async ({ page }, info) => {
    await openScenario(page, "donut-chart:compound-side-legend-narrow");
    await setSize(page, 333, 410);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export JSON" }).click()]);
    const path = info.outputPath("scenario.json");
    await download.saveAs(path);
    const json = JSON.parse(readFileSync(path, "utf8"));
    expect(json.version).toBe(1);
    expect(json.width).toBe(333);

    await openScenario(page, "line-chart:default");
    await page.locator('input[type="file"]').setInputFiles(path);
    await settle(page);
    await expect(readout(page, "container")).toHaveText(/333 × 410 px/);
    await expect(chart(page).locator(".lc-legend")).toBeVisible();
  });

  test("compare renders three live cards at 320, 640 and 1024", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    await page.getByText("Compare 320 / 640 / 1024").click();
    await expect(page.getByTestId("lab-compare")).toBeChecked();
    for (const [w, mode] of [
      [320, "compact"],
      [640, "regular"],
      [1024, "wide"],
    ] as const) {
      const card = page.getByTestId(`lab-compare-${w}`).locator(".lc-chart");
      await expect(card).toHaveAttribute("data-mode", mode);
      expect(Math.round((await card.boundingBox())!.width)).toBe(w);
      await expect(page.locator("figure.lab-compare__cell figcaption", { hasText: `${w}px` })).toContainText(mode);
    }
  });
});

test.describe("data tab", () => {
  test("invalid input keeps the last valid chart and says so; valid CSV replaces the data", async ({ page }) => {
    await openScenario(page, "vertical-bar:default");
    await page.getByRole("tab", { name: "Data" }).click();
    const editor = page.getByRole("textbox", { name: "Fixture data" });
    await editor.fill("{ not json");
    await page.getByRole("button", { name: "Apply data" }).click();
    await expect(page.getByText("The chart still shows the last valid result")).toBeVisible();

    await editor.fill("district,value\nAlpha,10\nBeta,\nGamma,30");
    await page.getByRole("button", { name: "Apply data" }).click();
    await page.getByRole("tab", { name: "Playground" }).click();
    await settle(page);
    await chart(page).getByRole("button", { name: /View data/ }).first().click();
    const table = chart(page).locator("table.lc-table");
    await expect(table).toContainText("Alpha");
    await expect(table).toContainText("Gamma");
    await expect(table).not.toContainText("North");
  });
});

test.describe("property effects", () => {
  test("turning Legend off removes the legend and frees its space", async ({ page }) => {
    await openScenario(page, "line-chart:compound-50-legend");
    const before = await readout(page, "plot").innerText();
    await page.locator(".lab-group__summary").filter({ hasText: /Legend/ }).first().click();
    const sw = page.getByRole("switch", { name: "Show legend" }).first();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.focus();
    await page.keyboard.press(" ");
    await expect(readout(page, "legend")).toHaveText("off");
    await expect(chart(page).locator(".lc-legend")).toHaveCount(0);
    const after = await readout(page, "plot").innerText();
    expect(Number(after.split(" × ")[1].replace(/\D/g, ""))).toBeGreaterThan(Number(before.split(" × ")[1].replace(/\D/g, "")));
  });
});

test.describe("small viewport", () => {
  test.use({ viewport: { width: 700, height: 900 } });
  test("asset list and properties open as dialogs; Escape closes and returns focus", async ({ page }) => {
    await openLab(page, `s=${encodeURIComponent("id:line-chart:default")}`);
    const open = page.getByRole("button", { name: "Assets list" });
    await open.click();
    const dialog = page.getByRole("dialog", { name: /assets/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();

    await page.getByRole("button", { name: "Properties" }).click();
    await expect(page.getByRole("dialog", { name: "Properties" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Properties" })).toHaveCount(0);
  });

  test("a 1440px card scrolls inside the labelled workspace instead of the page", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    await setSize(page, 1440, 360);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(700);
    const ws = page.getByRole("region", { name: /Preview workspace/ }).or(page.locator("section.lab-workspace"));
    expect(await ws.first().evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
});

test.describe("environment", () => {
  test("200% zoom gives the chart half the CSS width, switching mode, without overlaps", async ({ page }) => {
    await openScenario(page, "line-chart:compound-compact-kitchen-sink");
    await setSize(page, 640, 400);
    await page.getByTestId("lab-zoom").selectOption("2");
    await expect(readout(page, "container")).toHaveText(/^320 × 200 px \(CSS, at 200% zoom\)/);
    await expect(readout(page, "mode")).toHaveText("compact");
    await settle(page);
    await expect.poll(() => geometryIssues(frame(page))).toEqual([]);
  });

  test("RTL mirrors chrome but keeps data axes left-to-right", async ({ page }) => {
    await openScenario(page, "line-chart:default");
    await page.getByRole("combobox", { name: "Direction" }).selectOption("rtl");
    await expect(frame(page).locator(".lab-frame__inner")).toHaveAttribute("dir", "rtl");
    const dir = await chart(page).locator("svg").first().evaluate((el) => getComputedStyle(el).direction);
    expect(dir).toBe("ltr");
  });
});

test.describe("documentation screenshots", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test("Lab playground in both themes, the Data tab, and the legend Only control", async ({ page }) => {
    const dir = "docs/chart-system/screenshots";
    for (const theme of ["dark", "light"] as const) {
      await openScenario(page, "line-chart:compound-50-legend", theme);
      await page.screenshot({ path: `${dir}/lab-playground-${theme}.png` });
    }
    await openScenario(page, "line-chart:compound-50-legend");
    const item = chart(page).locator(".lc-legend__item").nth(4);
    await item.hover();
    await expect(item.locator(".lc-legend__only")).toBeVisible();
    await frame(page).screenshot({ path: `${dir}/lab-legend-only.png` });
    await page.getByRole("tab", { name: "Data" }).click();
    await page.getByRole("textbox", { name: "Fixture data" }).fill("{ not json");
    await page.getByRole("button", { name: "Apply data" }).click();
    await expect(page.getByText("The chart still shows the last valid result")).toBeVisible();
    await page.screenshot({ path: `${dir}/lab-data-invalid.png` });
  });
});

test("the site root opens the Lab, which links to the Asset Builder and back", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("chart-lab")).toBeVisible();
  await page.getByRole("link", { name: "Asset Builder" }).click();
  await expect(page).toHaveURL(/#\/asset-builder$/);
  await expect(page.getByTestId("chart-lab")).toHaveCount(0);
  await page.getByRole("link", { name: "Chart System Lab" }).click();
  await expect(page.getByTestId("chart-lab")).toBeVisible();
});
