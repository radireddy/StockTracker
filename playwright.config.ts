import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.test") });

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  retries: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    storageState: ".playwright/auth-state.json",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
