import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading company details…</span>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
