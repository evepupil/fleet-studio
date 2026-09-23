import type { PoolView, ProjectView, WorkerSummary } from "@fleet/core";
import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { Tip } from "../../components/Tip";
import { elapsedMs, formatDuration } from "../../lib/format";
import { projectColorVar } from "../../lib/projectColor";
import { useNow } from "../../state/nowStore";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./SlotMeter.module.css";
import { SlotTooltip } from "./SlotTooltip";

const { root, cell, empty } = styles;

export interface SlotMeterProps {
  pool: PoolView;
  projectByKey: ReadonlyMap<string, ProjectView>;
  workerById: ReadonlyMap<string, WorkerSummary>;
}

/**
 * 离散格子容量条：容量 ≤ 48 时使用。占用格按 pool.slots 的顺序铺满（已经按项目成段排好），剩余画空格。
 * 键盘：组内只有一个格子进 Tab 顺序（roving tabindex），左右方向键 / Home / End 在占用格之间移动；
 * 聚焦的格子把提示卡受控打开，失焦回到纯悬停模式，鼠标行为完全交给 Radix 默认逻辑。
 */
export function SlotMeter({ pool, projectByKey, workerById }: SlotMeterProps) {
  const now = useNow();
  const slots = pool.slots;
  const cellCount = Math.max(pool.capacity, pool.running);

  // activeIndex：当前唯一进 Tab 顺序的格子，初始第一个，之后跟着最近一次聚焦走。
  // focusedIndex：只在「此刻真的有 DOM 焦点」时非空，用来把提示卡受控打开；失焦立即清空。
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function focusAt(index: number): void {
    setActiveIndex(index);
    buttonRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(Math.min(index + 1, slots.length - 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(slots.length - 1);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: 这是容量格的组合部件，不是表单分组，<fieldset> 语义不合适
    <div
      className={root}
      role="group"
      data-meter
      aria-label={`${pool.id} 容量 ${pool.running}/${pool.capacity}`}
      style={{ gridTemplateColumns: `repeat(${cellCount}, minmax(8px, 28px))` }}
    >
      {Array.from({ length: cellCount }, (_, index) => {
        const slot = slots[index];
        if (slot === undefined) {
          // 空格是纯占位、没有数据身份，位置本身就是它的身份，用索引做 key 是唯一合理的选择。
          // biome-ignore lint/suspicious/noArrayIndexKey: 占位格没有数据身份，位置即身份
          return <span key={`empty-${index}`} className={empty} data-slot-empty aria-hidden />;
        }

        const project = projectByKey.get(slot.projectKey) ?? null;
        const worker = workerById.get(slot.workerId) ?? null;
        const over = index >= pool.capacity;
        const retry = worker?.retry ?? null;
        const statusText = retry !== null ? `重试 ${retry.attempt}/${retry.max}` : "工作中";
        const durationText = formatDuration(elapsedMs(slot.startedAt, null, now) ?? 0);
        const projectName = project?.name ?? slot.projectKey;
        const label = `${projectName}，${slot.title}，${slot.roleLabel}，${statusText}，${durationText}`;
        const isFocused = focusedIndex === index;

        return (
          <Tip
            key={slot.runId}
            {...(isFocused ? { open: true } : {})}
            content={<SlotTooltip slot={slot} project={project} worker={worker} retry={retry} />}
          >
            <button
              type="button"
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              className={cell}
              data-slot
              data-worker-id={slot.workerId}
              data-project={slot.projectKey}
              data-retrying={slot.retrying ? "true" : "false"}
              data-over={over ? "true" : "false"}
              style={{ backgroundColor: projectColorVar(project?.colorIndex ?? 0) }}
              tabIndex={index === activeIndex ? 0 : -1}
              aria-label={label}
              onClick={() => useSelectionStore.getState().select(slot.workerId)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onFocus={() => {
                setActiveIndex(index);
                setFocusedIndex(index);
              }}
              onBlur={() => setFocusedIndex((current) => (current === index ? null : current))}
            />
          </Tip>
        );
      })}
    </div>
  );
}
