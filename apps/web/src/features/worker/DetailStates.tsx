import { Skeleton } from "@/components/ui/skeleton";

const TIMELINE_SKELETON_KEYS = ["t1", "t2", "t3", "t4", "t5"] as const;

export function DetailLoadingSkeleton() {
  return (
    <div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <Skeleton className="mt-6 h-32 w-full rounded-lg" />
      <div className="mt-6 flex flex-col gap-2">
        {TIMELINE_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}
