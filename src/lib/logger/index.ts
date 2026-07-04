export type { Logger, LogContext, LogLevel } from "./types";

// --- Provider selection ---
// To swap providers, change this import to a different provider.
// e.g., import { createConsoleLogger as createProvider } from "./providers/console";
import { createAxiomLogger as createProvider } from "./providers/axiom";
import { createConsoleLogger } from "./providers/console";
import type { LogContext } from "./types";

const isAxiomConfigured =
  typeof process !== "undefined" &&
  !!process.env.NEXT_PUBLIC_AXIOM_DATASET;

export function createLogger(context?: LogContext) {
  return isAxiomConfigured ? createProvider(context) : createConsoleLogger(context);
}

export const logger = createLogger();
