import { expect, test } from "@playwright/test";

test.describe("Asset Builder uses the Llumen chart system", () => {
  test("edit preview renders LlumenChart, discloses suggestions and follows real mappings", async ({ page }) => {
    await page.goto("./#/asset-builder");
    await page.getByRole("button", { name: /Registration Completion Rate/ }).click();
    const card = page.locator(".chart-card--native");
    await expect(card.locator(".lc-chart")).toBeVisible();
    await expect(card.locator("svg rect.lc-mark").first()).toBeVisible();

    await card.getByRole("button", { name: /About this chart/ }).click();
    await expect(page.getByText("Preview uses a suggested column for X axis")).toBeVisible();
    await page.getByRole("button", { name: "Close notes" }).click();

    await page.getByRole("button", { name: "Select x axis" }).click();
    await page.getByRole("option", { name: /^District/ }).click();
    await page.getByRole("button", { name: "Select y axis" }).click();
    await page.getByRole("option", { name: /^Registrations/ }).click();

    await card.getByRole("button", { name: /About this chart/ }).click();
    await expect(page.getByText("Preview uses a suggested column for X axis")).toHaveCount(0);
    await page.getByRole("button", { name: "Close notes" }).click();

    for (const s of ["Small", "Medium", "Large"]) {
      await page.getByRole("button", { name: s, exact: true }).click();
      await expect(card).toHaveClass(new RegExp(`chart-card--${s.toLowerCase()}`));
      await expect(card.locator(".lc-chart")).toBeVisible();
      await page.waitForTimeout(400);
      const fit = await card.evaluate((el) => {
        const c = el.getBoundingClientRect();
        const svg = el.querySelector(".lc-plot-surface svg")?.getBoundingClientRect();
        return { card: c.width, plotRight: svg ? svg.right - c.left : 0 };
      });
      expect(fit.card - fit.plotRight, `${s}: plot ends ${Math.round(fit.card - fit.plotRight)}px before the card edge`).toBeLessThan(40);
    }
    await page.screenshot({ path: "docs/chart-system/screenshots/builder-edit-preview.png" });

    const next = page.getByRole("button", { name: /^(Next|Create asset)$/ });
    for (let i = 0; i < 6; i++) {
      if (await page.getByRole("heading", { name: "General Info", level: 3 }).isVisible()) break;
      await expect(next).toBeEnabled();
      await next.click();
    }
    await page.getByRole("textbox", { name: "Asset Name" }).fill("Registrations by district");
    await page.getByRole("textbox", { name: "Description" }).fill("Monthly registrations per district.");
    await page.getByRole("button", { name: /Add tags/ }).click();
    await page.getByRole("listbox", { name: "Tags" }).getByRole("option").first().click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Create asset" }).click();
    await expect(page.getByRole("heading", { name: "Edit Asset" })).toHaveCount(0);
  });
});
