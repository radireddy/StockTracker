/**
 * Result type for server-action mutations.
 *
 * Server Actions that `throw` have their error message REDACTED to a generic
 * string in production (Next.js only lets a `digest` through). To reliably show
 * a human-readable reason — and a suggested next step — in the client, mutations
 * return an `ActionResult` instead: the message travels as plain data, so it
 * survives serialization untouched.
 *
 * Convention: commands (writes) return `ActionResult`; queries (reads) still
 * throw and are handled by the caller with a retry toast.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; hint?: string };

/**
 * An error carrying both a human-readable message and a suggested action the
 * user can take. Thrown inside action bodies and turned into an `ActionResult`
 * by {@link action}.
 */
export class AppError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "AppError";
    this.hint = hint;
  }
}

type DbError = { code?: string; message?: string } | null | undefined;

/**
 * Map a Supabase/Postgres error to an {@link AppError} with a friendly message
 * and a suggested next step, so raw messages like
 * "duplicate key value violates unique constraint" never reach the user.
 */
export function describeDbError(error: DbError, fallback = "Couldn't save your changes."): AppError {
  switch (error?.code) {
    case "23505":
      return new AppError("That already exists.", "Use a different value and try again.");
    case "23503":
      return new AppError(
        "A required related record is missing.",
        "Make sure the linked item still exists, then try again."
      );
    case "23514":
      return new AppError(
        "Some values are outside the allowed range.",
        "Check the highlighted fields and try again."
      );
    case "23502":
      return new AppError("A required value is missing.", "Fill in all required fields and try again.");
    case "42501":
      return new AppError(
        "You don't have permission to do that.",
        "Sign out and back in, or contact support if it continues."
      );
    case "PGRST301":
    case "401":
      return new AppError("Your session has expired.", "Please sign in again.");
    default:
      return new AppError(fallback, "Please try again. If the problem continues, contact support.");
  }
}

/**
 * Run a mutation body and convert its outcome into an `ActionResult`. The
 * try/catch runs on the server, BEFORE Next.js redaction, so an {@link AppError}
 * (or any Error) message is preserved as data in the returned object.
 */
export async function action<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, error: e.message, hint: e.hint };
    }
    const message = e instanceof Error && e.message ? e.message : "Something went wrong.";
    return {
      ok: false,
      error: message,
      hint: "Please try again. If the problem continues, contact support.",
    };
  }
}
