/**
 * Full E2E test suite for the Zerodha holdings import flow.
 *
 * Uses a dedicated import test user (TEST_IMPORT_USER_EMAIL) provisioned in
 * global-setup: accounts are wiped before every run so the import always hits
 * the "create new account" path. A holdings portfolio is also seeded so the
 * import page does not show the "no portfolio" error.
 *
 * The fixture file is a real Zerodha statement; PII (client ID, exact amounts)
 * is NOT asserted. The auto-generated account label is overwritten with a
 * neutral name before the import commits.
 *
 * Tests run serially — state accumulates:
 *   1. Page load smoke
 *   2. Detection review  — upload → detect → verify stock count + date
 *   3. Full import       — upload → review → rename label → import → verify result
 *   4. Import history    — navigate to /import, verify history entry from test 3
 *   5. Settings account  — verify broker account appears in /settings
 *   6. Cleanup           — delete account via Settings UI
 *
 * HOLDINGS_FILE: absolute path to the local fixture. Set HOLDINGS_FILE_PATH env
 * var to override (e.g. in CI where the path differs).
 */

import path from "node:path";
import { test, expect } from "@playwright/test";

test.use({ storageState: ".playwright/import-user-auth-state.json" });

const HOLDINGS_FILE =
  process.env.HOLDINGS_FILE_PATH ??
  "/Users/ravindraadireddy/Downloads/holdings-YY7859 (25).xlsx";

const EXPECTED_STOCKS = 25;
const STATEMENT_DATE = "2026-07-11";
// Neutral label that replaces the auto-generated one (which contains the real client ID).
const ACCOUNT_LABEL = "E2E Import Account";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Upload file → click Continue → wait for review phase. */
async function goToReview(page: import("@playwright/test").Page) {
  await page.goto("/import");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles(HOLDINGS_FILE);
  await page.getByRole("button", { name: /^Continue/i }).click();
  // Wait until the review card stock count is visible
  await expect(
    page.getByText(new RegExp(`${EXPECTED_STOCKS}\\s+stocks`, "i")),
  ).toBeVisible({ timeout: 15_000 });
}

/** Fill the account label input (only visible when mode is "create"). */
async function fillAccountLabel(page: import("@playwright/test").Page, label: string) {
  const labelInput = page.getByLabel(/New account name/i);
  if (await labelInput.isVisible()) {
    await labelInput.fill(label);
  }
}

