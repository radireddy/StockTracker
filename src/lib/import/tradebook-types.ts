import type { BrokerType, ParseError } from "./types";
import type { CorporateActionCandidate } from "./corporate-action-detect";

export type { ParseError };

/** Max trade rows allowed in a single file import. */
export const MAX_TRADES_PER_IMPORT = 10_000;

/** One trade row parsed from a broker tradebook file. */
export interface ParsedTrade {
  symbol: string;
  isin: string;
  trade_date: string;        // YYYY-MM-DD
  exchange: string;
  segment: string;
  series: string | null;
  trade_type: "buy" | "sell";
  is_auction: boolean;
  quantity: number;
  price: number;
  broker_trade_id: string;
  broker_order_id: string | null;
  executed_at: string | null; // ISO timestamp or null
}

export interface TradebookMetadata {
  broker: BrokerType;
  client_id: string | null;
  account_label: string | null;
  date_from: string | null;  // YYYY-MM-DD
  date_to: string | null;    // YYYY-MM-DD
}

export interface TradebookParseResult {
  trades: ParsedTrade[];
  metadata: TradebookMetadata;
  errors: ParseError[];
}

/** Interface every broker tradebook adapter must implement. */
export interface TradebookAdapter {
  readonly broker: BrokerType;
  readonly displayName: string;
  readonly acceptedFileTypes: string;
  readonly description: string;
  canParse(buffer: ArrayBuffer): boolean;
  parse(buffer: ArrayBuffer): TradebookParseResult;
}

/** Shape the FIFO engine receives — hydrated with DB-assigned UUIDs. */
export interface RawTradeForFifo {
  id: string;           // UUID assigned by the DB
  isin: string;
  stock_id: string | null;
  trade_date: string;   // YYYY-MM-DD
  trade_type: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string | null;
}

/** One FIFO-matched buy↔sell pairing, ready for bulk insert. */
export interface LotMatch {
  user_id: string;
  account_id: string;
  stock_id: string | null;
  isin: string;
  buy_trade_id: string;
  sell_trade_id: string;
  matched_quantity: number;
  buy_date: string;
  sell_date: string;
  buy_price: number;
  sell_price: number;
  realized_pnl: number;
  holding_days: number;
  is_intraday: boolean;
  is_long_term: boolean;
}

/** One file's outcome within a multi-file batch import. */
export interface BatchFileResult {
  file_name: string;
  status: "imported" | "failed";
  imported_count: number;
  skipped_count: number;
  account_label: string | null;
  /** Present only when status is "failed". */
  error: string | null;
}

/** A corporate action that was auto-applied during import (verified against NSE reference). */
export interface AppliedCorporateAction {
  symbol: string;
  action_type: "split" | "bonus";
  factor: number;
  ex_date: string;
  source: "nse";
}

/** A candidate corporate action that could not be auto-applied (inferred or unexplained). */
export type PendingCorporateAction = CorporateActionCandidate & {
  status: "inferred" | "unexplained";
};

/** Aggregate result of a multi-file batch import. */
export interface BatchImportResult {
  files: BatchFileResult[];
  total_imported: number;
  total_skipped: number;
  accounts_recomputed: number;
  corporate_actions: {
    applied: AppliedCorporateAction[];
    pending: PendingCorporateAction[];
  };
}

/** Returned by the import engine after processing one file. */
export interface TradebookImportResult {
  status: "completed" | "failed" | "partial";
  account_id: string;
  account_label: string;
  imported_count: number;   // new rows inserted
  skipped_count: number;    // already existed (idempotent)
  error_count: number;
  total_rows: number;
  date_from: string | null;
  date_to: string | null;
  errors: Array<{ row?: number; symbol?: string; message: string }>;
}

/** One open position row returned by getOpenPositions(). */
export interface OpenPosition {
  isin: string;
  stock_id: string | null;
  symbol: string;
  name: string | null;
  sector: string | null;
  quantity: number;
  avg_buy_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  pnl_pct: number | null;
}

/** One open lot row returned by getOpenLotsForStock(). */
export interface OpenLot {
  id: string;
  account_id: string;
  account_label: string;
  broker: string;
  trade_date: string;
  original_qty: number;
  remaining_qty: number;
  buy_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  pnl_pct: number | null;
  holding_days: number;
  /** null when holding_days < 7 */
  cagr: number | null;
  broker_trade_id: string;
}
