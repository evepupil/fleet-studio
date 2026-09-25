import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

const SKELETON_KEYS = [
  "skeleton-0",
  "skeleton-1",
  "skeleton-2",
  "skeleton-3",
  "skeleton-4",
  "skeleton-5",
  "skeleton-6",
  "skeleton-7",
];

interface TaskTableLoadingProps {
  compact: boolean;
  count: number;
}

function TaskTableLoading({ compact, count }: TaskTableLoadingProps) {
  return (
    <TableBody>
      {SKELETON_KEYS.slice(0, count).map((key) => (
        <TableRow key={key}>
          {compact ? (
            <TableCell className="whitespace-normal px-4 py-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            </TableCell>
          ) : (
            <>
              <TableCell className="min-w-[280px]">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-14" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-14" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
            </>
          )}
        </TableRow>
      ))}
    </TableBody>
  );
}

export { TaskTableLoading };
