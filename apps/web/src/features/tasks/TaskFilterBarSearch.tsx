import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { TaskFilterState } from "@/state/taskFilterStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

function isDefaultFilters(filters: TaskFilterState): boolean {
  return (
    filters.status === "all" &&
    filters.project === undefined &&
    filters.pool === undefined &&
    filters.role === undefined &&
    filters.channel === undefined &&
    filters.model === undefined &&
    filters.range.kind === "all" &&
    filters.q === "" &&
    filters.sort === "createdAt" &&
    filters.order === "desc"
  );
}

function TaskFilterBarSearch() {
  const filters = useTaskFilterStore((state) => state);
  const query = filters.q;
  const set = filters.set;
  const previousFilters = useRef(filters);
  const [draft, setDraft] = useState(query);
  const draftRef = useRef(query);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  const commitSearch = useCallback(
    (value: string) => {
      clearSearchTimer();
      set({ q: value });
    },
    [clearSearchTimer, set],
  );

  // 外部清除筛选时同步输入框，并取消仍在等待提交的旧关键词。
  useEffect(() => {
    const previous = previousFilters.current;
    if (previous.q !== filters.q || (isDefaultFilters(filters) && draftRef.current !== filters.q)) {
      previousFilters.current = filters;
      draftRef.current = filters.q;
      setDraft(filters.q);
      clearSearchTimer();
      return;
    }
    previousFilters.current = filters;
  }, [filters, clearSearchTimer]);

  useEffect(
    () => () => {
      clearSearchTimer();
    },
    [clearSearchTimer],
  );

  return (
    <div className="relative w-[200px] shrink-0 max-md:w-[140px]">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-3"
      />
      <Input
        data-filter="q"
        aria-label="搜索标题"
        placeholder="搜索标题"
        value={draft}
        className="pl-7 pr-7"
        onChange={(event) => {
          const next = event.currentTarget.value;
          draftRef.current = next;
          setDraft(next);
          clearSearchTimer();
          searchTimer.current = setTimeout(() => {
            set({ q: next });
            searchTimer.current = null;
          }, 300);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitSearch(draft);
          }
        }}
      />
      {draft.length > 0 ? (
        <button
          type="button"
          aria-label="清空搜索"
          className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          onClick={() => {
            draftRef.current = "";
            setDraft("");
            commitSearch("");
          }}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

export { TaskFilterBarSearch };
