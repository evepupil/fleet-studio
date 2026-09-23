import { type RunStatus, STATUS_LABELS } from "@fleet/core";
import {
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** "var(--st-…)" 形式的颜色变量，直接用在 style 或 currentColor 上 */
  color: string;
}

/** 状态 → 中文词、图标、颜色变量。词条取自 @fleet/core 的 STATUS_LABELS，避免中文文案两处维护。 */
export const STATUS_META: Readonly<Record<RunStatus, StatusMeta>> = {
  queued: { label: STATUS_LABELS.queued, icon: Clock, color: "var(--st-queued)" },
  running: { label: STATUS_LABELS.running, icon: LoaderCircle, color: "var(--st-running)" },
  completed: { label: STATUS_LABELS.completed, icon: CircleCheck, color: "var(--st-done)" },
  failed: { label: STATUS_LABELS.failed, icon: CircleX, color: "var(--st-failed)" },
  cancelled: { label: STATUS_LABELS.cancelled, icon: CircleSlash, color: "var(--st-cancelled)" },
};
