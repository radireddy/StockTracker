import { detectBroker, getBrokerAdapter } from "./broker-registry";
import { MAX_HOLDINGS_PER_IMPORT, type BrokerAdapter, type BrokerType, type HoldingsParseResult } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "parse-statement" });

const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

export type ParsedStatement =
  | { ok: true; adapter: BrokerAdapter; parseResult: HoldingsParseResult }
  | { ok: false; status: number; error: string };

/**
 * Validate and parse a holdings statement buffer WITHOUT writing anything.
 * Shared by the import commit route and the parse-only detect route so both
 * apply exactly the same file checks (magic bytes, size cap, broker detection,
 * empty check, and the per-statement stock limit).
 */
export function parseStatementBuffer(buffer: ArrayBuffer, brokerHint: BrokerType | null): ParsedStatement {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!isZip) {
    return { ok: false, status: 400, error: "Invalid file format. Please upload a valid .xlsx file." };
  }
  if (buffer.byteLength > MAX_IMPORT_SIZE) {
    return { ok: false, status: 400, error: "File too large. Maximum import file size is 5MB." };
  }

  const adapter = brokerHint ? getBrokerAdapter(brokerHint) : detectBroker(buffer);
  if (!adapter) {
    return {
      ok: false,
      status: 400,
      error: "Could not identify the broker format. Ensure the file is a valid holdings statement.",
    };
  }

  let parseResult: HoldingsParseResult;
  try {
    parseResult = adapter.parse(buffer);
  } catch (err) {
    log.error("Parse failed", { broker: adapter.broker, error: (err as Error).message });
    return { ok: false, status: 400, error: `Failed to parse ${adapter.displayName} holdings statement.` };
  }

  if (parseResult.holdings.length === 0) {
    const fatal = parseResult.errors.find((e) => e.severity === "error");
    return { ok: false, status: 400, error: fatal?.message ?? "No equity holdings found in the file." };
  }

  if (parseResult.holdings.length > MAX_HOLDINGS_PER_IMPORT) {
    return {
      ok: false,
      status: 400,
      error: `This statement has ${parseResult.holdings.length} stocks, which exceeds the current limit of ${MAX_HOLDINGS_PER_IMPORT} per import.`,
    };
  }

  return { ok: true, adapter, parseResult };
}
