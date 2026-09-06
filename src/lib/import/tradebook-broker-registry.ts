import type { TradebookAdapter } from "./tradebook-types";
import { zerodhaTradebookAdapter } from "./zerodha-tradebook-parser";
import { zerodhaCsvTradebookAdapter } from "./zerodha-csv-tradebook-parser";

const adapters: TradebookAdapter[] = [
  zerodhaTradebookAdapter,
  zerodhaCsvTradebookAdapter,
];

export function detectTradebookBroker(buffer: ArrayBuffer): TradebookAdapter | null {
  return adapters.find((a) => a.canParse(buffer)) ?? null;
}

export function getAllTradebookAdapters(): TradebookAdapter[] {
  return [...adapters];
}