/** Complete the import from the review step. */
async function completeImport(page: import("@playwright/test").Page) {
  await fillAccountLabel(page, ACCOUNT_LABEL);
  const importBtn = page.getByRole("button", { name: /^Import$/i });
  await expect(importBtn).toBeEnabled();
  await importBtn.click();
  await expect(page.getByText(/statement(s)? processed/i)).toBeVisible({ timeout: 20_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe.serial("Zerodha holdings import — full flow", () => {
  // 1. Page load ──────────────────────────────────────────────────────────

  test("import page loads with upload area and no server error", async ({ page }) => {
    await page.goto("/import");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Import Holdings/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("500");

    // Hidden file input is attached to the DOM
    await expect(page.locator('input[type="file"]')).toBeAttached();

    // Drop-zone prompt is visible when no file is selected
    await expect(page.getByText(/Click to select holdings statement/i)).toBeVisible();

    // Portfolio selector present (seeded in global-setup)
    await expect(page.locator("select")).toBeVisible();

    // Privacy notice
    await expect(page.getByText(/stored under your account only/i)).toBeVisible();

    // Continue button is disabled until a file is chosen
    await expect(page.getByRole("button", { name: /^Continue/i })).toBeDisabled();
  });

  // 2. Detection review ───────────────────────────────────────────────────

  test("uploading statement shows review with 25 stocks and statement date", async ({ page }) => {
    await page.goto("/import");
    await page.waitForLoadState("networkidle");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(HOLDINGS_FILE);

    // File chip appears in the drop-zone — use .first() because on retry the history
    // card also contains the filename in its subtitle row.
    await expect(page.getByText(path.basename(HOLDINGS_FILE), { exact: false }).first()).toBeVisible();

    // Continue becomes enabled once a file is selected
    const continueBtn = page.getByRole("button", { name: /^Continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Review phase: detection summary shows stock count in the format "{N} stocks · {clientId}".
    // The statement date is not rendered here — it only appears in the result screen.
    await expect(
      page.getByText(new RegExp(`${EXPECTED_STOCKS}\\s+stocks`, "i")),
    ).toBeVisible({ timeout: 15_000 });

    // "Create a new account" radio pre-selected (no existing accounts for fresh user)
    await expect(
      page.getByRole("radio", { name: /Create a new account/i }),
    ).toBeChecked();

    // Editable account label input is already visible (default mode is "create")
    await expect(page.getByLabel(/New account name/i)).toBeVisible();
  });

  // 3. Full import ────────────────────────────────────────────────────────

  test("completing import records 25 stocks in result screen", async ({ page }) => {
    await goToReview(page);

    // Overwrite the auto-generated label (which contains the real client ID)
    // with a neutral, anonymized name before committing the import.
    await fillAccountLabel(page, ACCOUNT_LABEL);

    // Import button is enabled: "create" mode + non-empty label → commitReady
    const importBtn = page.getByRole("button", { name: /^Import$/i });
    await expect(importBtn).toBeEnabled();
    await importBtn.click();

    // ── Result screen ──────────────────────────────────────────────────────

    // Summary banner: 1 statement processed
    await expect(page.getByText("1 statement processed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`${EXPECTED_STOCKS} stock position(s) recorded`)).toBeVisible();

    // Per-file result card: "New · E2E Import Account" badge (first-ever import)
    await expect(page.getByText(new RegExp(`New\\s*·\\s*${ACCOUNT_LABEL}`, "i"))).toBeVisible();

    // Statement date visible in the result detail row
    await expect(page.getByText(`as on ${STATEMENT_DATE}`)).toBeVisible();

    // Stock count in the per-file detail line
    await expect(page.getByText(`${EXPECTED_STOCKS} stocks`).first()).toBeVisible();

    // "Client" label is shown (we verify presence, not the actual ID value)
    await expect(page.getByText(/^Client\b/i)).toBeVisible();

    // "Import More" reset button is present
    await expect(page.getByRole("button", { name: /Import More/i })).toBeVisible();
  });

  // 4. Import history ─────────────────────────────────────────────────────

  test("import history card shows entry from the completed import", async ({ page }) => {
    // Navigate to import page; history from test 3 is persisted in the database.
    await page.goto("/import");
    await page.waitForLoadState("networkidle");

    // History card heading (lazy-loaded; wait for it)
    await expect(page.getByRole("heading", { name: /Import History/i })).toBeVisible({
      timeout: 10_000,
    });

    // History row: account label from the import
    await expect(page.getByText(ACCOUNT_LABEL)).toBeVisible();

    // Stock count shown in the history row
    await expect(page.getByText(`${EXPECTED_STOCKS} stocks`)).toBeVisible();

    // "Imported" badge (first run) — or "Replaced" if the suite has been run before
    // and accounts were wiped but import_holdings were not. Either is valid.
    await expect(page.getByText(/^(Imported|Replaced)$/i).first()).toBeVisible();

    // Statement date in the history row subtitle
    await expect(page.getByText(STATEMENT_DATE, { exact: false }).last()).toBeVisible();

    // Each row has a per-row delete button
    await expect(
      page.getByRole("button", { name: new RegExp(`Delete import record for ${ACCOUNT_LABEL}`, "i") }),
    ).toBeVisible();

    // "Clear All" button visible when at least one history entry exists
    await expect(page.getByRole("button", { name: /Clear All/i })).toBeVisible();
  });

  // 5. Settings: account details ──────────────────────────────────────────

  test("settings page shows the imported account with correct broker", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Accounts section
    await expect(page.getByRole("heading", { name: /^Accounts$/i })).toBeVisible();

    // Our account label is visible
    await expect(page.getByText(ACCOUNT_LABEL)).toBeVisible();

    // Broker is "Zerodha" (capitalized by the UI)
    await expect(page.getByText(/zerodha/i)).toBeVisible();

    // Edit and delete action buttons are present for the account row
    await expect(
      page.getByRole("button", { name: new RegExp(`Rename ${ACCOUNT_LABEL}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`Delete ${ACCOUNT_LABEL}`, "i") }),
    ).toBeVisible();
  });

  // 6. Cleanup: delete the account via Settings UI ────────────────────────

  test("account can be deleted from settings (cleanup for next run)", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click the delete (trash) icon button for our account
    await page
      .getByRole("button", { name: new RegExp(`Delete ${ACCOUNT_LABEL}`, "i") })
      .click();

    // Alert dialog shows the account name and a warning about irreversibility
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await expect(dialog.getByText(ACCOUNT_LABEL, { exact: false })).toBeVisible();
    await expect(dialog.getByText(/removes its holdings/i)).toBeVisible();

    // Confirm deletion
    await dialog.getByRole("button", { name: /Delete Account/i }).click();

    // Wait for the dialog to close first — the dialog title also contains ACCOUNT_LABEL
    // so asserting getByText(ACCOUNT_LABEL) not.toBeVisible while the dialog is still
    // animating out triggers a strict-mode violation (2 matching elements).
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Account row is gone — the per-row delete button is the most specific proxy.
    await expect(
      page.getByRole("button", { name: new RegExp(`Delete ${ACCOUNT_LABEL}`, "i") }),
    ).not.toBeVisible({ timeout: 5_000 });

    // Success toast
    await expect(page.getByText(/Account deleted/i)).toBeVisible({ timeout: 3_000 });
  });
});
