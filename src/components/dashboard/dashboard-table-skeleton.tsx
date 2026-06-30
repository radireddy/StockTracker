import { Skeleton } from "@/components/ui/skeleton";

function SkeletonRow() {
  return (
    <tr className="border-b border-border/20">
      <td className="px-3 py-2.5"><Skeleton className="h-4 w-4" /></td>
      <td className="px-3 py-2.5"><Skeleton className="h-4 w-28" /></td>
      <td className="px-3 py-2.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
      <td className="px-3 py-2.5 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
      <td className="px-3 py-2.5 text-center"><Skeleton className="h-4 w-16 mx-auto" /></td>
      <td className="px-3 py-2.5 text-center"><Skeleton className="h-4 w-14 mx-auto" /></td>
      <td className="px-3 py-2.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
      <td className="px-3 py-2.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
      <td className="px-3 py-2.5 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
      <td className="px-3 py-2.5"><Skeleton className="h-4 w-6 mx-auto" /></td>
    </tr>
  );
}

export function DashboardTableSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-3 py-2.5 w-8"><Skeleton className="h-4 w-4" /></th>
            <th className="text-left px-3 py-2.5"><Skeleton className="h-4 w-20" /></th>
            <th className="text-right px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></th>
            <th className="text-right px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></th>
            <th className="text-center px-3 py-2.5"><Skeleton className="h-4 w-12 mx-auto" /></th>
            <th className="text-center px-3 py-2.5"><Skeleton className="h-4 w-14 mx-auto" /></th>
            <th className="text-right px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></th>
            <th className="text-right px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></th>
            <th className="text-right px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></th>
            <th className="px-3 py-2.5 w-10"><Skeleton className="h-4 w-6 mx-auto" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PortfolioPnlBarSkeleton() {
  return <Skeleton className="h-10 w-full rounded-lg" />;
}
