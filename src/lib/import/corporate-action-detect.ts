import { securityKey, adjustQtyPrice, type CorporateActionContext } from "./corporate-actions";
import type { TradeForOpenPositions } from "./open-positions";

const PLAUSIBLE = [1.5, 2, 2.5, 3, 4, 5, 10];
const TOL = 0.03;

export function snapFactor(raw: number): number | null {
  let best: number | null = null;
  let bestErr = Infinity;
  for (const f of PLAUSIBLE) {
    const err = Math.abs(raw - f) / f;
    if (err <= TOL && err < bestErr) { best = f; bestErr = err; }
  }
  return best;
}

export interface SecurityTrades {
  symbol: string;
  stock_id: string | null;
  isin: string;
  account_id: string;
  trades: TradeForOpenPositions[];
  holdingsQty: number | null;
}

export interface CorporateActionCandidate {
  stock_id: string | null;
  symbol: string;
  isin: string;
  account_id: string;
  action_type: "split" | "bonus";
  factor: number;
  ex_date_window: { from: string; to: string };
  observed: { buys: number; sells: number; fifoOpen: number; holdings: number | null };
  status: "inferred" | "unexplained";
  matched_stock_ids?: string[];
}

const num = (v: number) => (typeof v === "number" ? v : Number(v));

/** Adjusted buy/sell totals under the currently-known CA context. */
function totals(sec: SecurityTrades, ca: CorporateActionContext) {
  let buys = 0, sells = 0;
  for (const t of sec.trades) {
    const key = securityKey(t.stock_id, t.isin, ca.canonicalMap);
    const { qty } = adjustQtyPrice(num(t.quantity), num(t.price), t.trade_date, ca.actionsBySecurity.get(key) ?? []);
    if (t.trade_type === "buy") buys += qty; else sells += qty;
  }
  return { buys, sells };
}

export function detectCorporateActions(
  securities: SecurityTrades[],
  ca: CorporateActionContext
): CorporateActionCandidate[] {
  const out: CorporateActionCandidate[] = [];
  for (const sec of securities) {
    const { buys, sells } = totals(sec, ca);
    const fifoOpen = Math.max(0, buys - sells);
    const distinctStockIds = [...new Set(sec.trades.map((tt) => tt.stock_id).filter((v): v is string => v != null))];

    // Signal A — oversold: sold more than bought ⇒ a multiplier is missing.
    if (sells > buys + 1e-6 && buys > 0) {
      const snapped = snapFactor(sells / buys);
      const dates = sec.trades.map((t) => t.trade_date).sort();
      const candidate: CorporateActionCandidate = {
        stock_id: sec.stock_id, symbol: sec.symbol, isin: sec.isin, account_id: sec.account_id,
        action_type: "split", factor: snapped ?? sells / buys,
        ex_date_window: { from: dates[0], to: dates[dates.length - 1] },
        observed: { buys, sells, fifoOpen, holdings: sec.holdingsQty },
        status: snapped != null && Math.abs(buys * snapped - sells) < Math.max(1, buys * 0.01) ? "inferred" : "unexplained",
        matched_stock_ids: distinctStockIds.length > 1 ? distinctStockIds : undefined,
      };
      out.push(candidate);
    }
    // Signal B — holdings mismatch (still-held): FIFO-open != holdings by a clean ratio.
    else if (sec.holdingsQty != null && sec.holdingsQty > 0 && fifoOpen > 0) {
      const ratio = sec.holdingsQty / fifoOpen;
      const snapped = snapFactor(ratio);
      if (snapped != null && Math.abs(fifoOpen * snapped - sec.holdingsQty) < Math.max(1, fifoOpen * 0.01)) {
        const dates = sec.trades.map((tt) => tt.trade_date).sort();
        out.push({
          stock_id: sec.stock_id, symbol: sec.symbol, isin: sec.isin, account_id: sec.account_id,
          action_type: "split", factor: snapped,
          ex_date_window: { from: dates[0], to: dates[dates.length - 1] },
          observed: { buys, sells, fifoOpen, holdings: sec.holdingsQty },
          status: "inferred",
          matched_stock_ids: distinctStockIds.length > 1 ? distinctStockIds : undefined,
        });
      }
    }
  }
  return out;
}
