import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TimelineFilter } from "@/lib/timelineView";

export interface TimelineFilterOption {
  value: TimelineFilter;
  label: string;
  count: number;
  disabled?: boolean;
}

export interface TimelineFilterControlProps {
  options: readonly TimelineFilterOption[];
  value: TimelineFilter;
  onChange(value: TimelineFilter): void;
}

/** 过滤 Radix 回调给的字符串：只放行四个已知取值，避免用 as 断言。 */
function isTimelineFilter(value: string): value is TimelineFilter {
  return value === "all" || value === "tools" || value === "text" || value === "issues";
}

/**
 * 时间线筛选控件。样式和 `components/SegmentedControl.tsx` 完全一致（同一套 shadcn ToggleGroup 类名），
 * 但这里要多做两件共享组件做不到的事，所以单独放一份在本目录里：
 * 1. 每项要挂 `data-filter={value}`（第一版 FilterChips 的标记，交互检查按它点击）；
 * 2. 每项要在标签后面跟一个等宽计数。
 * 另外保留 `data-seg="timeline:{value}"`，与共享组件保持一致。
 */
export function TimelineFilterControl({ options, value, onChange }: TimelineFilterControlProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      aria-label="时间线筛选"
      data-control="timeline"
      onValueChange={(nextValue: string) => {
        if (nextValue !== "" && isTimelineFilter(nextValue)) {
          onChange(nextValue);
        }
      }}
      className="inline-flex h-8 rounded-md border border-line bg-panel p-0.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          data-filter={option.value}
          data-checked={option.value === value ? "true" : "false"}
          data-seg={`timeline:${option.value}`}
          className="h-7 gap-1 rounded-sm px-3 text-12 text-fg-2 hover:bg-hover data-[state=on]:bg-brand-soft data-[state=on]:text-brand disabled:pointer-events-none disabled:text-fg-3"
        >
          {option.label}
          <span className="font-mono">{option.count}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
