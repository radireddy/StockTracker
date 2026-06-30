import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**/*.ts",
        "src/types/**/*.ts",
      ],
      exclude: [
        "src/lib/supabase/**",
        "src/lib/logger/providers/axiom.ts",
        "src/lib/providers/stock-price/yahoo-finance-provider.ts",
        "src/lib/providers/stock-price/twelve-data-provider.ts",
        "src/lib/providers/storage/supabase-storage.ts",
        "src/lib/services/price-refresh.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
