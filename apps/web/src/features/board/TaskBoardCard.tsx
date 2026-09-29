import type { WorkerSummary } from "@fleet/core";
import { Link } from "react-router";
import { Label } from "@/components/Label";
import { ProjectLabel } from "@/components/ProjectLabel";
import { StatusIcon } from "@/components/StatusIcon";
import { VerdictTag } from "@/components/VerdictTag";
import { TaskBoardCardMeta } from "@/features/board/TaskBoardCardMeta";
import { cardMeta } from "@/lib/board";
import { STATUS_META } from "@/lib/status";
import type { CardProp } from "@/state/displayStore";

interface TaskBoardCardProps {
  worker: WorkerSummary;
  props: Record<CardProp, boolean>;
}

function TaskBoardCard({ worker, props }: TaskBoardCardProps) {
  const meta = props.meta ? cardMeta(worker) : null;
  const statusLabel = worker.retry !== null ? "重试中" : STATUS_META[worker.status].label;
  const showMetaRow = meta !== null || worker.verdict === "fail" || props.project || props.role;

  return (
    <Link
      to={`/tasks/${worker.id}`}
      data-task-card={worker.id}
      data-status={worker.status}
      className="group flex w-full shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-card p-3 text-left shadow-card transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {props.id || props.pool ? (
        <div className="flex h-4 min-w-0 items-center gap-2 text-12">
          {props.id ? (
            <span data-card-id={worker.id} className="shrink-0 font-mono text-fg-3">
              {worker.id}
            </span>
          ) : null}
          {props.pool ? (
            worker.poolId !== null ? (
              <span
                data-card-pool={worker.poolId}
                className="ml-auto min-w-0 truncate font-mono text-fg-2"
                title={worker.model ?? worker.poolId}
              >
                {worker.poolId}
              </span>
            ) : (
              <span data-card-pool className="ml-auto shrink-0 text-fg-3">
                公共排队
              </span>
            )
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 items-start gap-2">
        <StatusIcon
          status={worker.status}
          retrying={worker.retry !== null}
          size={14}
          label={statusLabel}
          className="mt-[1.5px]"
        />
        <p
          data-card-title
          title={worker.title}
          className="line-clamp-2 min-w-0 flex-1 break-words text-13 text-fg-1"
        >
          {worker.title}
        </p>
      </div>

      {showMetaRow ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {meta !== null ? <TaskBoardCardMeta meta={meta} /> : null}
          {worker.verdict === "fail" ? <VerdictTag verdict="fail" /> : null}
          {props.project ? <ProjectLabel projectKey={worker.projectKey} /> : null}
          {props.role ? <Label data-label="role">{worker.roleLabel}</Label> : null}
        </div>
      ) : null}
    </Link>
  );
}

export { TaskBoardCard };
