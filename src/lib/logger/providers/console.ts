import type { Logger, LogContext, LogLevel } from "../types";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class ConsoleLogger implements Logger {
  private context: LogContext;
  private minLevel: LogLevel;

  constructor(context: LogContext = {}, minLevel?: LogLevel) {
    this.context = context;
    this.minLevel = minLevel ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger({ ...this.context, ...context }, this.minLevel);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...context,
    };

    const method = level === "debug" ? "log" : level;
    console[method](JSON.stringify(entry));
  }
}

export function createConsoleLogger(context?: LogContext): Logger {
  return new ConsoleLogger(context);
}
