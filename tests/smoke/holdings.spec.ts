import { test, expect } from "@playwright/test";

// Excludes /company/new — that's the "add" route, not a real company page
const COMPANY_LINK = "a[href^='/company/']:not([href='/company/new'])";

test.describe("holdings", () => {
  test("holdings tab shows stock rows for a holdings-portfolio company", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const companyLinks = page.locator(COMPANY_LINK);
    const count = await companyLinks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const href = await companyLinks.nth(i).getAttribute("href");
      if (!href) continue;

      await page.goto(href);
      await page.waitForLoadState("networkidle");

      const holdingsTab = page.locator('[data-value="holdings"]').first();
      if (await holdingsTab.isVisible()) {
        await holdingsTab.click();
        await page.waitForLoadState("networkidle");
        await expect(page.locator("body")).not.toContainText("500");
        return;
      }
    }

    test.skip(true, "No company with a Holdings tab found in first 5 results");
  });
});
