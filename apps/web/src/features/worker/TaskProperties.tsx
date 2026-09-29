import type { ProjectView, Snapshot, WorkerDetail } from "@fleet/core";
import { Fragment, type ReactNode } from "react";
import { ColorDot } from "@/components/ColorDot";
import { Duration } from "@/components/Duration";
import { MonoPath } from "@/components/MonoPath";
import { StatusBadge } from "@/components/StatusBadge";
import { UsageBreakdown } from "@/components/UsageBreakdown";
import { projectColorVar } from "@/lib/colors";
import { formatClock, formatCost, formatTokens } from "@/lib/format";
import { useNow } from "@/state/nowStore";
import { useSnapshotStore } from "@/state/snapshotStore";

export interface TaskPropertiesProps {
  detail: WorkerDetail;
  variant: "aside" | "inline";
}

interface ProjectMeta {
  name: string;
  path: string;
  colorIndex: number;
}

interface PropertyEntry {
  key: string;
  label: string;
  value: ReactNode;
}

function nameFromPath(path: string): string {
  const segments = path.split(/[\\/]+/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? path;
}

function resolveProjectMeta(detail: WorkerDetail, snapshot: Snapshot | null): ProjectMeta {
  const project: ProjectView | undefined = snapshot?.projects.find(
    (item) => item.key === detail.summary.projectKey,
  );
  if (project !== undefined) {
    return { name: project.name, path: project.path, colorIndex: project.colorIndex };
  }
  return {
    name: nameFromPath(detail.projectPath),
    path: detail.projectPath,
    colorIndex: 0,
  };
}

export function TaskProperties({ detail, variant }: TaskPropertiesProps) {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const now = useNow();
  const { summary } = detail;
  const project = resolveProjectMeta(detail, snapshot);
  const cost = formatCost(summary.usage.costUsd);
  const durationFrom = summary.startedAt ?? summary.queuedAt;
  const durationTo =
    summary.status === "running" || summary.status === "queued" ? null : summary.endedAt;
  const durationClass = summary.status === "queued" ? "text-fg-3" : "text-fg-2";
  const properties: PropertyEntry[] = [
    {
      key: "status",
      label: "状态",
      value: (
        <StatusBadge
          size="md"
          status={summary.status}
          retry={summary.retry}
          queuePosition={summary.queuePosition}
          shared={summary.poolId === null}
        />
      ),
    },
    {
      key: "duration",
      label: "耗时",
      value: (
        <span className={`font-mono text-13 ${durationClass}`}>
          <Duration from={durationFrom} to={durationTo} />
        </span>
      ),
    },
    {
      key: "project",
      label: "项目",
      value: (
        <div className="min-w-0">
          <div className="min-w-0 truncate" title={project.name}>
            <span className="inline-flex max-w-full min-w-0 items-center gap-1">
              <ColorDot colorVar={projectColorVar(project.colorIndex)} size={6} />
              <span className="min-w-0 truncate">{project.name}</span>
            </span>
          </div>
          <div className="truncate text-12 text-fg-3" title={project.path}>
            <MonoPath path={project.path} max={32} />
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "角色",
      value: (
        <div className="min-w-0">
          <div className="truncate" title={summary.roleLabel}>
            {summary.roleLabel || "—"}
          </div>
          <div className="truncate font-mono text-12 text-fg-3" title={summary.role}>
            {summary.role || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "pool",
      label: "池",
      value: (
        <div className="min-w-0">
          {summary.poolId === null ? (
            <div className="text-fg-3">公共排队</div>
          ) : (
            <>
              <div className="truncate font-mono" title={summary.poolId}>
                {summary.poolId}
              </div>
              <div className="truncate font-mono text-12 text-fg-3" title={summary.model ?? "—"}>
                {summary.model ?? "—"}
              </div>
            </>
          )}
          <div className="text-12 text-fg-3">
            {summary.runtime}
            {detail.thinking !== null ? ` · 思考 ${detail.thinking}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "channel",
      label: "渠道",
      value:
        summary.channel === null ? (
          <span className="text-fg-3">—</span>
        ) : (
          <span className="block truncate font-mono" title={summary.channel}>
            {summary.channel}
          </span>
        ),
    },
    {
      key: "runs",
      label: "运行",
      value: (
        <div className="min-w-0">
          <div>第 {summary.runSeq} 次</div>
          {detail.sessionRef !== null ? (
            <div className="truncate font-mono text-12 text-fg-3" title={detail.sessionRef}>
              {detail.sessionRef}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "usage",
      label: "用量",
      value: (
        <div className="min-w-0">
          <div>
            <span className="font-mono tabular-nums">
              {formatTokens(summary.usage.totalTokens)}
            </span>{" "}
            tokens
            {cost !== null ? (
              <>
                {" · "}
                <span className="font-mono tabular-nums">{cost}</span>
              </>
            ) : null}
          </div>
          <div className="text-12 text-fg-3">
            <UsageBreakdown usage={summary.usage} />
          </div>
        </div>
      ),
    },
    {
      key: "cwd",
      label: "目录",
      value: (
        <span className="block truncate font-mono text-12" title={summary.cwd}>
          <MonoPath path={summary.cwd} max={32} />
        </span>
      ),
    },
    {
      key: "created",
      label: "创建",
      value: (
        <span className="font-mono text-12 text-fg-2">{formatClock(summary.createdAt, now)}</span>
      ),
    },
  ];

  const className =
    variant === "aside"
      ? "grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-3.5"
      : "mt-4 grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-line bg-card p-4 shadow-card md:grid-cols-2";

  return (
    <dl data-properties className={className}>
      {properties.map((property) =>
        variant === "aside" ? (
          <Fragment key={property.key}>
            <dt className="pt-px text-12 text-fg-3">{property.label}</dt>
            <dd data-prop={property.key} className="min-w-0 text-13 text-fg-1">
              {property.value}
            </dd>
          </Fragment>
        ) : (
          <div key={property.key} className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-x-3">
            <dt className="pt-px text-12 text-fg-3">{property.label}</dt>
            <dd data-prop={property.key} className="min-w-0 text-13 text-fg-1">
              {property.value}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}
