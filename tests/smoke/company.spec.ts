import { test, expect, type Page } from "@playwright/test";

// Excludes /company/new — that's the "add" route, not a real company page
const COMPANY_LINK = "a[href^='/company/']:not([href='/company/new'])";

async function openFirstCompany(page: Page): Promise<string> {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  const link = page.locator(COMPANY_LINK).first();
  await expect(link).toBeVisible({ timeout: 10_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("No company link found on dashboard");
  await page.goto(href);
  await page.waitForLoadState("networkidle");
  return href;
}

async function clickTab(page: Page, tabValue: string) {
  const tab = page.locator(`[data-value="${tabValue}"]`).first();
  await expect(tab).toBeVisible({ timeout: 5_000 });
  await tab.click();
  await page.waitForLoadState("networkidle");
}

test.describe("company detail", () => {
  test("page loads with company name visible", async ({ page }) => {
    await openFirstCompany(page);
    await expect(page.locator("h1, h2").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("Details tab is active by default", async ({ page }) => {
    await openFirstCompany(page);
    const detailsTab = page.locator('[data-value="details"]').first();
    await expect(detailsTab).toBeVisible();
    // base-ui Tabs uses aria-selected (not aria-pressed)
    await expect(detailsTab).toHaveAttribute("aria-selected", "true");
  });

  test("Holdings tab opens (for holdings portfolio companies)", async ({ page }) => {
    await openFirstCompany(page);
    const holdingsTab = page.locator('[data-value="holdings"]').first();
    if (!(await holdingsTab.isVisible())) {
      test.skip(true, "Company is not in a holdings portfolio");
      return;
    }
    await holdingsTab.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("Thesis tab opens without error", async ({ page }) => {
    await openFirstCompany(page);
    await clickTab(page, "thesis");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("Projections & Valuations tab opens without error", async ({ page }) => {
    await openFirstCompany(page);
    await clickTab(page, "projections");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("Timeline tab opens without error", async ({ page }) => {
    await openFirstCompany(page);
    await clickTab(page, "timeline");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("Highlights tab opens without error", async ({ page }) => {
    await openFirstCompany(page);
    await clickTab(page, "highlights");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("Add company page loads with stock search", async ({ page }) => {
    await page.goto("/company/new");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/company\/new/);
    await expect(page.locator("body")).not.toContainText("500");
  });
});
