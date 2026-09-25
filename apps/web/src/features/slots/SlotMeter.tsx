import type { PoolView } from "@fleet/core";
import type { KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { groupSegments, projectMap } from "@/lib/slotMeter";
import { useSnapshotStore } from "@/state/snapshotStore";
import { SlotMeterCell } from "./SlotMeterCell";
import { SlotMeterSegments } from "./SlotMeterSegments";

/** 离散格与连续分段条的分界（见 design/槽位.md L4）。 */
const SEGMENT_THRESHOLD = 24;

interface SlotMeterProps {
  pool: PoolView;
  onOpenWorker(workerId: string): void;
}

/**
 * L4 占用格子：容量 ≤ 24 画离散格，否则画一条按项目分段的连续条。
 * 整组只占一个 Tab 位，格间用左右方向键移动焦点。
 */
function SlotMeter({ pool, onOpenWorker }: SlotMeterProps) {
  const projects = useSnapshotStore((state) => state.snapshot?.projects);
  const projectByKey = useMemo(() => projectMap(projects ?? []), [projects]);
  const segments = useMemo(() => groupSegments(pool.slots), [pool.slots]);

  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const activeIndex = pool.slots.length === 0 ? -1 : Math.min(focusIndex, pool.slots.length - 1);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? Math.min(index + 1, pool.slots.length - 1)
        : Math.max(index - 1, 0);
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  const label = `${pool.id} 的占用：已用 ${pool.running}，容量 ${pool.capacity}`;

  if (pool.capacity === 0) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: 规格写死了 div + role="group"（fieldset 会带默认边框和内边距）
      <div
        data-slot-meter={pool.id}
        role="group"
        aria-label={label}
        className={pool.enabled ? "flex items-center" : "flex items-center opacity-40"}
      >
        <div className="h-4 w-[220px] rounded-[var(--r-slot)] border border-dashed border-line-strong" />
        <span className="ml-2 text-12 text-fg-3">已暂停</span>
      </div>
    );
  }

  // 一格一个位置：有苦工的用 runId 当键，空格子只有位置可认，用位置拼一个稳定键。
  const cells = Array.from({ length: Math.max(pool.capacity, pool.running) }, (_, position) => ({
    position,
    slot: pool.slots[position],
  }));

  return (
    // biome-ignore lint/a11y/useSemanticElements: 规格写死了 div + role="group"（fieldset 会带默认边框和内边距）
    <div
      data-slot-meter={pool.id}
      role="group"
      aria-label={label}
      className={pool.enabled ? "flex items-center" : "flex items-center opacity-40"}
    >
      {pool.capacity > SEGMENT_THRESHOLD ? (
        <SlotMeterSegments
          segments={segments}
          capacity={pool.capacity}
          projectByKey={projectByKey}
        />
      ) : (
        <div className="flex items-center gap-0.5">
          {cells.map((cell) => {
            if (cell.slot === undefined) {
              return (
                <span
                  key={`empty-${pool.id}-${cell.position}`}
                  aria-hidden="true"
                  className="h-4 w-2.5 shrink-0 rounded-[var(--r-slot)] bg-meter-track ring-1 ring-line-strong ring-inset"
                />
              );
            }
            return (
              <SlotMeterCell
                key={cell.slot.runId}
                slot={cell.slot}
                project={projectByKey.get(cell.slot.projectKey)}
                overCapacity={cell.position >= pool.capacity}
                tabIndex={cell.position === activeIndex ? 0 : -1}
                registerRef={(element) => {
                  refs.current[cell.position] = element;
                }}
                onKeyDown={(event) => handleKeyDown(event, cell.position)}
                onActivate={onOpenWorker}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export { SlotMeter };
