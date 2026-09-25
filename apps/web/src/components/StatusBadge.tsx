import type { RetryInfo, RunStatus } from "@fleet/core";
import { RotateCw } from "lucide-react";
import { STATUS_META } from "@/lib/status";

interface StatusBadgeProps {
  status: RunStatus;
  retry?: RetryInfo | null;
  queuePosition?: number | null;
  shared?: boolean;
  size?: "sm" | "md";
}

function StatusBadge({
  status,
  retry,
  queuePosition,
  shared = false,
  size = "md",
}: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const showRetry = status === "running" && retry != null;
  const Icon = showRetry ? RotateCw : meta.icon;
  const label =
    showRetry && retry
      ? `重试 ${retry.attempt}/${retry.max}`
      : status === "queued" && queuePosition != null
        ? `${shared ? "公共排队" : "排队"}第 ${queuePosition} 位`
        : meta.label;

  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1 whitespace-nowrap ${size === "sm" ? "text-12" : "text-13"} ${showRetry ? "text-status-warning" : meta.badgeClass}`}
    >
      <Icon
        aria-hidden="true"
        className={`${size === "sm" ? "size-3" : "size-3.5"} ${showRetry ? "animate-spin-slow" : ""}`}
      />
      {label}
    </span>
  );
}

export { StatusBadge };
