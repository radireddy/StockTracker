import { test, expect } from "@playwright/test";

test.describe("auth", () => {
  test("unauthenticated /dashboard redirects to /login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("unauthenticated /company/new redirects to /login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/company/new");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("unauthenticated /settings redirects to /login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("authenticated user visiting /login is redirected to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("login page shows Google sign-in button for unauthenticated users", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await ctx.close();
  });
});
