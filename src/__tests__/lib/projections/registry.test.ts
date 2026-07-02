import { describe, it, expect } from "vitest";
import {
  getStrategy,
  getAvailableTypes,
  getAvailableTypesExcluding,
} from "@/lib/projections/registry";

describe("getStrategy", () => {
  it("returns PE/Earnings strategy", () => {
    const strategy = getStrategy("pe_earnings");
    expect(strategy.type).toBe("pe_earnings");
    expect(strategy.label).toBe("PE / Earnings");
  });

  it("returns EV/EBITDA strategy", () => {
    const strategy = getStrategy("ev_ebitda");
    expect(strategy.type).toBe("ev_ebitda");
    expect(strategy.label).toBe("EV / EBITDA");
  });

  it("throws for unknown type", () => {
    expect(() => getStrategy("unknown" as any)).toThrow("Unknown projection type");
  });
});

describe("getAvailableTypes", () => {
  it("returns all available types", () => {
    const types = getAvailableTypes();
    expect(types).toHaveLength(2);
    const typeNames = types.map((t) => t.type);
    expect(typeNames).toContain("pe_earnings");
    expect(typeNames).toContain("ev_ebitda");
  });

  it("returns objects with type and label", () => {
    const types = getAvailableTypes();
    for (const t of types) {
      expect(t).toHaveProperty("type");
      expect(t).toHaveProperty("label");
    }
  });
});

describe("getAvailableTypesExcluding", () => {
  it("excludes specified types", () => {
    const types = getAvailableTypesExcluding(["pe_earnings"]);
    expect(types).toHaveLength(1);
    expect(types[0].type).toBe("ev_ebitda");
  });

  it("returns all when excluding nothing", () => {
    const types = getAvailableTypesExcluding([]);
    expect(types).toHaveLength(2);
  });

  it("returns empty when all excluded", () => {
    const types = getAvailableTypesExcluding(["pe_earnings", "ev_ebitda"]);
    expect(types).toHaveLength(0);
  });
});
