import type { PoolView, ProjectView, SlotView } from "@fleet/core";
import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { Tip } from "../../components/Tip";
import { elapsedMs, formatDuration } from "../../lib/format";
import { projectColorVar } from "../../lib/projectColor";
import { useNow } from "../../state/nowStore";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./SegmentBar.module.css";

const {
  root,
  segment,
  hatchOverlay,
  remainder,
  tip,
  tipTitle,
  tipCount,
  tipList,
  tipItem,
  tipItemTitle,
  tipItemDuration,
  tipMore,
} = styles;

/** 提示卡最多列出的标题条数，超出的部分折成「还有 N 个」。 */
const MAX_TOOLTIP_TITLES = 5;

export interface SegmentBarProps {
  pool: PoolView;
  projectByKey: ReadonlyMap<string, ProjectView>;
}

interface ProjectSegment {
  projectKey: string;
  slots: SlotView[];
}

/**
 * 按项目分组，顺序取各项目在 slots 里首次出现的顺序
 * （buildPoolViews 已经把同项目的格子排在一起，这里只是按组重新聚合成分段）。
 */
function groupSegments(slots: readonly SlotView[]): ProjectSegment[] {
  const order: string[] = [];
  const bucket = new Map<string, SlotView[]>();
  for (const slot of slots) {
    const list = bucket.get(slot.projectKey);
    if (list === undefined) {
      order.push(slot.projectKey);
      bucket.set(slot.projectKey, [slot]);
    } else {
      list.push(slot);
    }
  }
  return order.map((projectKey) => ({ projectKey, slots: bucket.get(projectKey) ?? [] }));
}

/** 点一个分段选中该项目在这个池里最早开跑的苦工。 */
function earliestWorkerId(slots: readonly SlotView[]): string | null {
  if (slots.length === 0) {
    return null;
  }
  const sorted = [...slots].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  return sorted[0]?.workerId ?? null;
}

/**
 * 容量 > 48 时的连续分段条：一个项目一段，宽度按占用比例；段内重试中的部分按比例叠斜纹画在段尾。
 * 演示数据里没有超过 48 容量的池，这里的分组、百分比、键盘导航靠人工审查保证和 SlotMeter 同样正确，
 * 键盘交互（roving tabindex + 聚焦受控打开提示卡）也照 SlotMeter 的同一套规则实现，保持两种画法体验一致。
 */
export function SegmentBar({ pool, projectByKey }: SegmentBarProps) {
  const now = useNow();
  const segments = groupSegments(pool.slots);

  const [activeIndex, setActiveIndex] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const denominator = Math.max(pool.capacity, pool.running);
  const usedPercent = denominator === 0 ? 0 : (pool.slots.length / denominator) * 100;
  const remainderPercent = Math.max(0, 100 - usedPercent);

  function focusAt(index: number): void {
    setActiveIndex(index);
    buttonRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(Math.min(index + 1, segments.length - 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(segments.length - 1);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: 这是容量格的组合部件，不是表单分组，<fieldset> 语义不合适
    <div
      className={root}
      role="group"
      aria-label={`${pool.id} 容量 ${pool.running}/${pool.capacity}`}
    >
      {segments.map((seg, index) => {
        const project = projectByKey.get(seg.projectKey) ?? null;
        const percent = denominator === 0 ? 0 : (seg.slots.length / denominator) * 100;
        const retryingCount = seg.slots.filter((slot) => slot.retrying).length;
        const retryPercent = seg.slots.length === 0 ? 0 : (retryingCount / seg.slots.length) * 100;
        const targetWorkerId = earliestWorkerId(seg.slots);
        const shown = seg.slots.slice(0, MAX_TOOLTIP_TITLES);
        const extra = seg.slots.length - shown.length;
        const projectName = project?.name ?? seg.projectKey;
        const isFocused = focusedIndex === index;

        return (
          <Tip
            key={seg.projectKey}
            {...(isFocused ? { open: true } : {})}
            content={
              <div className={tip}>
                <div className={tipTitle}>{projectName}</div>
                <div className={tipCount}>{seg.slots.length} 个在跑</div>
                <ul className={tipList}>
                  {shown.map((slot) => (
                    <li className={tipItem} key={slot.runId}>
                      <span className={tipItemTitle}>{slot.title}</span>
                      <span className={tipItemDuration}>
                        {formatDuration(elapsedMs(slot.startedAt, null, now) ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
                {extra > 0 && <div className={tipMore}>还有 {extra} 个</div>}
              </div>
            }
          >
            <button
              type="button"
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              className={segment}
              data-segment
              data-project={seg.projectKey}
              style={{
                flex: `0 0 ${percent}%`,
                backgroundColor: projectColorVar(project?.colorIndex ?? 0),
              }}
              tabIndex={index === activeIndex ? 0 : -1}
              aria-label={`${projectName}，${seg.slots.length} 个在跑`}
              onClick={() => {
                if (targetWorkerId !== null) {
                  useSelectionStore.getState().select(targetWorkerId);
                }
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onFocus={() => {
                setActiveIndex(index);
                setFocusedIndex(index);
              }}
              onBlur={() => setFocusedIndex((current) => (current === index ? null : current))}
            >
              {retryPercent > 0 && (
                <span className={hatchOverlay} aria-hidden style={{ width: `${retryPercent}%` }} />
              )}
            </button>
          </Tip>
        );
      })}
      <span
        className={remainder}
        data-slot-empty
        aria-hidden
        style={{ flex: `1 1 ${remainderPercent}%` }}
      />
    </div>
  );
}
