import { useEffect } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useWorkerStore } from "@/state/workerStore";
import { DetailHeader } from "./DetailHeader";
import { DetailLoadingSkeleton } from "./DetailStates";
import { MetaGrid } from "./MetaGrid";
import { ReportCard } from "./ReportCard";
import { TaskSection } from "./TaskSection";
import { Timeline } from "./timeline/Timeline";

export interface WorkerDetailProps {
  id: string;
  onClose(): void;
}

/**
 * 详情卡片自己就是滚动容器（跟随滚动按 id="detail-scroll" 找它），所以滚动和边框在这一层，
 * 内边距与最大宽挪到里面的内容层。外层类名与 T4 规格逐字一致。
 */
const ROOT_CLASS = "min-h-0 min-w-0 overflow-y-auto rounded-lg border border-line bg-panel";
/** 内容内边距与最大宽：宽屏 --sp-5 --sp-6 40px、窄屏统一 --sp-4，最大宽 1120px 左对齐。 */
const BODY_CLASS = "max-w-[1120px] p-4 lg:px-6 lg:pt-5 lg:pb-10";
/** 空状态与失败状态占满右栏居中（第一版 .centered 的等价写法）。 */
const CENTERED_CLASS = "flex min-h-full items-center justify-center";

/**
 * 苦工详情（R6 详情头与元信息、R7 任务与回报、R8 时间线）。
 * 状态优先级从上到下：找不到 → 加载失败 → 加载中 → 正常内容，任何时候只有一种成立。
 * 挂载或编号变化时订阅这个苦工的详情和事件流，卸载时退订，避免离开详情后还在收数据。
 */
export function WorkerDetail({ id, onClose }: WorkerDetailProps) {
  const detail = useWorkerStore((state) => state.detail);
  const status = useWorkerStore((state) => state.status);
  const error = useWorkerStore((state) => state.error);

  useEffect(() => {
    useWorkerStore.getState().open(id);
    return () => useWorkerStore.getState().close();
  }, [id]);

  if (status === "notFound") {
    return (
      <section data-detail id="detail-scroll" className={ROOT_CLASS}>
        <div className={CENTERED_CLASS}>
          <EmptyState message="没有这个任务" />
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section data-detail id="detail-scroll" className={ROOT_CLASS}>
        <div className={CENTERED_CLASS}>
          <EmptyState
            message={`加载失败：${error ?? ""}`}
            action={{ label: "重试", onClick: () => useWorkerStore.getState().open(id) }}
          />
        </div>
      </section>
    );
  }

  // status !== "ready" 覆盖 "loading" 以及尚未触发 open() 的瞬时 "idle"；detail === null 是防御性兜底。
  if (status !== "ready" || detail === null) {
    return (
      <section data-detail id="detail-scroll" className={ROOT_CLASS}>
        <div className={BODY_CLASS}>
          <DetailLoadingSkeleton />
        </div>
      </section>
    );
  }

  const latestRun = detail.runs.at(-1);
  const isTerminal = detail.summary.status !== "queued" && detail.summary.status !== "running";
  const showReport = latestRun !== undefined && latestRun.finalText !== null && isTerminal;

  return (
    <section data-detail id="detail-scroll" className={ROOT_CLASS}>
      <div className={BODY_CLASS}>
        <DetailHeader detail={detail} onClose={onClose} />
        <MetaGrid detail={detail} />
        {showReport && latestRun !== undefined && (
          <ReportCard run={latestRun} runCount={detail.runs.length} />
        )}
        <TaskSection detail={detail} />
        <Timeline />
      </div>
    </section>
  );
}
