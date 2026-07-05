import { headers } from "next/headers";

/**
 * Renders one or more pre-serialized JSON-LD graphs inside nonce'd <script>
 * tags. Reuses the per-request CSP nonce (see src/lib/security/csp.ts).
 * `suppressHydrationWarning` because React strips the nonce on the client,
 * which would otherwise flag a benign hydration mismatch.
 */
export async function JsonLd({ graphs }: { graphs: string[] }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      {graphs.map((g, i) => (
        <script
          key={i}
          type="application/ld+json"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: g }}
        />
      ))}
    </>
  );
}
