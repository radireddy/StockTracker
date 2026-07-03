import { toast } from "sonner";
import type { ActionResult } from "./action-result";

type FailResult = { ok: false; error: string; hint?: string };

function isFailResult(x: unknown): x is FailResult {
  return (
    !!x &&
    typeof x === "object" &&
    (x as { ok?: unknown }).ok === false &&
    typeof (x as { error?: unknown }).error === "string"
  );
}

// Production Server Actions redact thrown error messages to a generic string.
// Detect that so we can show friendly copy instead of the leaked internals.
const REDACTED_RE = /server components render|an unexpected response|omitted in production|digest/i;

const DEFAULT_HINT = "Please try again. If the problem continues, contact support.";

/**
 * Surface an error to the user as a toast with a human-readable message, a
 * suggested next step, and (optionally) a Retry button.
 *
 * Accepts either an {@link ActionResult} failure (from a mutation) or a thrown
 * error (from a read). Pass `message` to override the headline — useful for load
 * failures, e.g. `toastError(err, { message: "Couldn't load your accounts", retry })`.
 */
export function toastError(
  source: unknown,
  opts: { message?: string; hint?: string; retry?: () => void } = {}
): void {
  let derivedMessage = "Something went wrong.";
  let derivedHint: string | undefined;

  if (isFailResult(source)) {
    derivedMessage = source.error;
    derivedHint = source.hint;
  } else if (source instanceof Error && source.message && !REDACTED_RE.test(source.message)) {
    derivedMessage = source.message;
  }

  const message = opts.message ?? derivedMessage;
  const hint = opts.hint ?? derivedHint ?? DEFAULT_HINT;

  toast.error(message, {
    description: hint,
    action: opts.retry ? { label: "Retry", onClick: opts.retry } : undefined,
  });
}

/** Narrowing helper for callers that want to branch on a mutation result. */
export function isOk<T>(result: ActionResult<T>): result is { ok: true; data: T } {
  return result.ok;
}
