// Run this script to capture auth cookies from the running browser session
// Usage: npx playwright test tests/capture-auth.ts
import { test, chromium } from "@playwright/test";

test("capture auth state", async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000");
  // Wait for user to log in manually
  console.log("Please log in manually in the browser window...");
  console.log("After login, wait for the dashboard to load, then press Enter in the terminal.");

  // Wait up to 120 seconds for the dashboard to appear
  await page.waitForURL("http://localhost:3000/", { timeout: 120000 });
  // Wait a bit more for page to fully load
  await page.waitForTimeout(3000);

  // Save storage state
  await context.storageState({ path: "tests/auth-state.json" });
  console.log("Auth state saved to tests/auth-state.json");

  await browser.close();
});
