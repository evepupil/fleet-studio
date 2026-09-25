import { useStats } from "@/api/queries";
import { StatCard } from "@/components/StatCard";
import { UsageBreakdown } from "@/components/UsageBreakdown";
import { overviewStatsQuery } from "@/features/overview/overviewStatsQuery";
import { formatCompact, formatDuration, formatTokens } from "@/lib/format";
import { useOverviewStore } from "@/state/overviewStore";

function StatCards() {
  const overviewState = useOverviewStore();
  const stats = useStats(overviewStatsQuery(overviewState));
  const loading = stats.isPending && stats.data === undefined;
  const hasError = stats.isError;
  const data = stats.data;
  const showToday = overviewState.range.kind !== "today";
  const usageTitle = data
    ? `输入 ${formatTokens(data.total.usage.inputTokens)} · 输出 ${formatTokens(data.total.usage.outputTokens)} · 缓存 ${formatTokens(data.total.usage.cacheReadTokens)}`
    : undefined;

  return (
    <section data-stat-cards aria-label="统计" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        data-stat="tokens"
        label="token 用量"
        value={hasError || !data ? "—" : formatTokens(data.total.usage.totalTokens)}
        loading={loading}
        lines={
          hasError || !data
            ? []
            : [
                <span key="usage-breakdown" title={usageTitle} className="block truncate">
                  <UsageBreakdown usage={data.total.usage} />
                </span>,
                ...(showToday ? [`今日 ${formatTokens(data.today.usage.totalTokens)}`] : []),
              ]
        }
      />
      <StatCard
        data-stat="tasks"
        label="任务次数"
        value={hasError || !data ? "—" : formatCompact(data.total.tasks)}
        loading={loading}
        lines={hasError || !data || !showToday ? [] : [`今日 ${formatCompact(data.today.tasks)}`]}
      />
      <StatCard
        data-stat="run-time"
        label="总耗时"
        value={hasError || !data ? "—" : formatDuration(data.total.runMs)}
        loading={loading}
        lines={hasError || !data || !showToday ? [] : [`今日 ${formatDuration(data.today.runMs)}`]}
      />
      <StatCard
        data-stat="avg-time"
        label="平均耗时"
        value={
          hasError || !data
            ? "—"
            : data.total.avgRunMs === null
              ? "—"
              : formatDuration(data.total.avgRunMs)
        }
        loading={loading}
        lines={
          hasError || !data || !showToday
            ? []
            : [`今日 ${data.today.avgRunMs === null ? "—" : formatDuration(data.today.avgRunMs)}`]
        }
      />
    </section>
  );
}

export { StatCards };
