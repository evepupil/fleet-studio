import { Inbox } from "lucide-react";
import { useStats } from "@/api/queries";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Panel } from "@/components/Panel";
import { overviewStatsQuery } from "@/features/overview/overviewStatsQuery";
import { TasksByProjectCard } from "@/features/overview/TasksByProjectCard";
import { TokenShareCard } from "@/features/overview/TokenShareCard";
import { TokenTrendCard } from "@/features/overview/TokenTrendCard";
import { useOverviewStore } from "@/state/overviewStore";

function StatsBody() {
  const overviewState = useOverviewStore();
  const stats = useStats(overviewStatsQuery(overviewState));

  if (stats.isError) {
    const message = stats.error instanceof Error ? stats.error.message : String(stats.error);
    return (
      <div data-stats-error>
        <Panel data-section="stats-error">
          <ErrorState message={message} onRetry={() => void stats.refetch()} />
        </Panel>
      </div>
    );
  }

  if (stats.data && stats.data.total.tasks === 0 && stats.data.total.usage.totalTokens === 0) {
    return (
      <div data-stats-empty>
        <Panel data-section="stats-empty">
          <EmptyState icon={Inbox} message="这段时间没有任务" />
        </Panel>
      </div>
    );
  }

  // 环形图并排从 ≥ 1024 收窄到 ≥ 1280：工作区比上一版窄，1024 时两张图挤不下。
  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <TokenShareCard />
        <TasksByProjectCard />
      </div>
      <TokenTrendCard />
    </>
  );
}

export { StatsBody };
