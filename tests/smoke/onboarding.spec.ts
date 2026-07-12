/**
 * Onboarding / WelcomeScreen tests.
 *
 * These run as the empty test user (no portfolios, no companies) so the
 * dashboard shows the WelcomeScreen instead of the companies table.
 * The empty user is created and wiped clean in global-setup.ts.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: ".playwright/empty-user-auth-state.json" });

test.describe("onboarding / empty holdings state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("shows welcome headline instead of the companies table", async ({ page }) => {
    await expect(
      page.getByText("Every buy and sell decision", { exact: false }),
    ).toBeVisible();
    // Companies table should not be present
    await expect(page.getByRole("columnheader", { name: /company/i })).not.toBeVisible();
  });

  test("shows all three data signal cards", async ({ page }) => {
    await expect(page.getByText("Should I buy this today?")).toBeVisible();
    await expect(page.getByText("How much should I add or trim?")).toBeVisible();
    await expect(page.getByText("Is it still worth it at this price?")).toBeVisible();
  });

  test("signal card labels describe live data", async ({ page }) => {
    await expect(page.getByText("Margin of safety", { exact: false })).toBeVisible();
    // "Allocation gap" also appears in the volatility paragraph as "allocation gaps" — use a
    // prefix regex so we don't hit the strict-mode violation from multiple matching elements.
    await expect(page.getByText(/^Allocation gap/)).toBeVisible();
    // The SignalCard uses " / " as separator; step 3 uses ", ... and" — use the more specific pattern.
    await expect(page.getByText(/Bull \/ base \/ bear/)).toBeVisible();
  });

  test("shows 3-step setup instructions", async ({ page }) => {
    await expect(page.getByText("Set up in 3 steps", { exact: false })).toBeVisible();
    await expect(page.getByText("Import your holdings")).toBeVisible();
    await expect(page.getByText("Add your companies")).toBeVisible();
    await expect(page.getByText(/Set rating.*valuation/i)).toBeVisible();
  });

  test("Import Zerodha statement CTA is visible and links to /import", async ({ page }) => {
    const link = page.getByRole("link", { name: /Import Zerodha statement/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/import");
  });

  test("Add a company manually CTA is visible and links to /company/new", async ({ page }) => {
    const link = page.getByRole("link", { name: /Add a company manually/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/company/new");
  });

  test("RA service contextual link points to the RA marketing sub-page", async ({ page }) => {
    // The link text is "See how StockTracker makes static RA reports live →", not "research advisory"
    const link = page.getByRole("link", { name: /RA reports live/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/research-advisory-portfolio-tracker");
  });

  test("shows the volatility promise card", async ({ page }) => {
    await expect(page.getByText(/When volatility hits/i)).toBeVisible();
    // Actual text is "The data decides — not the panic."
    await expect(page.getByText(/The data decides/i)).toBeVisible();
  });

  test("Import CTA navigates to /import", async ({ page }) => {
    await page.getByRole("link", { name: /Import Zerodha statement/i }).click();
    await expect(page).toHaveURL(/\/import/);
  });

  test("Add company CTA navigates to /company/new", async ({ page }) => {
    await page.getByRole("link", { name: /Add a company manually/i }).click();
    await expect(page).toHaveURL(/\/company\/new/);
  });

  test("primary nav is still present (user is authenticated)", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /Primary/i });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Import" })).toBeVisible();
  });
});
