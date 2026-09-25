import { Skeleton } from "@/components/ui/skeleton";

const META_SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;
const TIMELINE_SKELETON_KEYS = ["t1", "t2", "t3", "t4", "t5"] as const;

/**
 * 详情加载中的骨架：标题两条 → 元信息 6 格 → 时间线 5 行，形状对齐真实内容，减少加载完成后的布局跳动。
 * 这时 detail 还没到手，DetailHeader / MetaGrid 需要的字段都拿不到，所以单独画一套占位块，不复用真实组件。
 */
export function DetailLoadingSkeleton() {
  return (
    <div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-3/5 rounded-sm" />
        <Skeleton className="h-4 w-2/5 rounded-sm" />
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-6 gap-y-3 border-y border-line py-3 lg:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
        {META_SKELETON_KEYS.map((key) => (
          <div key={key} className="flex min-w-0 flex-col gap-0.5">
            <Skeleton className="h-2.5 w-2/5 rounded-sm" />
            <Skeleton className="h-3.5 w-7/10 rounded-sm" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {TIMELINE_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-5 w-full rounded-sm" />
        ))}
      </div>
    </div>
  );
}
