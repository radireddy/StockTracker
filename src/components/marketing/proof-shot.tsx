import Image from "next/image";
import type { ReactNode } from "react";

/**
 * ProofShot — a "this is the actual product" surface framed in browser chrome
 * and shown below the faux-UI demo. It renders, in order of preference:
 *   1. `children` — a masked faux replica of a real screen (themes, no PII), or
 *   2. `src` — a static masked screenshot from `public/marketing/screenshots/`
 *      (a local asset, never a user upload — no upload/path-traversal surface), or
 *   3. a labeled placeholder with the capture brief so a page can ship early.
 */
export function ProofShot({
  children,
  src,
  alt,
  width = 1600,
  height = 1000,
  caption = "Real StockTracker screen — company names masked, figures illustrative.",
  placeholderSpec,
}: {
  /** A rendered masked replica of the real screen. Takes precedence over `src`. */
  children?: ReactNode;
  /** e.g. "/marketing/screenshots/watchlist-signal.png". Used when no children. */
  src?: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
  /** Capture brief shown in the placeholder until `children`/`src` is provided. */
  placeholderSpec?: string;
}) {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-5xl px-4 py-20">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/[0.03]">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-border" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-border" aria-hidden />
            <span className="ml-3 truncate text-[11px] text-muted-foreground">
              app.stocktracks.in
            </span>
          </div>
          <div className="overflow-x-auto">
            {children ? (
              children
            ) : src ? (
              <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                className="h-auto w-full"
                sizes="(max-width: 1024px) 100vw, 1024px"
              />
            ) : (
              <div
                role="img"
                aria-label={alt}
                className="flex min-h-[280px] flex-col items-center justify-center gap-3 bg-muted/30 p-8 text-center"
              >
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                  Screenshot placeholder
                </span>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  {placeholderSpec ?? alt}
                </p>
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">{caption}</p>
      </div>
    </section>
  );
}
