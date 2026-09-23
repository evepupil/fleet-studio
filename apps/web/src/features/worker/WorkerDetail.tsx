import { EmptyState } from "../../components/EmptyState";
import { useSelectionStore } from "../../state/selectionStore";
import { useSnapshotStore } from "../../state/snapshotStore";
import { useWorkerStore } from "../../state/workerStore";
import { DetailHeader } from "./DetailHeader";
import { DetailLoadingSkeleton } from "./DetailStates";
import { MetaGrid } from "./MetaGrid";
import { ReportCard } from "./ReportCard";
import { TaskSection } from "./TaskSection";
import { Timeline } from "./timeline/Timeline";
import styles from "./WorkerDetail.module.css";

const { root, centered } = styles;

/**
 * 苦工详情（R6 详情头与元信息、R7 任务与回报），R8 时间线挂在最后由 L4 实现，这里只负责放在正确位置。
 * 状态优先级从上到下：快照未到 → 未选中苦工 → 找不到 → 加载失败 → 加载中 → 正常内容，任何时候只有一种成立。
 */
export function WorkerDetail() {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const detail = useWorkerStore((state) => state.detail);
  const status = useWorkerStore((state) => state.status);
  const error = useWorkerStore((state) => state.error);

  // 快照还没到达时右栏整体空白，比下面的状态优先级更靠前（页面骨架第 0 节）。
  if (snapshot === null) {
    return null;
  }

  if (selectedId === null) {
    return (
      <article className={centered}>
        <EmptyState message="选择左侧的苦工查看详情" />
      </article>
    );
  }

  if (status === "notFound") {
    return (
      <article className={centered} data-detail={selectedId}>
        <EmptyState message="这个苦工已被清理" />
      </article>
    );
  }

  if (status === "error") {
    return (
      <article className={centered} data-detail={selectedId}>
        <EmptyState
          message={`加载失败：${error ?? ""}`}
          action={{ label: "重试", onClick: () => useWorkerStore.getState().open(selectedId) }}
        />
      </article>
    );
  }

  // status !== "ready" 覆盖 "loading" 以及尚未触发 open() 的瞬时 "idle"；detail === null 是防御性兜底。
  if (status !== "ready" || detail === null) {
    return (
      <article className={root} data-detail={selectedId}>
        <DetailLoadingSkeleton />
      </article>
    );
  }

  const latestRun = detail.runs.at(-1);
  const isTerminal = detail.summary.status !== "queued" && detail.summary.status !== "running";
  const showReport = latestRun !== undefined && latestRun.finalText !== null && isTerminal;

  return (
    <article className={root} data-detail={selectedId}>
      <DetailHeader detail={detail} />
      <MetaGrid detail={detail} />
      {showReport && latestRun !== undefined && (
        <ReportCard run={latestRun} runCount={detail.runs.length} />
      )}
      <TaskSection detail={detail} />
      <Timeline />
    </article>
  );
}
