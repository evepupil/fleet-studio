import { type RunStatus, STATUS_LABELS } from "@fleet/core";

/**
 * 五种状态的中文词和图标颜色类。图标本身是 components/StatusIcon.tsx 里的内联图形
 * （Linear 式：虚线圈、半填充圈、实心勾、实心叉、斜杠圈），这里只给颜色。
 * 状态词一律用中性文字色，颜色只落在图标上。
 */
export interface StatusMeta {
  label: string;
  iconClass: string;
}

export const STATUS_META: Readonly<Record<RunStatus, StatusMeta>> = {
  queued: { label: STATUS_LABELS.queued, iconClass: "text-status-queued" },
  running: { label: STATUS_LABELS.running, iconClass: "text-status-running" },
  completed: { label: STATUS_LABELS.completed, iconClass: "text-status-done" },
  failed: { label: STATUS_LABELS.failed, iconClass: "text-status-failed" },
  cancelled: { label: STATUS_LABELS.cancelled, iconClass: "text-status-cancelled" },
};

/** 工作中且正在自动重试时，图标换成重试箭头、颜色换成警告色 */
export const RETRY_ICON_CLASS = "text-status-warning";
