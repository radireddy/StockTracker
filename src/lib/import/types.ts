/**
 * Broker Holdings Import Abstraction
 *
 * A holdings statement is a *snapshot* of positions per stock (already netted),
 * so there is no trade reconstruction / FIFO. Each broker adapter parses its
 * statement into a normalized ParsedHolding[] plus statement metadata.
 */

/** Max stocks allowed in a single statement import (raise later). */
export const MAX_HOLDINGS_PER_IMPORT = 100;

/** A normalized position row from any broker holdings statement. */
export interface ParsedHolding {
  symbol: string;
  isin: string;
  sector: string | null;
  quantity: number;
  avg_price: number;
}

/** Result from parsing a broker holdings statement. */
export interface HoldingsParseResult {
  holdings: ParsedHolding[];
  metadata: BrokerMetadata;
  errors: ParseError[];
}

/** Broker-specific metadata extracted from the statement. */
export interface BrokerMetadata {
  broker: BrokerType;
  client_id: string | null;
  account_label: string | null;  // suggested label, e.g. "AB1234 (Zerodha)"
  statement_date: string | null; // YYYY-MM-DD, from "…as on 2025-03-31"
}

/** Parse error with context. */
export interface ParseError {
  row?: number;
  symbol?: string;
  message: string;
  severity: "warning" | "error";
}

/** Supported broker types. */
export type BrokerType = "zerodha" | "groww" | "angelone" | "upstox";

/** Interface every broker adapter must implement. */
export interface BrokerAdapter {
  readonly broker: BrokerType;
  readonly displayName: string;
  readonly acceptedFileTypes: string;
  readonly description: string;

  /** Detect if a file belongs to this broker (quick header check). */
  canParse(buffer: ArrayBuffer): boolean;

  /** Parse the holdings statement into normalized positions. */
  parse(buffer: ArrayBuffer): HoldingsParseResult;
}

/** Final import result returned by the engine. */
export interface ImportResult {
  status: "completed" | "failed";
  is_reimport: boolean;
  account_id: string;
  account_label: string;
  imported_count: number;
  skipped_count: number;
  companies_count: number;
  new_companies_created: string[];
  symbols_imported: string[];
  symbols_skipped: string[];
  statement_date: string | null;
  client_id: string | null;
  errors: Array<{ symbol?: string; message: string }>;
}
