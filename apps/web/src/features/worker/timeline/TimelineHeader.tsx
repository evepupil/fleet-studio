import type { TimelineFilter } from "@/lib/timelineView";
import { TimelineFilterControl, type TimelineFilterOption } from "./TimelineFilterControl";

export interface TimelineHeaderProps {
  counts: Record<TimelineFilter, number>;
  filter: TimelineFilter;
  onFilterChange(filter: TimelineFilter): void;
}

const FILTER_OPTION_META: ReadonlyArray<{ value: TimelineFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "tools", label: "工具" },
  { value: "text", label: "文字" },
  { value: "issues", label: "异常" },
];

/** 时间线头部：吸顶展示事件总数和四个筛选段；计数为 0 的段禁用（「全部」永不禁用）。 */
export function TimelineHeader({ counts, filter, onFilterChange }: TimelineHeaderProps) {
  const options: TimelineFilterOption[] = FILTER_OPTION_META.map((meta) => ({
    value: meta.value,
    label: meta.label,
    count: counts[meta.value],
    disabled: meta.value !== "all" && counts[meta.value] === 0,
  }));

  return (
    <div
      data-timeline-header
      className="sticky top-0 z-[var(--z-sticky)] flex items-center gap-3 border-b border-line bg-panel py-2.5"
    >
      <h2 className="m-0 text-14 font-semibold text-fg-1">时间线</h2>
      <span className="font-mono text-12 text-fg-3">{counts.all}</span>
      <span className="flex-1" aria-hidden />
      <TimelineFilterControl options={options} value={filter} onChange={onFilterChange} />
    </div>
  );
}
