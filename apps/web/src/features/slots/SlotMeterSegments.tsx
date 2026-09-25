import type { ProjectView } from "@fleet/core";
import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { ColorDot } from "@/components/ColorDot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { projectColorVar } from "@/lib/colors";
import type { ProjectSegment } from "@/lib/slotMeter";

interface SlotMeterSegmentsProps {
  segments: readonly ProjectSegment[];
  capacity: number;
  projectByKey: ReadonlyMap<string, ProjectView>;
}

/** 容量大于 24 时的连续分段条：按项目合并，每段宽度 = 占用数 ÷ 容量。 */
function SlotMeterSegments({ segments, capacity, projectByKey }: SlotMeterSegmentsProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = segments.length === 0 ? -1 : Math.min(focusIndex, segments.length - 1);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? Math.min(index + 1, segments.length - 1)
        : Math.max(index - 1, 0);
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex h-4 w-[220px] shrink-0 items-center gap-0.5 rounded-[var(--r-slot)] bg-meter-track">
      {segments.map((segment, index) => {
        const project = projectByKey.get(segment.projectKey);
        const projectName = project?.name ?? segment.projectKey;
        const colorVar = projectColorVar(project?.colorIndex ?? 0);
        const count = segment.slots.length;
        return (
          <Tooltip key={segment.projectKey}>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={(element) => {
                  refs.current[index] = element;
                }}
                tabIndex={index === activeIndex ? 0 : -1}
                data-segment={segment.projectKey}
                aria-label={`${projectName}，${count} 个`}
                style={{ width: `${(count / capacity) * 100}%`, background: colorVar }}
                className="h-full shrink rounded-[var(--r-slot)]"
                onKeyDown={(event) => handleKeyDown(event, index)}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-12 font-medium text-fg-1">
                  <ColorDot colorVar={colorVar} />
                  {projectName}
                </div>
                <div className="text-11 text-fg-3">{count} 个</div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export { SlotMeterSegments };
