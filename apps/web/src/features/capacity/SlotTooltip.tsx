import type { ProjectView, RetryInfo, SlotView, WorkerSummary } from "@fleet/core";
import { Duration } from "../../components/Duration";
import { MonoPath } from "../../components/MonoPath";
import { ProjectDot } from "../../components/ProjectDot";
import { StatusBadge } from "../../components/StatusBadge";
import styles from "./SlotTooltip.module.css";

const { root, title, metaRow, projectName, sep, pathWrap, roleRow, cwdRow, cwdLabel } = styles;

/** 提示卡里路径的最大显示长度，和详情页元信息的口径保持一致。 */
const TOOLTIP_PATH_MAX = 40;

export interface SlotTooltipProps {
  slot: SlotView;
  project: ProjectView | null;
  worker: WorkerSummary | null;
  retry: RetryInfo | null;
}

/** 占用格的悬浮/聚焦提示卡：标题、项目与路径、角色与状态与时长；工作目录和项目目录不同时才多一行。 */
export function SlotTooltip({ slot, project, worker, retry }: SlotTooltipProps) {
  const projectPath = project?.path ?? slot.projectKey;
  const showCwd = worker !== null && project !== null && worker.cwd !== project.path;

  return (
    <div className={root} data-slot-tip>
      <div className={title}>{slot.title}</div>
      <div className={metaRow}>
        <ProjectDot colorIndex={project?.colorIndex ?? 0} size={8} />
        <span className={projectName}>{project?.name ?? slot.projectKey}</span>
        <span className={sep}>·</span>
        <span className={pathWrap}>
          <MonoPath path={projectPath} max={TOOLTIP_PATH_MAX} />
        </span>
      </div>
      <div className={roleRow}>
        <span>{slot.roleLabel}</span>
        <span className={sep}>·</span>
        <StatusBadge size="sm" status="running" retry={retry} />
        <span className={sep}>·</span>
        <Duration from={slot.startedAt} />
      </div>
      {showCwd && worker !== null && (
        <div className={cwdRow}>
          <span className={cwdLabel}>工作目录 </span>
          <MonoPath path={worker.cwd} max={TOOLTIP_PATH_MAX} />
        </div>
      )}
    </div>
  );
}
