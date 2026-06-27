/**
 * Broker Import Abstraction
 *
 * Architecture:
 * - BrokerAdapter: Interface that each broker implements (Zerodha, Groww, etc.)
 * - ParsedTrade: Normalized trade format all brokers produce
 * - GroupedTrade: Trades grouped by symbol+date+price+type for efficient insertion
 * - ImportEngine: Orchestrates parsing, validation, grouping, and DB operations
 */

/** Raw normalized trade from any broker */
export interface ParsedTrade {
  symbol: string;
  isin: string;
  trade_date: string; // YYYY-MM-DD
  exchange: string;
  trade_type: "buy" | "sell";
  quantity: number;
  price: number;
  trade_id: string; // Unique per execution (from broker)
  order_id: string;
  execution_time: string; // ISO datetime
}

/** Grouped trades for efficient batch insertion */
export interface GroupedTrade {
  symbol: string;
  isin: string;
  trade_date: string;
  exchange: string;
  trade_type: "BUY" | "SELL";
  total_quantity: number;
  avg_price: number;
  trade_ids: string[];
  order_ids: string[];
  earliest_execution_time: string;
}

/** Result from parsing a broker tradebook */
export interface BrokerParseResult {
  trades: ParsedTrade[];
  metadata: BrokerMetadata;
  errors: ParseError[];
}

/** Broker-specific metadata extracted from the file */
export interface BrokerMetadata {
  broker: BrokerType;
  client_id: string | null;
  account_label: string | null; // user-friendly label like "YY7859 (Zerodha)"
  date_range: string | null;
}

/** Parse error with context */
export interface ParseError {
  row?: number;
  symbol?: string;
  message: string;
  severity: "warning" | "error";
}

/** Supported broker types */
export type BrokerType = "zerodha" | "groww" | "angelone" | "upstox";

/** Interface every broker adapter must implement */
export interface BrokerAdapter {
  readonly broker: BrokerType;
  readonly displayName: string;
  readonly acceptedFileTypes: string;
  readonly description: string;

  /** Detect if a file belongs to this broker (quick header check) */
  canParse(buffer: ArrayBuffer): boolean;

  /** Parse the tradebook into normalized trades */
  parse(buffer: ArrayBuffer): BrokerParseResult;
}

/** Import job progress tracked in the DB */
export interface ImportProgress {
  total_groups: number;
  processed_groups: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
}

/** Final import result */
export interface ImportResult {
  status: "completed" | "failed";
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  new_companies_created: string[];
  symbols_imported: string[];
  symbols_skipped: string[];
  symbols_failed: string[];
  symbols_incomplete_history: string[];
  errors: Array<{ symbol?: string; message: string }>;
}
