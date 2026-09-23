import { useMemo, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { Skeleton } from "../../../components/Skeleton";
import {
  buildTimelineRows,
  countTimelineRows,
  filterTimelineRows,
} from "../../../lib/timelineView";
import { useNow } from "../../../state/nowStore";
import { useWorkerStore } from "../../../state/workerStore";
import { JumpToLatest } from "./JumpToLatest";
import styles from "./Timeline.module.css";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineRow } from "./TimelineRow";
import { useFollowScroll } from "./useFollowScroll";

const { root, list, loadMoreRow, loadMoreButton, skeletonList, empty } = styles;

/** 行数超过这个数才截断，只渲染最后这么多行 */
const MAX_VISIBLE_ROWS = 1000;
/** 加载骨架的行数，固定 key 避免用数组下标 */
const SKELETON_KEYS = ["a", "b", "c", "d", "e"];

/**
 * R8 时间线：本页停留最久的区域。事件的合并、筛选、计数交给 lib/timelineView 的纯函数
 * （地基路已实现并配了单测），这里只管渲染、展开状态和跟随滚动这些界面层的事。
 */
export function Timeline() {
  const events = useWorkerStore((state) => state.events);
  const filter = useWorkerStore((state) => state.filter);
  const setFilter = useWorkerStore((state) => state.setFilter);
  const status = useWorkerStore((state) => state.status);
  const detail = useWorkerStore((state) => state.detail);
  const now = useNow();

  const workerId = detail?.summary.id ?? null;
  const workerStatus = detail?.summary.status ?? null;
  const workerRunning = workerStatus === "running";

  // 合并只依赖 events；筛选切换不用重新合并，只需要重新筛一遍已经合并好的行
  const rows = useMemo(() => buildTimelineRows(events), [events]);
  const counts = useMemo(() => countTimelineRows(rows), [rows]);
  const filteredRows = useMemo(() => filterTimelineRows(rows, filter), [rows, filter]);

  // 「进行中」转圈只给全部工具行里最后一个，先在未筛选的行里定位它的 key
  const lastToolKey = useMemo(() => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row !== undefined && row.kind === "tool") {
        return row.key;
      }
    }
    return null;
  }, [rows]);

  // 展开状态（工具参数/结果、思考、长文字）按行 key 记录；超过 1000 行只渲染最后 1000 行，
  // 点「显示更早的」才全量渲染。两者都要在切换苦工时清空。用渲染期比较上一次的 workerId
  // 而不是 useEffect 去重置，避免多渲染一轮才清零，让上一个苦工的展开状态在新苦工身上闪一下。
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [trackedWorkerId, setTrackedWorkerId] = useState(workerId);
  if (workerId !== trackedWorkerId) {
    setTrackedWorkerId(workerId);
    setExpandedKeys(new Set());
    setShowAll(false);
  }

  function handleToggle(key: string): void {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const hiddenCount = Math.max(0, filteredRows.length - MAX_VISIBLE_ROWS);
  const visibleRows = hiddenCount === 0 || showAll ? filteredRows : filteredRows.slice(hiddenCount);

  const { atBottom, unreadCount, jumpToLatest } = useFollowScroll({
    workerId,
    running: workerRunning,
    rowCount: visibleRows.length,
  });

  function renderEmptyMessage() {
    if (workerStatus === "queued") {
      const position = detail?.summary.queuePosition ?? null;
      return <EmptyState message={position !== null ? `排队第 ${position} 位` : "排队中"} />;
    }
    if (workerStatus === "running") {
      return <EmptyState message="等待第一条输出" />;
    }
    return <EmptyState message="没有输出" />;
  }

  function renderBody() {
    if (status === "loading") {
      return (
        <div className={skeletonList}>
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} height={20} />
          ))}
        </div>
      );
    }
    if (status !== "ready") {
      // idle / notFound / error：R6 会把整个右栏换成 EmptyState，正常不会渲染到这里，防御性地不画内容
      return null;
    }
    if (rows.length === 0) {
      return <div className={empty}>{renderEmptyMessage()}</div>;
    }
    return (
      <div className={list}>
        {hiddenCount > 0 && !showAll && (
          <div className={loadMoreRow}>
            <button type="button" className={loadMoreButton} onClick={() => setShowAll(true)}>
              显示更早的 {hiddenCount} 条
            </button>
          </div>
        )}
        <ol role="log" aria-live={atBottom ? "polite" : "off"}>
          {visibleRows.map((row) => (
            <TimelineRow
              key={row.key}
              row={row}
              now={now}
              expanded={expandedKeys.has(row.key)}
              onToggle={handleToggle}
              isLastTool={row.kind === "tool" && row.key === lastToolKey}
              workerRunning={workerRunning}
            />
          ))}
        </ol>
      </div>
    );
  }

  return (
    <section className={root} data-timeline aria-label="时间线">
      <TimelineHeader counts={counts} filter={filter} onFilterChange={setFilter} />
      {renderBody()}
      {unreadCount > 0 && <JumpToLatest count={unreadCount} onClick={jumpToLatest} />}
    </section>
  );
}
