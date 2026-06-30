import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  getBrokerAdapter,
  getAllBrokerAdapters,
  detectBroker,
} from "@/lib/import/broker-registry";

describe("getBrokerAdapter", () => {
  it("returns zerodha adapter", () => {
    const adapter = getBrokerAdapter("zerodha");
    expect(adapter).not.toBeNull();
    expect(adapter!.broker).toBe("zerodha");
  });

  it("returns null for unregistered broker", () => {
    expect(getBrokerAdapter("groww")).toBeNull();
  });
});

describe("getAllBrokerAdapters", () => {
  it("returns array of adapters", () => {
    const adapters = getAllBrokerAdapters();
    expect(adapters).toHaveLength(1);
    expect(adapters[0].broker).toBe("zerodha");
  });

  it("returns a copy (not the internal array)", () => {
    const a1 = getAllBrokerAdapters();
    const a2 = getAllBrokerAdapters();
    expect(a1).not.toBe(a2);
  });
});

describe("detectBroker", () => {
  it("returns null for invalid buffer", () => {
    const buffer = new ArrayBuffer(8);
    expect(detectBroker(buffer)).toBeNull();
  });

  it("returns null for empty buffer", () => {
    const buffer = new ArrayBuffer(0);
    expect(detectBroker(buffer)).toBeNull();
  });

  it("detects Zerodha from valid tradebook buffer", () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Client ID", "YY7859"],
      [],
      ["Symbol", "ISIN", "Trade Date"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Equity");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const adapter = detectBroker(buf);
    expect(adapter).not.toBeNull();
    expect(adapter!.broker).toBe("zerodha");
  });
});
