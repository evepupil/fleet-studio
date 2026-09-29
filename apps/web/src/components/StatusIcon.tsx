import type { RunStatus } from "@fleet/core";
import { RotateCw } from "lucide-react";
import { RETRY_ICON_CLASS, STATUS_META } from "@/lib/status";

interface StatusIconProps {
  status: RunStatus;
  retrying?: boolean;
  size?: 12 | 14 | 16;
  label?: string;
  className?: string;
}

function StatusIcon({ status, retrying = false, size = 14, label, className }: StatusIconProps) {
  const accessibility: { role: "img"; "aria-label": string } | { "aria-hidden": true } = label
    ? { role: "img", "aria-label": label }
    : { "aria-hidden": true };
  const classes = `${retrying && status === "running" ? RETRY_ICON_CLASS : STATUS_META[status].iconClass} shrink-0 ${className ?? ""}`;

  if (retrying && status === "running") {
    return (
      <RotateCw
        {...accessibility}
        data-status-icon={status}
        width={size}
        height={size}
        className={`lucide ${classes}`}
      />
    );
  }

  return (
    <svg
      {...accessibility}
      data-status-icon={status}
      className={classes}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
    >
      <title>{label ?? STATUS_META[status].label}</title>
      {status === "queued" ? (
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeDasharray="2.4 2.3"
        />
      ) : null}
      {status === "running" ? (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 4.5 A3.5 3.5 0 0 1 8 11.5 Z" fill="currentColor" />
        </>
      ) : null}
      {status === "completed" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.2 L7.1 10.2 L11 6.2"
            fill="none"
            className="stroke-card"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {status === "failed" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5.8 5.8 L10.2 10.2 M10.2 5.8 L5.8 10.2"
            fill="none"
            className="stroke-card"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {status === "cancelled" ? (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M4.3 11.7 L11.7 4.3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      ) : null}
    </svg>
  );
}

export { StatusIcon };
