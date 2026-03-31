import { Suspense } from "react";
import { RankedPanel } from "@/components/RankedPanel";
import { Skeleton } from "@/components/ui/skeleton";

function RankedFeedSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2" aria-busy="true" aria-label="Loading feed">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function RankedPage() {
  return (
    <Suspense fallback={<RankedFeedSkeleton />}>
      <RankedPanel />
    </Suspense>
  );
}
