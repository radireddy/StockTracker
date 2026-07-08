import { test, expect } from "@playwright/test";

test.describe("import", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/import");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with Import heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Import/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("file upload area is present", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
  });

  test("upload instructions text is visible", async ({ page }) => {
    // The upload drop-zone always shows this prompt text when no files are selected
    await expect(page.getByText(/Click to select holdings statement/i)).toBeVisible();
  });

  test("navigating back to dashboard from import works", async ({ page }) => {
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
