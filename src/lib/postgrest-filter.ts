/**
 * Sanitize a user-supplied search term for safe interpolation into a PostgREST
 * filter string (e.g. the value inside a `.or("col.ilike.%<term>%")` clause).
 *
 * PostgREST parses `.or()` as a comma-separated list of `column.operator.value`
 * conditions, with parentheses for grouping. Left unescaped, characters in user
 * input can break out of the value and inject additional filter conditions or
 * alter the query structure:
 *   - `,` separates conditions   → can append arbitrary filters
 *   - `(` `)` group conditions   → can restructure the boolean logic
 *   - `"` quotes reserved values → can terminate a quoted value early
 *   - `\` `%` `_` `*` are LIKE/PostgREST wildcards → wildcard injection
 *
 * These characters carry no meaning for a stock name/symbol search, so we strip
 * them entirely rather than attempting fragile in-band escaping.
 */
const POSTGREST_META_CHARS = /[,()"\\%_*]/g;

export function sanitizePostgrestSearch(input: string): string {
  return input.replace(POSTGREST_META_CHARS, "").trim();
}
