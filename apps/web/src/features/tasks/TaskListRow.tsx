import type { WorkerSummary } from "@fleet/core";
import { RotateCw } from "lucide-react";
import type { KeyboardEvent } from "react";
import {
  Duration,
  Label,
  ProjectLabel,
  StatusIcon,
  UsageBreakdown,
  VerdictTag,
} from "@/components";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cardMeta } from "@/lib/board";
import { formatClock, formatTokens } from "@/lib/format";
import { STATUS_META } from "@/lib/status";

interface TaskListRowProps {
  item: WorkerSummary;
  nowMs: number;
  onOpen(id: string): void;
}

function TaskListRow({ item, nowMs, onOpen }: TaskListRowProps) {
  const meta = cardMeta(item);

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      onOpen(item.id);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = event.currentTarget
      .closest("tbody")
      ?.querySelectorAll<HTMLTableRowElement>("[data-task-row]");
    if (rows === undefined) return;
    const index = Array.from(rows).indexOf(event.currentTarget);
    rows[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  }

  return (
    <tr
      data-task-row={item.id}
      tabIndex={0}
      className="group h-10 cursor-pointer transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      onClick={() => onOpen(item.id)}
      onKeyDown={handleKeyDown}
    >
      <td className="border-b border-line py-0 pl-4 pr-2 align-middle">
        <StatusIcon
          status={item.status}
          retrying={item.retry !== null}
          label={STATUS_META[item.status].label}
        />
      </td>
      <td className="hidden border-b border-line px-2 align-middle font-mono text-12 text-fg-3 md:table-cell">
        {item.id}
      </td>
      <td className="border-b border-line px-2 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-13 text-fg-1" title={item.title}>
            {item.title}
          </span>
          {meta?.kind === "queue" ? (
            <span data-row-flag="queue" className="shrink-0 text-12 text-fg-3">
              {meta.text}
            </span>
          ) : null}
          {meta?.kind === "retry" ? (
            <span
              data-row-flag="retry"
              className="inline-flex shrink-0 items-center gap-1 text-12 text-status-warning"
            >
              <RotateCw aria-hidden="true" className="size-3" />
              {meta.text}
            </span>
          ) : null}
          {meta?.kind === "failure" ? (
            <span data-row-flag="failure" className="shrink-0 text-12 text-status-failed">
              {meta.text}
            </span>
          ) : null}
          {item.verdict === "fail" ? <VerdictTag verdict="fail" /> : null}
        </div>
      </td>
      <td className="hidden border-b border-line px-2 align-middle md:table-cell">
        <ProjectLabel projectKey={item.projectKey} />
      </td>
      <td className="hidden border-b border-line px-2 align-middle xl:table-cell">
        <Label data-label="role">{item.roleLabel}</Label>
      </td>
      <td className="hidden border-b border-line px-2 align-middle lg:table-cell">
        {item.poolId === null ? (
          <span className="text-12 text-fg-3">公共排队</span>
        ) : (
          <span className="font-mono text-12 text-fg-2">{item.poolId}</span>
        )}
      </td>
      <td className="hidden border-b border-line px-2 text-right align-middle lg:table-cell">
        {item.usage.totalTokens === 0 ? (
          <span className="font-mono tabular-nums text-12 text-fg-2">—</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`查看用量明细：${formatTokens(item.usage.totalTokens)}`}
                className="font-mono tabular-nums text-12 text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {formatTokens(item.usage.totalTokens)}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <UsageBreakdown usage={item.usage} />
            </TooltipContent>
          </Tooltip>
        )}
      </td>
      <td className="hidden border-b border-line px-2 text-right align-middle font-mono tabular-nums text-12 text-fg-2 md:table-cell">
        {item.status === "running" ? (
          <Duration from={item.startedAt} />
        ) : item.runMs > 0 ? (
          <Duration ms={item.runMs} />
        ) : (
          "—"
        )}
      </td>
      <td className="border-b border-line py-0 pl-2 pr-4 text-right align-middle font-mono tabular-nums text-12 text-fg-3">
        {formatClock(item.createdAt, nowMs)}
      </td>
    </tr>
  );
}

export { TaskListRow };
