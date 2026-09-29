import { CornerDownLeft, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTaskSearch } from "@/api/queries";
import { Kbd } from "@/components/Kbd";
import { ProjectLabel } from "@/components/ProjectLabel";
import { StatusIcon } from "@/components/StatusIcon";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { matchLiveTasks, mergeSearchResults } from "@/lib/search";
import { STATUS_META } from "@/lib/status";
import { useSearchStore } from "@/state/searchStore";
import { useSnapshotStore } from "@/state/snapshotStore";

function SearchDialog() {
  const open = useSearchStore((state) => state.open);
  const setOpen = useSearchStore((state) => state.setOpen);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeState, setActiveState] = useState(0);

  // 弹窗每次打开时清空关键词、当前项回到第 0 条
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setActiveState(0);
    }
  }, [open]);

  // 接口查询用停止输入 200 毫秒后的关键词；关键词一变就清掉上一个定时器，卸载时同样清掉
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const live = matchLiveTasks(snapshot?.workers ?? [], query);
  const search = useTaskSearch(debouncedQuery);
  const results = mergeSearchResults(live, search.data?.items ?? []);
  const hasQuery = query.trim().length > 0;
  // 结果变少时把当前项夹回范围内，避免指向不存在的条目
  const activeIndex = Math.min(activeState, Math.max(results.length - 1, 0));
  const activeId = results[activeIndex]?.id;

  // 当前项变化时让它滚进可视区
  useEffect(() => {
    if (activeId !== undefined) {
      document.getElementById(`search-option-${activeId}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeId]);

  const go = (id: string) => {
    navigate(`/tasks/${id}`);
    setOpen(false);
  };

  // 组合框键盘：↓/↑ 在结果间移动（到头绕回），回车跳到当前项；监听放在内容容器上，输入框里按键会冒泡到这里
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveState((activeIndex + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveState((activeIndex + results.length - 1) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = results[activeIndex];
      if (active) go(active.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        aria-describedby={undefined}
        data-search-dialog
        className="top-[12vh] w-[min(560px,calc(100vw-24px))] translate-y-0 overflow-hidden p-0"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">搜索任务</DialogTitle>
        <div className="flex h-11 items-center gap-2 border-b border-line px-3">
          <Search aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
          <input
            data-search-input
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={activeId === undefined ? undefined : `search-option-${activeId}`}
            aria-autocomplete="list"
            autoFocus
            placeholder="按标题或编号搜索"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveState(0);
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-13 text-fg-1 outline-none placeholder:text-fg-3"
          />
          <span className="shrink-0 max-md:hidden">
            <Kbd>Esc</Kbd>
          </span>
        </div>
        <div className="max-h-[min(360px,60vh)] overflow-y-auto p-1">
          {results.length > 0 ? (
            <>
              {!hasQuery ? <div className="px-2 pb-1 pt-1.5 text-12 text-fg-3">最近</div> : null}
              {/* 组合框的列表框角色是 ARIA 规定的写法，非交互元素角色冲突是误报 */}
              {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: 列表框本身不可聚焦，键盘焦点由输入框（combobox）持有 */}
              <ul id="search-results" role="listbox" aria-label="搜索结果">
                {results.map((worker, index) => {
                  const active = index === activeIndex;
                  return (
                    <li
                      key={worker.id}
                      id={`search-option-${worker.id}`}
                      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: 组合框选项由 ARIA 规定写在 li 上，交互性由父级 combobox 输入框承担
                      role="option"
                      aria-selected={active}
                      data-search-result={worker.id}
                      data-active={active ? "true" : "false"}
                      className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 data-[active=true]:bg-hover"
                      // 键盘焦点常驻输入框（组合框模式），选项本身不进 Tab 序列；点击行为由容器键盘事件与回车处理兜底
                      tabIndex={-1}
                      onMouseEnter={() => setActiveState(index)}
                      onClick={() => go(worker.id)}
                      onKeyDown={(event) => {
                        // 选项极少被聚焦，这里只为满足点击配对键盘事件；拦下避免容器再触发一次
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          go(worker.id);
                        }
                      }}
                    >
                      <StatusIcon
                        status={worker.status}
                        retrying={worker.retry !== null}
                        label={STATUS_META[worker.status].label}
                      />
                      <span className="w-14 shrink-0 font-mono text-12 text-fg-3">{worker.id}</span>
                      <span
                        className="min-w-0 flex-1 truncate text-13 text-fg-1"
                        title={worker.title}
                      >
                        {worker.title}
                      </span>
                      <span className="max-md:hidden shrink-0 max-w-[160px]">
                        <ProjectLabel projectKey={worker.projectKey} />
                      </span>
                      {active ? (
                        <CornerDownLeft
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-fg-3"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : hasQuery && search.isFetching ? (
            <div className="flex flex-col gap-1">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : hasQuery && search.error !== null ? (
            <p className="px-2 py-8 text-center text-13 text-fg-2">
              搜索失败：{search.error.message}
            </p>
          ) : (
            <p className="px-2 py-8 text-center text-13 text-fg-2">没有找到任务</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { SearchDialog };
