import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricStripProps {
  "aria-label": string;
  children: ReactNode;
  "data-strip"?: string;
}

interface MetricProps {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: ReactNode;
  extra?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  loading?: boolean;
  "data-stat"?: string;
}

function MetricStrip({
  "aria-label": ariaLabel,
  children,
  "data-strip": dataStrip,
}: MetricStripProps) {
  return (
    <section
      aria-label={ariaLabel}
      data-strip={dataStrip}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card lg:grid-cols-4"
    >
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  valueClassName,
  sub,
  extra,
  onClick,
  ariaLabel,
  loading = false,
  "data-stat": dataStat,
}: MetricProps) {
  const className = `flex min-w-0 flex-col gap-1 bg-card px-4 py-3 ${onClick ? "text-left transition-colors hover:bg-raised" : ""}`;
  const content = (
    <>
      <span className="text-12 text-fg-3">{label}</span>
      {loading ? (
        <Skeleton className="h-[22px] w-20" />
      ) : (
        <span className={`truncate font-mono text-16 font-medium ${valueClassName ?? "text-fg-1"}`}>
          {value}
        </span>
      )}
      {extra}
      {loading ? (
        <Skeleton className="h-4 w-28" />
      ) : sub ? (
        <span className="truncate text-12 text-fg-2">{sub}</span>
      ) : null}
    </>
  );

  return onClick ? (
    <button
      type="button"
      data-stat={dataStat}
      aria-label={ariaLabel}
      onClick={onClick}
      className={className}
    >
      {content}
    </button>
  ) : (
    <div data-stat={dataStat} className={className}>
      {content}
    </div>
  );
}

export { Metric, MetricStrip };
