/**
 * Suspense fallback for the authenticated shell. Rendered while <ShellData>'s
 * profile/portfolio queries resolve. Its job is to let the document <head> and
 * asset preloads flush immediately; it approximates the AppHeader (h-14 sticky
 * bar) to minimize layout shift when the real chrome hydrates in.
 */
export function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-4">
          <span className="mr-6 font-bold text-primary">StockTracker</span>
          <div className="ml-auto h-8 w-8 animate-pulse rounded-full bg-muted" />
        </div>
      </header>
      <main className="px-4 md:px-8 py-4">
        <div
          role="status"
          aria-live="polite"
          className="mx-auto max-w-[95vw] xl:max-w-[1600px] space-y-3"
        >
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="h-64 w-full animate-pulse rounded bg-muted" />
          <span className="sr-only">Loading…</span>
        </div>
      </main>
    </div>
  );
}
