import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted so the mock factories can reference them. vi.resetModules() keeps
// mock registrations, and these refs stay stable across re-imports.
const { setMock, delMock, warnMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  delMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ set: setMock, del: delMock }) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const REDIS_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

// Fresh module copy per test so module-level state (redisClient memo,
// localLocked) resets. Env must be set BEFORE import — getRedis() reads it lazily.
async function loadModule() {
  vi.resetModules();
  return import("@/lib/services/refresh-lock");
}

describe("refresh-lock", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    setMock.mockReset();
    delMock.mockReset();
    warnMock.mockReset();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("without Redis (in-process fallback)", () => {
    it("acquires when free and blocks a second acquire", async () => {
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      expect(await acquireRefreshLock()).toBe(false);
    });

    it("releasing lets the next acquire succeed", async () => {
      const { acquireRefreshLock, releaseRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      await releaseRefreshLock();
      expect(await acquireRefreshLock()).toBe(true);
    });

    it("uses the fallback when only one Redis env var is set", async () => {
      process.env.UPSTASH_REDIS_REST_URL = REDIS_ENV.UPSTASH_REDIS_REST_URL;
      // TOKEN intentionally unset -> getRedis() returns null
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      expect(setMock).not.toHaveBeenCalled();
    });
  });

  describe("with Redis", () => {
    beforeEach(() => {
      Object.assign(process.env, REDIS_ENV);
    });

    it("acquires when SET NX returns OK", async () => {
      setMock.mockResolvedValue("OK");
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(true);
      expect(setMock).toHaveBeenCalledWith("price-refresh:lock", "1", {
        nx: true,
        px: 120000,
      });
    });

    it("does not acquire when SET NX returns null (busy)", async () => {
      setMock.mockResolvedValue(null);
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(false);
    });

    it("fails closed and warns when acquire throws an Error", async () => {
      setMock.mockRejectedValue(new Error("boom"));
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(false);
      expect(warnMock).toHaveBeenCalled();
    });

    it("fails closed when acquire rejects with a non-Error", async () => {
      setMock.mockRejectedValue("string failure");
      const { acquireRefreshLock } = await loadModule();
      expect(await acquireRefreshLock()).toBe(false);
      expect(warnMock).toHaveBeenCalled();
    });

    it("releases by deleting the key", async () => {
      delMock.mockResolvedValue(1);
      const { releaseRefreshLock } = await loadModule();
      await releaseRefreshLock();
      expect(delMock).toHaveBeenCalledWith("price-refresh:lock");
    });

    it("swallows errors on release", async () => {
      delMock.mockRejectedValue(new Error("boom"));
      const { releaseRefreshLock } = await loadModule();
      await expect(releaseRefreshLock()).resolves.toBeUndefined();
    });
  });
});
