import type { RetryInfo, RunStatus } from "@fleet/core";
import { StatusIcon } from "@/components/StatusIcon";
import { STATUS_META } from "@/lib/status";

const STATUS_TEXT_CLASS = {
  sm: "text-12 text-fg-2",
  md: "text-13 text-fg-1",
};
const RETRY_TEXT_CLASS = {
  sm: "text-12 text-status-warning",
  md: "text-13 text-status-warning",
};

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
  const showRetry = status === "running" && retry != null;
  const label =
    showRetry && retry
      ? `重试 ${retry.attempt}/${retry.max}`
      : status === "queued" && queuePosition != null
        ? `${shared ? "公共排队" : "排队"}第 ${queuePosition} 位`
        : STATUS_META[status].label;

  return (
    <span data-status={status} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StatusIcon status={status} retrying={showRetry} size={size === "sm" ? 12 : 14} />
      <span className={showRetry ? RETRY_TEXT_CLASS[size] : STATUS_TEXT_CLASS[size]}>{label}</span>
    </span>
  );
}

export { StatusBadge };
