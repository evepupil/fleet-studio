import type { ProjectView, Snapshot, WorkerDetail } from "@fleet/core";
import { ColorDot } from "@/components/ColorDot";
import { MonoPath } from "@/components/MonoPath";
import { UsageBreakdown } from "@/components/UsageBreakdown";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { projectColorVar } from "@/lib/colors";
import { formatCost, formatTokens } from "@/lib/format";
import { useSnapshotStore } from "@/state/snapshotStore";

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
  const project: ProjectView | undefined =
    snapshot === null
      ? undefined
      : snapshot.projects.find((item) => item.key === detail.summary.projectKey);
  if (project !== undefined) {
    return { name: project.name, path: project.path, colorIndex: project.colorIndex };
  }
  return {
    name: nameFromPath(detail.projectPath),
    path: detail.projectPath,
    colorIndex: FALLBACK_COLOR_INDEX,
  };
}

/** 元信息七格：项目、工作目录、角色、池与模型、渠道、运行、用量，标签在上、值在下、补充行在最后。 */
export function MetaGrid({ detail }: MetaGridProps) {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const project = resolveProjectMeta(detail, snapshot);
  const { summary } = detail;
  const usage = summary.usage;
  const cost = formatCost(usage.costUsd);

  // 没分到池时是公共排队，模型名也还没有，这里单独写清楚，不要显示成「null · null」
  const poolModel =
    summary.poolId === null ? (
      <span className="text-fg-3">公共排队（还没分到池）</span>
    ) : (
      `${summary.poolId} · ${summary.model ?? ""}`
    );

  return (
    // 自己带一层 TooltipProvider：Radix 要求 Tooltip 必须在 Provider 里，这样这个组件
    // 不依赖外壳（AppShell / SidebarProvider）恰好在上游提供，单独渲染也不会报错。
    <TooltipProvider delayDuration={150} skipDelayDuration={0}>
      <dl
        data-meta
        className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-6 gap-y-3 border-y border-line py-3 lg:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]"
      >
        <div className="min-w-0">
          <dt className="text-11 font-medium text-fg-3">项目</dt>
          <dd className="mt-0.5 truncate text-13 text-fg-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex max-w-full min-w-0 items-center gap-1">
                  <ColorDot colorVar={projectColorVar(project.colorIndex)} />
                  <span className="min-w-0 truncate">{project.name}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="max-w-[320px] text-13">
                <MonoPath path={project.path} max={56} />
              </TooltipContent>
            </Tooltip>
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-11 font-medium text-fg-3">工作目录</dt>
          <dd className="mt-0.5 truncate font-mono text-12 text-fg-1">
            <MonoPath path={summary.cwd} max={40} />
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-11 font-medium text-fg-3">角色</dt>
          <dd className="mt-0.5 truncate text-13 text-fg-1">{summary.roleLabel}</dd>
          <dd className="mt-0.5 truncate font-mono text-11 text-fg-3">{summary.role}</dd>
        </div>

        <div className="min-w-0">
          <dt className="text-11 font-medium text-fg-3">池与模型</dt>
          <dd className="mt-0.5 truncate font-mono text-12 text-fg-1">{poolModel}</dd>
          <dd className="mt-0.5 truncate text-11 text-fg-3">
            {summary.runtime}
            {detail.thinking !== null && ` · 思考 ${detail.thinking}`}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-11 font-medium text-fg-3">渠道</dt>
          <dd className="mt-0.5 truncate font-mono text-12 text-fg-1">{summary.channel ?? "—"}</dd>
        </div>

        <div className="min-w-0">
          <dt className="text-11 font-medium text-fg-3">运行</dt>
          <dd className="mt-0.5 truncate text-13 text-fg-1">第 {summary.runSeq} 次</dd>
          {detail.sessionRef !== null && (
            <dd className="mt-0.5 truncate font-mono text-11 text-fg-3">{detail.sessionRef}</dd>
          )}
        </div>

        <div className="min-w-0">
          <dt className="text-11 font-medium text-fg-3">用量</dt>
          <dd className="mt-0.5 text-13 text-fg-1">
            <span className="font-mono tabular-nums">{formatTokens(usage.totalTokens)}</span> tokens
            {cost !== null && (
              <>
                {" · "}
                <span className="font-mono tabular-nums">{cost}</span>
              </>
            )}
          </dd>
          {/* 这一行不做单行省略：格子窄时按 UsageBreakdown 的整项换行，数字不能被截断 */}
          <dd className="mt-0.5 text-11 text-fg-3">
            <UsageBreakdown usage={usage} />
          </dd>
        </div>
      </dl>
    </TooltipProvider>
  );
}
