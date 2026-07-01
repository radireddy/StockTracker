import { test, expect, type Page } from "@playwright/test";

const E2E_EMAIL = "e2e-test@stocktracker.local";
const E2E_PASSWORD = "TestPassword123";

async function login(page: Page) {
  const res = await page.request.post("/api/e2e-login", {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("Bug Hunt - Navigate all pages", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Dashboard loads without errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Take screenshot
    await page.screenshot({ path: "tests/screenshots/dashboard.png", fullPage: true });

    // Check page loaded (not stuck on login)
    const url = page.url();
    console.log("Dashboard URL:", url);

    // Check for visible error messages on page
    const errorElements = await page.locator("text=error").all();
    const errorTexts = await Promise.all(errorElements.map((e) => e.textContent()));
    if (errorTexts.length) console.log("Error text on page:", errorTexts);

    // Log console errors
    if (consoleErrors.length) console.log("Console errors:", consoleErrors);
    if (jsErrors.length) console.log("JS errors:", jsErrors);

    // Basic structure checks
    const header = page.locator("header");
    await expect(header).toBeVisible();
  });

  test("Navigation links have pointer cursor", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check nav links
    const navLinks = page.locator("nav a");
    const count = await navLinks.count();
    console.log(`Found ${count} nav links`);

    const badCursors: string[] = [];
    for (let i = 0; i < count; i++) {
      const link = navLinks.nth(i);
      const text = await link.textContent();
      const cursor = await link.evaluate((el) => getComputedStyle(el).cursor);
      if (cursor !== "pointer") {
        badCursors.push(`Nav link "${text}" has cursor: ${cursor}`);
      }
    }

    // Check all buttons
    const buttons = page.locator("button");
    const btnCount = await buttons.count();
    for (let i = 0; i < btnCount; i++) {
      const btn = buttons.nth(i);
      if (!(await btn.isVisible())) continue;
      const text = await btn.textContent();
      const cursor = await btn.evaluate((el) => getComputedStyle(el).cursor);
      if (cursor !== "pointer") {
        badCursors.push(`Button "${text?.trim()}" has cursor: ${cursor}`);
      }
    }

    if (badCursors.length) console.log("BAD CURSORS:", badCursors);
    expect(badCursors).toHaveLength(0);
  });

  test("Dashboard table and filters work", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Try clicking Portfolio/Allocation toggle buttons (not the portfolio dropdown)
    const allocationBtn = page.locator("button", { hasText: "Allocation" }).first();
    if (await allocationBtn.isVisible()) {
      // Dismiss any open dropdown first
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      await allocationBtn.click({ force: true });
      await page.waitForTimeout(500);
      await page.screenshot({ path: "tests/screenshots/allocation-view.png", fullPage: true });

      // Try Invested/Current toggle
      const investedBtn = page.locator("text=Invested").first();
      if (await investedBtn.isVisible()) {
        await investedBtn.click();
        await page.waitForTimeout(300);
      }
      const currentBtn = page.locator("text=Current").first();
      if (await currentBtn.isVisible()) {
        await currentBtn.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: "tests/screenshots/allocation-current.png", fullPage: true });
      }
    }

    // Try the search input
    const searchInput = page.locator('input[placeholder*="earch"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("test");
      await page.waitForTimeout(300);
      await searchInput.clear();
      await page.waitForTimeout(300);
    }

    // Try star filter if present
    const starFilter = page.locator('[role="combobox"], select').first();
    if (await starFilter.isVisible()) {
      await starFilter.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: "tests/screenshots/filter-dropdown.png", fullPage: true });
      await page.keyboard.press("Escape");
    }

    if (consoleErrors.length) console.log("Console errors:", consoleErrors);
    if (jsErrors.length) console.log("JS errors:", jsErrors);
    expect(jsErrors).toHaveLength(0);
  });

  test("Settings page loads", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "tests/screenshots/settings.png", fullPage: true });

    if (jsErrors.length) console.log("JS errors on settings:", jsErrors);
    expect(jsErrors).toHaveLength(0);
  });

  test("Import page loads", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/import");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "tests/screenshots/import.png", fullPage: true });

    if (jsErrors.length) console.log("JS errors on import:", jsErrors);
    expect(jsErrors).toHaveLength(0);
  });

  test("Add company page loads", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/company/new");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "tests/screenshots/add-company.png", fullPage: true });

    if (jsErrors.length) console.log("JS errors on add company:", jsErrors);
    expect(jsErrors).toHaveLength(0);
  });

  test("All interactive elements have pointer cursor on all pages", async ({ page }) => {
    const pages = ["/", "/settings", "/import", "/company/new"];
    const badCursors: string[] = [];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      // Check all clickable elements
      const selectors = ["a", "button", "select", '[role="button"]', '[role="tab"]', '[tabindex="0"]'];

      for (const sel of selectors) {
        const elements = page.locator(sel);
        const count = await elements.count();
        for (let i = 0; i < count; i++) {
          const el = elements.nth(i);
          if (!(await el.isVisible())) continue;
          const cursor = await el.evaluate((e) => getComputedStyle(e).cursor);
          if (cursor !== "pointer") {
            const tag = await el.evaluate((e) => e.tagName);
            const text = (await el.textContent())?.trim().slice(0, 30) || "";
            const cls = await el.getAttribute("class") || "";
            badCursors.push(`[${path}] <${tag}> "${text}" cursor=${cursor} class="${cls.slice(0, 60)}"`);
          }
        }
      }
    }

    if (badCursors.length) {
      console.log("Elements missing pointer cursor:");
      badCursors.forEach((b) => console.log("  -", b));
    }
    expect(badCursors).toHaveLength(0);
  });

  test("Check for broken images and resources", async ({ page }) => {
    const failedRequests: string[] = [];
    page.on("requestfailed", (req) => {
      failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });

    const badResponses: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 400 && !res.url().includes("favicon")) {
        badResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to other pages
    for (const path of ["/settings", "/import"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }

    if (failedRequests.length) console.log("Failed requests:", failedRequests);
    if (badResponses.length) console.log("Bad responses:", badResponses);

    expect(failedRequests).toHaveLength(0);
  });

  test("Check for accessibility issues", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const issues: string[] = [];

    // Check images have alt text
    const images = page.locator("img");
    const imgCount = await images.count();
    for (let i = 0; i < imgCount; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      if (!alt) {
        const src = await images.nth(i).getAttribute("src");
        issues.push(`Image without alt: ${src}`);
      }
    }

    // Check form inputs have labels
    const inputs = page.locator("input:not([type=hidden])");
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      if (!(await input.isVisible())) continue;
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const placeholder = await input.getAttribute("placeholder");
      if (!id && !ariaLabel && !placeholder) {
        issues.push("Input without label/aria-label/placeholder");
      }
    }

    // Check buttons have accessible text
    const buttons = page.locator("button");
    const btnCount = await buttons.count();
    for (let i = 0; i < btnCount; i++) {
      const btn = buttons.nth(i);
      if (!(await btn.isVisible())) continue;
      const text = (await btn.textContent())?.trim();
      const ariaLabel = await btn.getAttribute("aria-label");
      const title = await btn.getAttribute("title");
      if (!text && !ariaLabel && !title) {
        const html = await btn.evaluate((e) => e.outerHTML.slice(0, 100));
        issues.push(`Button without accessible text: ${html}`);
      }
    }

    if (issues.length) {
      console.log("Accessibility issues:");
      issues.forEach((i) => console.log("  -", i));
    }
  });

  test("Check for hydration mismatches and React errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        msg.type() === "error" ||
        text.includes("Hydration") ||
        text.includes("hydrat") ||
        text.includes("mismatch") ||
        text.includes("Warning:")
      ) {
        consoleErrors.push(text);
      }
    });

    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    // Visit all pages
    for (const path of ["/", "/settings", "/import", "/company/new"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
    }

    const hydrationErrors = consoleErrors.filter(
      (e) => e.includes("Hydration") || e.includes("hydrat") || e.includes("mismatch")
    );
    const reactWarnings = consoleErrors.filter((e) => e.includes("Warning:"));

    if (hydrationErrors.length) console.log("HYDRATION ERRORS:", hydrationErrors);
    if (reactWarnings.length) console.log("REACT WARNINGS:", reactWarnings);
    if (jsErrors.length) console.log("JS ERRORS:", jsErrors);
    if (consoleErrors.length) console.log("ALL CONSOLE ERRORS:", consoleErrors);

    expect(jsErrors).toHaveLength(0);
  });
});
