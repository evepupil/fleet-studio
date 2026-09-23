import { type FilterChipOption, FilterChips } from "../../../components/FilterChips";
import type { TimelineFilter } from "../../../lib/timelineView";
import styles from "./TimelineHeader.module.css";

const { root, title, total, spacer } = styles;

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

/** 时间线头部：吸顶展示事件总数和四个筛选小片；计数为 0 的筛选禁用（「全部」永不禁用）。 */
export function TimelineHeader({ counts, filter, onFilterChange }: TimelineHeaderProps) {
  const options: FilterChipOption<TimelineFilter>[] = FILTER_OPTION_META.map((meta) => ({
    value: meta.value,
    label: meta.label,
    count: counts[meta.value],
    disabled: meta.value !== "all" && counts[meta.value] === 0,
  }));

  return (
    <div className={root} data-timeline-header>
      <h2 className={title}>时间线</h2>
      <span className={total}>{counts.all}</span>
      <span className={spacer} aria-hidden />
      <FilterChips
        name="timeline-filter"
        ariaLabel="时间线筛选"
        options={options}
        value={filter}
        onChange={onFilterChange}
      />
    </div>
  );
}
