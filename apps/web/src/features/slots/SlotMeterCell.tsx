import type { ProjectView, SlotView } from "@fleet/core";
import type { KeyboardEvent } from "react";
import { ColorDot } from "@/components/ColorDot";
import { Duration } from "@/components/Duration";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { projectColorVar } from "@/lib/colors";
import { elapsedMs, formatDuration } from "@/lib/format";
import { useNow } from "@/state/nowStore";

interface SlotMeterCellProps {
  slot: SlotView;
  project: ProjectView | undefined;
  /** running > capacity 时多出来的那几格：描边标红 */
  overCapacity: boolean;
  /** 整组只有一个格子在 Tab 序列里，其余是 -1 */
  tabIndex: number;
  registerRef(element: HTMLButtonElement | null): void;
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void;
  onActivate(workerId: string): void;
}

/** L4 里被占用的一格：项目色底 + 悬停/聚焦提示卡，重试的叠斜纹。 */
function SlotMeterCell({
  slot,
  project,
  overCapacity,
  tabIndex,
  registerRef,
  onKeyDown,
  onActivate,
}: SlotMeterCellProps) {
  const nowMs = useNow();
  const projectName = project?.name ?? slot.projectKey;
  const colorVar = projectColorVar(project?.colorIndex ?? 0);
  const elapsed = elapsedMs(slot.startedAt, null, nowMs);
  const elapsedLabel = elapsed === null ? "—" : formatDuration(elapsed);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          ref={registerRef}
          tabIndex={tabIndex}
          data-slot={slot.runId}
          data-retrying={slot.retrying ? "true" : undefined}
          aria-label={`${projectName}，${slot.title}，${slot.roleLabel}，${elapsedLabel}`}
          style={{ backgroundColor: colorVar }}
          className={[
            "h-4 w-2.5 shrink-0 rounded-[var(--r-slot)]",
            slot.retrying ? "hatch" : "",
            overCapacity ? "outline outline-1 -outline-offset-1 outline-status-failed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onActivate(slot.workerId)}
          onKeyDown={onKeyDown}
        />
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex max-w-[280px] flex-col gap-1">
          <div className="flex items-center gap-1.5 text-12 font-medium text-fg-1">
            <ColorDot colorVar={colorVar} />
            {projectName}
          </div>
          <div className="truncate text-12 text-fg-1">{slot.title}</div>
          <div className="text-11 text-fg-3">
            {slot.roleLabel} · <Duration from={slot.startedAt} />
            {slot.retrying ? <span className="text-status-warning"> · 正在重试</span> : null}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export { SlotMeterCell };
