import type { TradebookAdapter } from "./tradebook-types";
import { zerodhaTradebookAdapter } from "./zerodha-tradebook-parser";

const adapters: TradebookAdapter[] = [zerodhaTradebookAdapter];

export function detectTradebookBroker(buffer: ArrayBuffer): TradebookAdapter | null {
  return adapters.find((a) => a.canParse(buffer)) ?? null;
}

export function getAllTradebookAdapters(): TradebookAdapter[] {
  return [...adapters];
}
