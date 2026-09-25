import { type RunStatus, STATUS_LABELS } from "@fleet/core";
import { CircleCheck, CircleSlash, CircleX, Clock3, Loader, type LucideIcon } from "lucide-react";

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
}

export const STATUS_META: Readonly<Record<RunStatus, StatusMeta>> = {
  queued: {
    label: STATUS_LABELS.queued,
    icon: Clock3,
    badgeClass: "text-status-queued",
  },
  running: {
    label: STATUS_LABELS.running,
    icon: Loader,
    badgeClass: "text-status-running",
  },
  completed: {
    label: STATUS_LABELS.completed,
    icon: CircleCheck,
    badgeClass: "text-status-done",
  },
  failed: {
    label: STATUS_LABELS.failed,
    icon: CircleX,
    badgeClass: "text-status-failed",
  },
  cancelled: {
    label: STATUS_LABELS.cancelled,
    icon: CircleSlash,
    badgeClass: "text-status-cancelled",
  },
};
