/**
 * Marketing page tests — all unauthenticated.
 *
 * Covers the homepage carousel (RA slide + valuation scenarios slide) and
 * the new /research-advisory-portfolio-tracker sub-page.
 */
import { test, expect } from "@playwright/test";

const NO_AUTH = { storageState: { cookies: [], origins: [] } };

// ── Homepage carousel ─────────────────────────────────────────────────────────

test.describe("homepage / hero carousel", () => {
  test.use(NO_AUTH);

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("RA subscriber slide is visible on load", async ({ page }) => {
    await expect(
      page.getByText("For the research advisory subscriber"),
    ).toBeVisible();
  });

  test("RA subscriber headline is rendered as the page h1", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your RA's buy call landed at 420",
    );
  });

  test("secondary RA link is visible and points to the sub-page", async ({ page }) => {
    const link = page.getByRole("link", { name: /Using an RA service/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/research-advisory-portfolio-tracker");
  });

  test("valuation scenarios slide content exists in the DOM", async ({ page }) => {
    // The slide is rendered but may be opacity-0 until activated
    await expect(
      page.getByText("your assumptions, your buy price range", { exact: false }),
    ).toBeAttached();
  });

  test("clicking the valuation scenarios dot makes that slide visible", async ({ page }) => {
    const dots = page.getByRole("tab");
    // Dot index 1 → ValuationScenariosDemo slide
    await dots.nth(1).click();
    await expect(
      page.getByText("your assumptions, your buy price range", { exact: false }),
    ).toBeVisible({ timeout: 2_000 });
  });

  test("carousel dot for each slide is present", async ({ page }) => {
    const dots = page.getByRole("tab");
    // 7 slides total (RA + valuation scenarios + 5 original)
    await expect(dots).toHaveCount(7);
  });

  test("homepage does not crash (no 500 in body)", async ({ page }) => {
    // Check for actual Next.js/server error markers, not the number 500 which appears in product data (e.g. ₹2,500)
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await expect(page.locator("body")).not.toContainText("Application error:");
  });
});

// ── /research-advisory-portfolio-tracker ─────────────────────────────────────

test.describe("RA subscriber marketing sub-page", () => {
  test.use(NO_AUTH);

  test.beforeEach(async ({ page }) => {
    await page.goto("/research-advisory-portfolio-tracker");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with correct h1", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "RA research, finally alive",
    );
  });

  test("pain section heading is visible", async ({ page }) => {
    await expect(
      page.getByText("Three moments every subscriber knows too well"),
    ).toBeVisible();
  });

  test("all three pain cards are rendered", async ({ page }) => {
    await expect(page.getByText("The stale target")).toBeVisible();
    await expect(page.getByText("The allocation question")).toBeVisible();
    await expect(page.getByText("Waiting without a signal")).toBeVisible();
  });

  test("buy price range value point is visible", async ({ page }) => {
    await expect(
      page.getByText("A buy price range, not a single number"),
    ).toBeVisible();
  });

  test("live valuation value point is visible", async ({ page }) => {
    await expect(page.getByText("Live, never frozen")).toBeVisible();
  });

  test("volatility section heading is visible", async ({ page }) => {
    await expect(page.getByText(/When volatility hits/i)).toBeVisible();
  });

  test("how-to section first step is visible", async ({ page }) => {
    await expect(
      page.getByText("Import your Zerodha holdings statement"),
    ).toBeVisible();
  });

  test("FAQs are rendered", async ({ page }) => {
    await expect(
      page.getByText("Does it work with any research advisory service?"),
    ).toBeVisible();
    await expect(
      page.getByText(/only gives a target price/i),
    ).toBeVisible();
  });

  test("Google sign-in CTA is present", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Continue with Google/i }).first(),
    ).toBeVisible();
  });

  test("cross-links strip contains link back to homepage", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /See everything StockTracker does/i }),
    ).toBeVisible();
  });

  test("page does not crash (no 500 in body)", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText("500");
  });
});
