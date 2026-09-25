import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: string;
  valueClassName?: string;
  lines?: ReactNode[];
  onClick?: () => void;
  ariaLabel?: string;
  loading?: boolean;
  "data-stat"?: string;
}

function StatCard({
  label,
  value,
  valueClassName = "text-fg-1",
  lines = [],
  onClick,
  ariaLabel,
  loading = false,
  "data-stat": dataStat,
}: StatCardProps) {
  const content = (
    <>
      <div className="text-12 text-fg-3">{label}</div>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-20" />
      ) : (
        <div className={`mt-1 truncate font-mono text-28 font-semibold ${valueClassName}`}>
          {value}
        </div>
      )}
      {loading ? (
        <Skeleton className="mt-1 h-3 w-30" />
      ) : (
        lines.map((line) => (
          <div key={String(line)} className="mt-1 text-12 text-fg-2">
            {line}
          </div>
        ))
      )}
    </>
  );
  const className = "flex h-full flex-col justify-start rounded-lg border border-line bg-panel p-5";

  return onClick ? (
    <button
      type="button"
      data-stat={dataStat}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`${className} w-full cursor-pointer text-left hover:border-line-strong active:bg-hover`}
    >
      {content}
    </button>
  ) : (
    <div data-stat={dataStat} className={className}>
      {content}
    </div>
  );
}

export { StatCard };
