import type { Snapshot, WorkerDetail } from "@fleet/core";
import { MonoPath } from "../../components/MonoPath";
import { ProjectDot } from "../../components/ProjectDot";
import { Tip } from "../../components/Tip";
import { UsageBreakdown } from "../../components/UsageBreakdown";
import { formatCost, formatTokens } from "../../lib/format";
import { selectProjectByKey } from "../../state/selectors";
import { useSnapshotStore } from "../../state/snapshotStore";
import styles from "./MetaGrid.module.css";

const {
  root,
  cell,
  label,
  value,
  valueMono,
  extra,
  extraWrap,
  extraMono,
  projectName,
  projectNameText,
  mono,
} = styles;

export interface MetaGridProps {
  detail: WorkerDetail;
}

interface ProjectMeta {
  name: string;
  path: string;
  colorIndex: number;
}

const FALLBACK_COLOR_INDEX = 0;

/** 项目名取路径最后一段，兼容正斜杠、反斜杠混用的写法（含 UNC 路径的前导反斜杠）。 */
function nameFromPath(path: string): string {
  const segments = path.split(/[\\/]+/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? path;
}

/** 项目信息优先按 projectKey 从快照里找；项目已经不在配置里时退回详情自带的路径，配色固定用 0。 */
function resolveProjectMeta(detail: WorkerDetail, snapshot: Snapshot | null): ProjectMeta {
  const project =
    snapshot === null ? null : selectProjectByKey(snapshot, detail.summary.projectKey);
  if (project !== null) {
    return { name: project.name, path: project.path, colorIndex: project.colorIndex };
  }
  return {
    name: nameFromPath(detail.projectPath),
    path: detail.projectPath,
    colorIndex: FALLBACK_COLOR_INDEX,
  };
}

/** 元信息六格：项目、工作目录、角色、池与模型、运行、用量，标签在上、值居中、补充行在下。 */
export function MetaGrid({ detail }: MetaGridProps) {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const project = resolveProjectMeta(detail, snapshot);
  const { summary } = detail;
  const usage = summary.usage;
  const cost = formatCost(usage.costUsd);

  return (
    <dl className={root} data-meta>
      <div className={cell}>
        <dt className={label}>项目</dt>
        <dd className={value}>
          <Tip content={<MonoPath path={project.path} max={56} />}>
            <span className={projectName}>
              <ProjectDot colorIndex={project.colorIndex} />
              <span className={projectNameText}>{project.name}</span>
            </span>
          </Tip>
        </dd>
      </div>

      <div className={cell}>
        <dt className={label}>工作目录</dt>
        <dd className={valueMono}>
          <MonoPath path={summary.cwd} max={40} />
        </dd>
      </div>

      <div className={cell}>
        <dt className={label}>角色</dt>
        <dd className={value}>{summary.roleLabel}</dd>
        <dd className={extraMono}>{summary.role}</dd>
      </div>

      <div className={cell}>
        <dt className={label}>池与模型</dt>
        <dd className={valueMono}>
          {summary.poolId} · {summary.model}
        </dd>
        <dd className={extra}>
          {summary.runtime}
          {detail.thinking !== null && ` · 思考 ${detail.thinking}`}
        </dd>
      </div>

      <div className={cell}>
        <dt className={label}>运行</dt>
        <dd className={value}>第 {summary.runSeq} 次</dd>
        {detail.sessionRef !== null && <dd className={extraMono}>{detail.sessionRef}</dd>}
      </div>

      <div className={cell}>
        <dt className={label}>用量</dt>
        <dd className={value}>
          <span className={mono}>{formatTokens(usage.totalTokens)}</span> tokens
          {cost !== null && (
            <>
              {" · "}
              <span className={mono}>{cost}</span>
            </>
          )}
        </dd>
        <dd className={extraWrap}>
          <UsageBreakdown usage={usage} />
        </dd>
      </div>
    </dl>
  );
}
