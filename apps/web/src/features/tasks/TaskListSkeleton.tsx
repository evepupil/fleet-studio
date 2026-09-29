import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROW_KEYS = [
  "skeleton-0",
  "skeleton-1",
  "skeleton-2",
  "skeleton-3",
  "skeleton-4",
  "skeleton-5",
  "skeleton-6",
  "skeleton-7",
  "skeleton-8",
  "skeleton-9",
];

function TaskListSkeleton({ count }: { count: number }) {
  return (
    <>
      {SKELETON_ROW_KEYS.slice(0, count).map((key) => (
        <tr key={key} className="h-10">
          <td className="border-b border-line py-0 pl-4 pr-2 align-middle">
            <Skeleton className="h-3.5 w-3.5" />
          </td>
          <td className="hidden border-b border-line px-2 align-middle md:table-cell">
            <Skeleton className="h-3.5 w-12" />
          </td>
          <td className="border-b border-line px-2 align-middle">
            <Skeleton className="h-3.5 w-3/4" />
          </td>
          <td className="hidden border-b border-line px-2 align-middle md:table-cell">
            <Skeleton className="h-3.5 w-24" />
          </td>
          <td className="hidden border-b border-line px-2 align-middle xl:table-cell">
            <Skeleton className="h-3.5 w-10" />
          </td>
          <td className="hidden border-b border-line px-2 align-middle lg:table-cell">
            <Skeleton className="h-3.5 w-10" />
          </td>
          <td className="hidden border-b border-line px-2 text-right align-middle lg:table-cell">
            <Skeleton className="ml-auto h-3.5 w-12" />
          </td>
          <td className="hidden border-b border-line px-2 text-right align-middle md:table-cell">
            <Skeleton className="ml-auto h-3.5 w-12" />
          </td>
          <td className="border-b border-line py-0 pl-2 pr-4 text-right align-middle">
            <Skeleton className="ml-auto h-3.5 w-16" />
          </td>
        </tr>
      ))}
    </>
  );
}

export { TaskListSkeleton };
