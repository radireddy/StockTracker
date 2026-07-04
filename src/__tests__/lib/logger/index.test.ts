import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger index", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates console logger when axiom is not configured", async () => {
    // Ensure NEXT_PUBLIC_AXIOM_DATASET is not set
    delete process.env.NEXT_PUBLIC_AXIOM_DATASET;
    const { createLogger } = await import("@/lib/logger");
    const logger = createLogger({ service: "test" });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("createLogger returns a logger with all methods", async () => {
    delete process.env.NEXT_PUBLIC_AXIOM_DATASET;
    const { createLogger } = await import("@/lib/logger");
    const logger = createLogger();
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("exports a default logger instance", async () => {
    delete process.env.NEXT_PUBLIC_AXIOM_DATASET;
    const module = await import("@/lib/logger");
    expect(module.logger).toBeDefined();
  });

  it("creates axiom logger when NEXT_PUBLIC_AXIOM_DATASET is set", async () => {
    process.env.NEXT_PUBLIC_AXIOM_DATASET = "test-dataset";
    const { createLogger } = await import("@/lib/logger");
    const logger = createLogger({ service: "test" });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    delete process.env.NEXT_PUBLIC_AXIOM_DATASET;
  });
});
