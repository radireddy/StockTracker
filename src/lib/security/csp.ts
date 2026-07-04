/**
 * Content-Security-Policy construction.
 *
 * The policy is nonce-based: the proxy mints a fresh nonce per request, Next.js
 * stamps it onto every framework `<script>`, and our own inline script reads it
 * back from the `x-nonce` header. In production `'strict-dynamic'` lets those
 * nonce'd scripts load the chunk graph while host-based script sources are
 * ignored — so there is no `'unsafe-inline'`/`'unsafe-eval'` in `script-src`.
 *
 * Dev is deliberately looser: React Fast Refresh and webpack HMR inject inline
 * scripts without a nonce and rely on `eval`, so we allow those and the HMR
 * websocket only when running locally.
 */

export interface CspOptions {
  /** Per-request nonce, base64 encoded. */
  nonce: string;
  /** True when running the dev server (looser policy for HMR/Fast Refresh). */
  isDev: boolean;
  /** Public Supabase project URL the browser talks to (REST + realtime). */
  supabaseUrl?: string;
}

/** Generate a cryptographically random, base64-encoded CSP nonce. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Build the `Content-Security-Policy` header value for a request. */
export function buildContentSecurityPolicy({
  nonce,
  isDev,
  supabaseUrl,
}: CspOptions): string {
  // Supabase realtime uses a websocket on the same host over wss.
  const supabaseWs =
    supabaseUrl && supabaseUrl.startsWith("https://")
      ? supabaseUrl.replace(/^https:/, "wss:")
      : undefined;

  const scriptSrc = isDev
    ? // Fast Refresh + webpack eval need these; only in dev.
      ["'self'", "'unsafe-eval'", "'unsafe-inline'"]
    : ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];

  const connectSrc = [
    "'self'",
    supabaseUrl,
    supabaseWs,
    // Local HMR websocket.
    ...(isDev ? ["ws:", "wss:"] : []),
  ].filter(Boolean);

  const directives: Record<string, string[] | null> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "script-src": scriptSrc,
    // Framework and next/font inject inline <style>; nonces don't cover them
    // reliably. Styles cannot execute script, so inline styles are low risk.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Rich-text lets users paste arbitrary image URLs; images are non-executing.
    "img-src": ["'self'", "blob:", "data:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connectSrc as string[],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    // upgrade-insecure-requests is a valueless directive; represented as [].
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  };

  return Object.entries(directives)
    .map(([name, values]) =>
      values && values.length > 0 ? `${name} ${values.join(" ")}` : name
    )
    .join("; ");
}
