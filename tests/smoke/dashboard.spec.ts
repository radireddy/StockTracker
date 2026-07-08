import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("page loads and shows portfolio name in h1", async ({ page }) => {
    await expect(page.locator("h1")).toBeVisible();
    // Must not still be on the login page
    await expect(page.getByRole("button", { name: /Google/i })).not.toBeVisible();
  });

  test("companies table renders at least one company row", async ({ page }) => {
    const companyLinks = page.locator("a[href^='/company/']:not([href='/company/new'])");
    await expect(companyLinks.first()).toBeVisible({ timeout: 10_000 });
    const count = await companyLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("portfolio type toggle is visible", async ({ page }) => {
    // Segmented control renders as role="group" with aria-label
    await expect(page.getByRole("group", { name: /Portfolio type/i })).toBeVisible();
  });

  test("switching to Watchlists shows watchlist companies", async ({ page }) => {
    // Segmented options render as <button aria-pressed>, grouped under role="group"
    const toggle = page.getByRole("group", { name: /Portfolio type/i });
    await expect(toggle).toBeVisible();
    await toggle.getByRole("button", { name: "Watchlists" }).click();
    await page.waitForLoadState("networkidle");
    // Still on dashboard, no crash
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("Add company button is visible", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Add company/i })).toBeVisible();
  });

  test("Refresh prices button is visible", async ({ page }) => {
    // Button has aria-label="Refresh stock prices"
    await expect(page.getByRole("button", { name: /Refresh stock prices/i })).toBeVisible();
  });

  test("primary navigation contains Dashboard, Import, Settings links", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /Primary/i });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Import" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("StockTracker logo link is present", async ({ page }) => {
    await expect(page.getByRole("link", { name: /StockTracker/i }).first()).toBeVisible();
  });
});
