import type { RetryInfo, RunStatus } from "@fleet/core";
import { RotateCw } from "lucide-react";
import { STATUS_META } from "../lib/status";
import styles from "./StatusBadge.module.css";

const { root, iconSlot, spin, reducedDot } = styles;

export interface StatusBadgeProps {
  status: RunStatus;
  retry?: RetryInfo | null;
  queuePosition?: number | null;
  size?: "sm" | "md";
}

/**
 * 状态 = 图标 + 彩色状态词，颜色从不单独表达含义（见 docs/前端设计.md 3.2）。
 * 工作中且在重试时换成 RotateCw、警示色，文字变成「重试 N/M」；排队中给出位置时写「排队第 N 位」。
 */
export function StatusBadge({
  status,
  retry = null,
  queuePosition = null,
  size = "md",
}: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const retrying = status === "running" && retry !== null;
  const spinning = status === "running";
  const Icon = retrying ? RotateCw : meta.icon;
  const color = retrying ? "var(--st-warning)" : meta.color;
  const label = retrying
    ? `重试 ${retry.attempt}/${retry.max}`
    : status === "queued" && queuePosition !== null
      ? `排队第 ${queuePosition} 位`
      : meta.label;
  const iconSize = size === "sm" ? 12 : 14;

  return (
    <span className={root} data-status={status} data-size={size} style={{ color }}>
      <span className={iconSlot}>
        <Icon aria-hidden size={iconSize} className={spinning ? spin : undefined} />
        {spinning && <span className={reducedDot} aria-hidden />}
      </span>
      {label}
    </span>
  );
}
