"use client";

import { useEffect } from "react";

import { logger } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Page error boundary caught error", {
      boundary: "app/error",
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-soft">
        <h2 className="mb-2 text-xl font-semibold text-foreground">Something went wrong</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          An error occurred while loading this page.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
