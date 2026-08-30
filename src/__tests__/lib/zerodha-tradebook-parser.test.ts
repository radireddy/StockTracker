import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { zerodhaTradebookAdapter } from "@/lib/import/zerodha-tradebook-parser";

type TradeRow = [string, string, string, string, string, string, string, boolean, number, number, string, string, string];

/** Build a minimal Zerodha tradebook ArrayBuffer in memory. */
function buildZerodhaTradebook(
  rows: TradeRow[],
  clientId = "XD6134",
  dateFrom = "2026-04-01",
  dateTo = "2026-08-30"
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const data: unknown[][] = [
    [], [], [], [], [],                                              // rows 0-4 blank
    ["Client ID", clientId],                                        // row 5
    [], [], [],                                                     // rows 6-8 blank
    [`Tradebook for Equity from ${dateFrom} to ${dateTo}`],         // row 9
    [], [], [], [],                                                 // rows 10-13
    // header at row index 14:
    ["Symbol","ISIN","Trade Date","Exchange","Segment","Series","Trade Type","Auction","Quantity","Price","Trade ID","Order ID","Order Execution Time"],
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Equity");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return buf as ArrayBuffer;
}

describe("zerodhaTradebookAdapter.canParse", () => {
  it("returns true for a valid Zerodha tradebook", () => {
    const buf = buildZerodhaTradebook([]);
    expect(zerodhaTradebookAdapter.canParse(buf)).toBe(true);
  });

  it("returns false for a file with no Equity sheet", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["some data"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(zerodhaTradebookAdapter.canParse(buf)).toBe(false);
  });

  it("returns false for a Zerodha holdings file (no 'Tradebook for Equity' header)", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Client ID", "XD6134"],
      [],
      ["Holdings Statement as on 2026-03-31"],
      ["Symbol","ISIN","Quantity Available"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Equity");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(zerodhaTradebookAdapter.canParse(buf)).toBe(false);
  });
});

describe("zerodhaTradebookAdapter.parse — metadata", () => {
  it("extracts client_id from the header row", () => {
    const buf = buildZerodhaTradebook([]);
    const { metadata } = zerodhaTradebookAdapter.parse(buf);
    expect(metadata.client_id).toBe("XD6134");
  });

  it("extracts date_from and date_to from the Tradebook header", () => {
    const buf = buildZerodhaTradebook([], "XD6134", "2025-04-01", "2026-03-31");
    const { metadata } = zerodhaTradebookAdapter.parse(buf);
    expect(metadata.date_from).toBe("2025-04-01");
    expect(metadata.date_to).toBe("2026-03-31");
  });

  it("sets account_label to '<clientId> (Zerodha)'", () => {
    const buf = buildZerodhaTradebook([]);
    const { metadata } = zerodhaTradebookAdapter.parse(buf);
    expect(metadata.account_label).toBe("XD6134 (Zerodha)");
  });

  it("sets broker to 'zerodha'", () => {
    const buf = buildZerodhaTradebook([]);
    const { metadata } = zerodhaTradebookAdapter.parse(buf);
    expect(metadata.broker).toBe("zerodha");
  });
});

describe("zerodhaTradebookAdapter.parse — trades", () => {
  it("parses a buy trade correctly", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-04-01","NSE","EQ","EQ","buy",false,199,1355,"200083793","1100000000307034","2026-04-01T09:06:11"],
    ]);
    const { trades } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.symbol).toBe("GRAVITA");
    expect(t.isin).toBe("INE024L01027");
    expect(t.trade_date).toBe("2026-04-01");
    expect(t.trade_type).toBe("buy");
    expect(t.quantity).toBe(199);
    expect(t.price).toBe(1355);
    expect(t.broker_trade_id).toBe("200083793");
    expect(t.broker_order_id).toBe("1100000000307034");
    expect(t.is_auction).toBe(false);
    expect(t.exchange).toBe("NSE");
    expect(t.segment).toBe("EQ");
  });

  it("parses a sell trade correctly", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-05-01","NSE","EQ","EQ","sell",false,100,1500,"200083800","1100000000307099","2026-05-01T14:30:00"],
    ]);
    const { trades } = zerodhaTradebookAdapter.parse(buf);
    expect(trades[0].trade_type).toBe("sell");
  });

  it("skips rows with quantity 0", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-04-01","NSE","EQ","EQ","buy",false,0,1355,"TID1","OID1","2026-04-01T09:00:00"],
      ["HDFC","INE040A01034","2026-04-02","NSE","EQ","EQ","buy",false,10,1400,"TID2","OID2","2026-04-02T09:00:00"],
    ]);
    const { trades, errors } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe("HDFC");
    expect(errors.some((e) => e.symbol === "GRAVITA")).toBe(true);
  });

  it("skips rows where segment is not EQ", () => {
    const buf = buildZerodhaTradebook([
      ["NIFTY24NOV","","2026-04-01","NSE","FO","","buy",false,50,22000,"TID1","OID1","2026-04-01T09:00:00"],
      ["RELIANCE","INE002A01018","2026-04-02","NSE","EQ","EQ","buy",false,10,2900,"TID2","OID2","2026-04-02T09:00:00"],
    ]);
    const { trades } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe("RELIANCE");
  });

  it("returns multiple trades in order", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-04-01","NSE","EQ","EQ","buy",false,100,1355,"TID1","OID1","2026-04-01T09:00:00"],
      ["HDFC","INE040A01034","2026-04-02","NSE","EQ","EQ","sell",false,50,1600,"TID2","OID2","2026-04-02T10:00:00"],
    ]);
    const { trades } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(2);
    expect(trades[0].symbol).toBe("GRAVITA");
    expect(trades[1].symbol).toBe("HDFC");
  });

  it("returns a fatal error when file has > MAX_TRADES_PER_IMPORT rows", () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => [
      "SYM", "INE001A01036", "2026-04-01", "NSE", "EQ", "EQ", "buy", false, 1, 100, `TID${i}`, `OID${i}`, "2026-04-01T09:00:00",
    ] as TradeRow);
    const buf = buildZerodhaTradebook(rows);
    const { trades, errors } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(0);
    expect(errors.some((e) => e.severity === "error" && /10,000/.test(e.message))).toBe(true);
  });

  it("returns error when no Equity sheet is present", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["data"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { trades, errors } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(0);
    expect(errors.some((e) => e.severity === "error")).toBe(true);
  });

  it("skips rows with unknown trade type and records a warning", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-04-01","NSE","EQ","EQ","SHORT",false,100,1355,"TID1","OID1","2026-04-01T09:00:00"],
      ["HDFC","INE040A01034","2026-04-02","NSE","EQ","EQ","buy",false,10,1400,"TID2","OID2","2026-04-02T09:00:00"],
    ]);
    const { trades, errors } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe("HDFC");
    expect(errors.some((e) => e.severity === "warning" && /SHORT/.test(e.message))).toBe(true);
  });
});

describe("zerodhaTradebookAdapter — broker registry", () => {
  it("detectTradebookBroker returns the zerodha adapter for a valid tradebook", async () => {
    const { detectTradebookBroker } = await import("@/lib/import/tradebook-broker-registry");
    const buf = buildZerodhaTradebook([]);
    const adapter = detectTradebookBroker(buf);
    expect(adapter).not.toBeNull();
    expect(adapter?.broker).toBe("zerodha");
  });

  it("detectTradebookBroker returns null for an unrecognised file", async () => {
    const { detectTradebookBroker } = await import("@/lib/import/tradebook-broker-registry");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["random"]]), "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(detectTradebookBroker(buf)).toBeNull();
  });

  it("getAllTradebookAdapters returns at least one adapter", async () => {
    const { getAllTradebookAdapters } = await import("@/lib/import/tradebook-broker-registry");
    expect(getAllTradebookAdapters().length).toBeGreaterThan(0);
  });
});
