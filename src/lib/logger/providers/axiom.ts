import { Logger as AxiomLogger } from "next-axiom";
import type { Logger, LogContext } from "../types";

export class AxiomLoggerAdapter implements Logger {
  private axiom: AxiomLogger;
  private context: LogContext;

  constructor(axiom?: AxiomLogger, context: LogContext = {}) {
    this.axiom = axiom ?? new AxiomLogger();
    this.context = context;
  }

  debug(message: string, context?: LogContext): void {
    this.axiom.debug(message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.axiom.info(message, { ...this.context, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.axiom.warn(message, { ...this.context, ...context });
  }

  error(message: string, context?: LogContext): void {
    this.axiom.error(message, { ...this.context, ...context });
  }

  child(context: LogContext): Logger {
    return new AxiomLoggerAdapter(
      this.axiom.with({ ...this.context, ...context }),
      { ...this.context, ...context }
    );
  }
}

export function createAxiomLogger(context?: LogContext): Logger {
  return new AxiomLoggerAdapter(undefined, context);
}
