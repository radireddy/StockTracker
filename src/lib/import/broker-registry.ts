import type { BrokerAdapter, BrokerType } from "./types";
import { zerodhaHoldingsAdapter } from "./zerodha-holdings-parser";

/**
 * Registry of all supported broker holdings adapters.
 * To add a new broker: create an adapter file and register here.
 */
const adapters: BrokerAdapter[] = [zerodhaHoldingsAdapter];

export function getBrokerAdapter(broker: BrokerType): BrokerAdapter | null {
  return adapters.find((a) => a.broker === broker) ?? null;
}

export function getAllBrokerAdapters(): BrokerAdapter[] {
  return [...adapters];
}

/** Auto-detect broker from file contents. */
export function detectBroker(buffer: ArrayBuffer): BrokerAdapter | null {
  for (const adapter of adapters) {
    if (adapter.canParse(buffer)) return adapter;
  }
  return null;
}
