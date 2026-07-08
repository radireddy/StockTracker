import { test, expect } from "@playwright/test";

test.describe("settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with Settings heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Settings/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("profile section shows scrubbed display name", async ({ page }) => {
    await expect(page.getByText("Test User")).toBeVisible();
  });

  test("profile section shows test user email", async ({ page }) => {
    await expect(page.getByText(/e2e-test@stocktracker\.local/i)).toBeVisible();
  });

  test("Allocation Ranges section is present", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Allocation Ranges/i })).toBeVisible();
  });

  test("Portfolios section is present", async ({ page }) => {
    // Two headings match /Portfolios/: the card title and a subtitle showing count.
    // Use .first() to avoid strict-mode violation.
    await expect(page.getByRole("heading", { name: /Portfolios/i }).first()).toBeVisible();
  });

  test("Broker Accounts section is present", async ({ page }) => {
    // AccountsManager renders a card with CardTitle "Accounts"
    await expect(page.getByRole("heading", { name: /^Accounts$/i }).first()).toBeVisible();
  });

  test("Danger Zone card is present with delete button", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Danger Zone/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete account/i })).toBeVisible();
  });

  test("delete account button opens confirmation dialog when clicked", async ({ page }) => {
    await page.getByRole("button", { name: /Delete account/i }).click();
    // AlertDialog renders as role="alertdialog" (not "dialog")
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 3_000 });
    // Close without deleting
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
  });
});
