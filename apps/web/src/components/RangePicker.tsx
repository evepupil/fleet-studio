import type { RangeKind } from "@fleet/core";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRangeLabel } from "@/lib/format";
import { useNow } from "@/state/nowStore";

export interface RangeValue {
  kind: RangeKind;
  from?: string;
  to?: string;
}

interface RangePickerProps {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  variant: "segmented" | "select";
  name: string;
}

const PRESET_OPTIONS = [
  { value: "today", label: "今日" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "all", label: "全部" },
] as const;

function fromDateString(value?: string): Date | undefined {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined;
}

function toDateString(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function RangePicker({ value, onChange, variant, name }: RangePickerProps) {
  const nowMs = useNow();
  const [open, setOpen] = useState(false);
  const [monthCount, setMonthCount] = useState(2);
  const selectedRange = useMemo<DateRange | undefined>(() => {
    const from = fromDateString(value.from);
    const to = fromDateString(value.to);
    return from === undefined ? undefined : { from, ...(to === undefined ? {} : { to }) };
  }, [value.from, value.to]);
  const customLabel = value.kind === "custom" ? formatRangeLabel(value, nowMs) : "自选";
  const selectedValue = open ? "custom" : value.kind;
  const options = [...PRESET_OPTIONS, { value: "custom" as const, label: customLabel }];
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? "全部";

  function choose(kind: RangeKind | "custom"): void {
    if (kind === "custom") {
      setOpen(true);
      return;
    }
    setOpen(false);
    onChange({ kind });
  }

  const picker =
    variant === "segmented" ? (
      <SegmentedControl
        options={options}
        value={selectedValue}
        onChange={choose}
        ariaLabel="时间范围"
        name={name}
      />
    ) : (
      <Select
        value={selectedValue}
        onValueChange={(next: string) => choose(next as RangeKind | "custom")}
      >
        <SelectTrigger aria-label="时间范围" className="h-8 w-[180px] bg-panel text-12">
          <SelectValue>{`时间：${selectedLabel}`}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) setMonthCount(window.innerWidth >= 1024 ? 2 : 1);
      }}
    >
      <PopoverAnchor asChild>
        <div>{picker}</div>
      </PopoverAnchor>
      <PopoverContent data-range-calendar align="end" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={selectedRange}
          numberOfMonths={monthCount}
          onSelect={(nextRange) => {
            if (nextRange?.from && nextRange.to) {
              onChange({
                kind: "custom",
                from: toDateString(nextRange.from),
                to: toDateString(nextRange.to),
              });
              setOpen(false);
            }
          }}
          disabled={{ after: new Date(nowMs) }}
        />
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-12">
          <span className="text-fg-2">
            {selectedRange?.from ? formatRangeLabel(value, nowMs) : "选择开始和结束日期"}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            关闭
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { RangePicker };
