import { useStats } from "@/api/queries";
import { Metric, MetricStrip } from "@/components/MetricStrip";
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
    <div data-stat-cards>
      <MetricStrip aria-label="统计">
        <Metric
          data-stat="tokens"
          label="token 用量"
          value={hasError || !data ? "—" : formatTokens(data.total.usage.totalTokens)}
          loading={loading}
          extra={
            hasError || !data ? undefined : (
              <span className="block truncate text-12 text-fg-2" title={usageTitle}>
                <UsageBreakdown usage={data.total.usage} />
              </span>
            )
          }
          sub={
            hasError || !data || !showToday
              ? undefined
              : `今日 ${formatTokens(data.today.usage.totalTokens)}`
          }
        />
        <Metric
          data-stat="tasks"
          label="任务次数"
          value={hasError || !data ? "—" : formatCompact(data.total.tasks)}
          loading={loading}
          sub={
            hasError || !data || !showToday ? undefined : `今日 ${formatCompact(data.today.tasks)}`
          }
        />
        <Metric
          data-stat="run-time"
          label="总耗时"
          value={hasError || !data ? "—" : formatDuration(data.total.runMs)}
          loading={loading}
          sub={
            hasError || !data || !showToday ? undefined : `今日 ${formatDuration(data.today.runMs)}`
          }
        />
        <Metric
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
          sub={
            hasError || !data || !showToday
              ? undefined
              : `今日 ${data.today.avgRunMs === null ? "—" : formatDuration(data.today.avgRunMs)}`
          }
        />
      </MetricStrip>
    </div>
  );
}

export { StatCards };
