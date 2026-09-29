import { useEffect } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useWorkerStore } from "@/state/workerStore";
import { DetailHeader } from "./DetailHeader";
import { DetailLoadingSkeleton } from "./DetailStates";
import { ReportCard } from "./ReportCard";
import { TaskProperties } from "./TaskProperties";
import { TaskSection } from "./TaskSection";
import { Timeline } from "./timeline/Timeline";

export interface WorkerDetailProps {
  id: string;
  onBack(): void;
}

const PROPERTY_SKELETON_KEYS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

/**
 * 挂载或编号变化时订阅详情和事件流，卸载时退订，避免离开详情后还在收数据。
 * 时间线与正文共用 detail-scroll，滚动跟随逻辑据此定位容器。
 */
export function WorkerDetail({ id, onBack }: WorkerDetailProps) {
  const detail = useWorkerStore((state) => state.detail);
  const status = useWorkerStore((state) => state.status);
  const error = useWorkerStore((state) => state.error);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    useWorkerStore.getState().open(id);
    return () => useWorkerStore.getState().close();
  }, [id]);

  if (status === "notFound") {
    return (
      <div data-detail className="flex flex-1 items-center justify-center p-6">
        <EmptyState message="没有这个任务" action={{ label: "回到任务", onClick: onBack }} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div data-detail className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          message={`加载失败：${error ?? ""}`}
          action={{ label: "重试", onClick: () => useWorkerStore.getState().open(id) }}
        />
      </div>
    );
  }

  if (status !== "ready" || detail === null) {
    return (
      <div data-detail className="flex min-h-0 min-w-0 flex-1">
        <div id="detail-scroll" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[800px] px-6 pb-12 pt-6 max-lg:px-4 max-lg:pt-4">
            <DetailLoadingSkeleton />
          </div>
        </div>
        {isDesktop ? (
          <aside
            data-properties-aside
            className="w-[var(--detail-aside-w)] shrink-0 overflow-y-auto border-l border-line px-4 py-5"
          >
            <div className="flex flex-col gap-4">
              {PROPERTY_SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-4 w-full" />
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    );
  }

  const latestRun = detail.runs.at(-1);
  const isTerminal = detail.summary.status !== "queued" && detail.summary.status !== "running";
  const showReport = latestRun !== undefined && latestRun.finalText !== null && isTerminal;

  return (
    <div data-detail className="flex min-h-0 min-w-0 flex-1">
      <div id="detail-scroll" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[800px] px-6 pb-12 pt-6 max-lg:px-4 max-lg:pt-4">
          <DetailHeader detail={detail} />
          {!isDesktop ? <TaskProperties detail={detail} variant="inline" /> : null}
          {showReport && latestRun !== undefined && (
            <ReportCard run={latestRun} runCount={detail.runs.length} />
          )}
          <TaskSection detail={detail} />
          <Timeline />
        </div>
      </div>
      {isDesktop ? (
        <aside
          data-properties-aside
          className="w-[var(--detail-aside-w)] shrink-0 overflow-y-auto border-l border-line px-4 py-5"
        >
          <TaskProperties detail={detail} variant="aside" />
        </aside>
      ) : null}
    </div>
  );
}
