export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms when window resets
}

export interface RateLimitStore {
  /** Check and consume one token. Returns result. */
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key prefix to namespace limits */
  prefix?: string;
}
