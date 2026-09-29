import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_SORT_OPTIONS, type TaskView } from "@/lib/taskFilters";
import { CARD_PROP_OPTIONS, useDisplayStore } from "@/state/displayStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

const PROP_ON =
  "h-6 rounded-md border border-line-strong bg-selected px-2 text-12 font-medium text-fg-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const PROP_OFF =
  "h-6 rounded-md border border-line px-2 text-12 text-fg-3 transition-colors hover:bg-hover hover:text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function DisplayMenu({ view }: { view: TaskView }) {
  const cardProps = useDisplayStore((state) => state.cardProps);
  const setCardProp = useDisplayStore((state) => state.setCardProp);
  const filters = useTaskFilterStore((state) => state);
  const setFilters = useTaskFilterStore((state) => state.set);
  const descending = filters.order === "desc";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" data-display-trigger aria-label="显示">
          <SlidersHorizontal aria-hidden="true" />
          <span className="max-md:sr-only">显示</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent data-display-menu align="end" className="flex w-[260px] flex-col gap-2">
        {view === "board" ? (
          <>
            <div className="text-12 text-fg-3">卡片显示</div>
            <div className="flex flex-wrap gap-1.5">
              {CARD_PROP_OPTIONS.map(({ key, label }) => {
                const on = cardProps[key];
                return (
                  <button
                    key={key}
                    type="button"
                    data-card-prop={key}
                    aria-pressed={on}
                    onClick={() => setCardProp(key, !on)}
                    className={on ? PROP_ON : PROP_OFF}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="text-12 text-fg-3">排序</div>
            <div className="flex items-center gap-2">
              <Select
                value={filters.sort}
                onValueChange={(value) => {
                  const option = TASK_SORT_OPTIONS.find((item) => item.value === value);
                  if (option !== undefined) setFilters({ sort: option.value });
                }}
              >
                <SelectTrigger data-sort-key aria-label="排序方式" className="w-[120px]">
                  <SelectValue>
                    {TASK_SORT_OPTIONS.find((option) => option.value === filters.sort)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TASK_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                data-sort-order
                aria-label={descending ? "降序，点击改为升序" : "升序，点击改为降序"}
                onClick={() => setFilters({ order: descending ? "asc" : "desc" })}
              >
                {descending ? (
                  <>
                    <ArrowDown aria-hidden="true" className="size-3.5" />
                    降序
                  </>
                ) : (
                  <>
                    <ArrowUp aria-hidden="true" className="size-3.5" />
                    升序
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { DisplayMenu };
