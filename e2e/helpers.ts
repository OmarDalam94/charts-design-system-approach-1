import { expect, type Locator, type Page } from "@playwright/test";

export async function openLab(page: Page, query = "") {
  await page.goto(`./#/chart-lab${query ? `?${query}` : ""}`);
  await expect(page.getByTestId("chart-lab")).toBeVisible();
}

export async function openScenario(page: Page, id: string, theme: "dark" | "light" = "dark") {
  await openLab(page, `s=${encodeURIComponent(`id:${id}`)}`);
  if (theme === "light") await page.getByRole("radio", { name: "Light" }).click();
  await settle(page);
}

/** Waits for measurement and fonts so screenshots and geometry are stable. */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("readout-state").first()).toBeVisible();
  await page.waitForTimeout(150);
}

export type GeometryIssue = { kind: "outside" | "overlap"; a: string; b?: string };

/**
 * Text collisions and clipping inside a chart card: every visible SVG/HTML text
 * box must sit inside the card, and SVG labels must not overlap each other.
 */
export async function geometryIssues(frame: Locator): Promise<GeometryIssue[]> {
  return frame.evaluate((root) => {
    const card = root.querySelector(".lc-chart")?.getBoundingClientRect() ?? root.getBoundingClientRect();
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const issues: { kind: "outside" | "overlap"; a: string; b?: string }[] = [];
    const svgTexts = [...root.querySelectorAll("svg text")].filter(visible);
    const scrollers = (el: Element) => {
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(s.overflowX + s.overflowY) && p !== root.querySelector(".lc-chart")) return true;
      }
      return false;
    };
    const tol = 1.5;
    for (const t of [...svgTexts, ...root.querySelectorAll(".lc-chart__title, .lc-legend__label, .lc-kpi__value")].filter(visible)) {
      if (scrollers(t)) continue;
      const r = t.getBoundingClientRect();
      if (r.left < card.left - tol || r.right > card.right + tol || r.top < card.top - tol || r.bottom > card.bottom + tol) issues.push({ kind: "outside", a: (t.textContent ?? "").slice(0, 40) });
    }
    const boxes = svgTexts.map((t) => ({ t: (t.textContent ?? "").slice(0, 40), r: t.getBoundingClientRect() }));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) issues.push({ kind: "overlap", a: boxes[i].t, b: boxes[j].t });
      }
    return issues;
  });
}
