import type { WorkerSummary } from "@fleet/core";
import { FAIL_REASON_LABELS } from "@fleet/core";
import type { KeyboardEvent } from "react";
import {
  ColorDot,
  Duration,
  RoleChip,
  StatusBadge,
  UsageBreakdown,
  VerdictTag,
} from "@/components";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { projectColorVar } from "@/lib/colors";
import { formatClock, formatTokens } from "@/lib/format";

interface TaskTableRowProps {
  item: WorkerSummary;
  compact: boolean;
  selected: boolean;
  projectName: string;
  projectColorIndex: number | undefined;
  nowMs: number;
  onOpen(id: string): void;
}

function TaskTableRow({
  item,
  compact,
  selected,
  projectName,
  projectColorIndex,
  nowMs,
  onOpen,
}: TaskTableRowProps) {
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

  const rowClass = selected
    ? "bg-selected hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    : "hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  return (
    <TableRow
      data-task-row={item.id}
      aria-selected={selected}
      tabIndex={0}
      className={`cursor-pointer ${rowClass}`}
      onClick={() => onOpen(item.id)}
      onKeyDown={handleKeyDown}
    >
      {compact ? (
        <TableCell className="relative whitespace-normal px-4 py-3">
          {selected ? (
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-brand" />
          ) : null}
          <div className={`flex min-w-0 flex-col gap-2 ${selected ? "pl-2" : ""}`}>
            <span className="self-start">
              <StatusBadge
                size="sm"
                status={item.status}
                retry={item.retry}
                queuePosition={item.queuePosition}
                shared={item.poolId === null}
              />
            </span>
            <span className="truncate text-13 text-fg-1" title={item.title}>
              {item.title}
            </span>
          </div>
        </TableCell>
      ) : (
        <>
          <TableCell className="relative min-w-[280px] whitespace-normal">
            {selected ? (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-brand" />
            ) : null}
            <div className={`min-w-0 ${selected ? "pl-2" : ""}`}>
              <div className="truncate text-13 text-fg-1" title={item.title}>
                {item.title}
              </div>
              <div className="truncate font-mono text-11 text-fg-3">{item.id}</div>
            </div>
          </TableCell>
          <TableCell className="w-[160px] max-w-[160px]">
            <div className="flex min-w-0 items-center gap-2">
              {projectColorIndex === undefined ? null : (
                <ColorDot colorVar={projectColorVar(projectColorIndex)} size={8} />
              )}
              <span className="truncate" title={projectName}>
                {projectName}
              </span>
            </div>
          </TableCell>
          <TableCell className="w-[96px]">
            <RoleChip label={item.roleLabel} />
          </TableCell>
          <TableCell className="w-[96px]">
            {item.poolId === null ? (
              <span className="text-12 text-fg-3">公共排队</span>
            ) : (
              <span className="font-mono text-13">{item.poolId}</span>
            )}
          </TableCell>
          <TableCell className="min-w-[180px] whitespace-normal">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge
                size="sm"
                status={item.status}
                retry={item.retry}
                queuePosition={item.queuePosition}
                shared={item.poolId === null}
              />
              {item.status === "failed" && item.failReason !== null ? (
                <span
                  className="truncate text-12 text-fg-3"
                  title={FAIL_REASON_LABELS[item.failReason]}
                >
                  · {FAIL_REASON_LABELS[item.failReason]}
                </span>
              ) : null}
              {item.verdict === "fail" ? <VerdictTag verdict={item.verdict} /> : null}
            </div>
          </TableCell>
          <TableCell className="w-[96px] text-right">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`查看用量明细：${item.usage.totalTokens === 0 ? "—" : formatTokens(item.usage.totalTokens)}`}
                  className="font-mono tabular-nums text-13 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {item.usage.totalTokens === 0 ? "—" : formatTokens(item.usage.totalTokens)}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <UsageBreakdown usage={item.usage} />
              </TooltipContent>
            </Tooltip>
          </TableCell>
          <TableCell className="w-[96px] text-right font-mono tabular-nums text-13">
            {item.status === "running" ? (
              <Duration from={item.startedAt} />
            ) : item.runMs > 0 ? (
              <Duration ms={item.runMs} />
            ) : (
              "—"
            )}
          </TableCell>
          <TableCell className="w-[112px] text-right font-mono tabular-nums text-12 text-fg-2">
            {formatClock(item.createdAt, nowMs)}
          </TableCell>
        </>
      )}
    </TableRow>
  );
}

export { TaskTableRow };
