import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsoleLogger, createConsoleLogger } from "@/lib/logger/providers/console";

describe("ConsoleLogger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs debug messages", () => {
    const logger = new ConsoleLogger({}, "debug");
    logger.debug("test message");
    expect(consoleSpy.log).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.log.mock.calls[0][0]);
    expect(logged.level).toBe("debug");
    expect(logged.message).toBe("test message");
  });

  it("logs info messages", () => {
    const logger = new ConsoleLogger({}, "debug");
    logger.info("info test");
    expect(consoleSpy.info).toHaveBeenCalledOnce();
  });

  it("logs warn messages", () => {
    const logger = new ConsoleLogger({}, "debug");
    logger.warn("warn test");
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
  });

  it("logs error messages", () => {
    const logger = new ConsoleLogger({}, "debug");
    logger.error("error test");
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it("includes context in log output", () => {
    const logger = new ConsoleLogger({ service: "test" }, "debug");
    logger.info("msg", { extra: "data" });
    const logged = JSON.parse(consoleSpy.info.mock.calls[0][0]);
    expect(logged.service).toBe("test");
    expect(logged.extra).toBe("data");
  });

  it("includes timestamp", () => {
    const logger = new ConsoleLogger({}, "debug");
    logger.info("msg");
    const logged = JSON.parse(consoleSpy.info.mock.calls[0][0]);
    expect(logged.timestamp).toBeDefined();
  });

  it("respects minimum log level", () => {
    const logger = new ConsoleLogger({}, "warn");
    logger.debug("should not log");
    logger.info("should not log");
    logger.warn("should log");
    logger.error("should log");
    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.info).not.toHaveBeenCalled();
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it("child logger inherits and merges context", () => {
    const logger = new ConsoleLogger({ service: "parent" }, "debug");
    const child = logger.child({ component: "child" });
    child.info("child msg");
    const logged = JSON.parse(consoleSpy.info.mock.calls[0][0]);
    expect(logged.service).toBe("parent");
    expect(logged.component).toBe("child");
  });

  it("child logger inherits min level", () => {
    const logger = new ConsoleLogger({}, "error");
    const child = logger.child({ name: "child" });
    child.info("should not log");
    child.error("should log");
    expect(consoleSpy.info).not.toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });
});

describe("ConsoleLogger production mode", () => {
  it("defaults to info level in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const logger = new ConsoleLogger();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.debug("should not log");
    expect(consoleSpy).not.toHaveBeenCalled();
    logger.info("should log");
    expect(infoSpy).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
});

describe("createConsoleLogger", () => {
  it("creates a logger instance", () => {
    const logger = createConsoleLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("accepts optional context", () => {
    const logger = createConsoleLogger({ service: "test" });
    expect(logger).toBeDefined();
  });
});
