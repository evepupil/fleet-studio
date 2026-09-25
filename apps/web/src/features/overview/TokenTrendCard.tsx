import type { StatsDimension, TrendSeries } from "@fleet/core";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useStats } from "@/api/queries";
import { DimensionTabs } from "@/components/DimensionTabs";
import { SectionCard } from "@/components/SectionCard";
import { SeriesLegend } from "@/components/SeriesLegend";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { overviewStatsQuery } from "@/features/overview/overviewStatsQuery";
import { seriesColorVar } from "@/lib/colors";
import { formatBucketLabel, formatBucketTitle, formatTokens } from "@/lib/format";
import { useOverviewStore } from "@/state/overviewStore";

const DIMENSION_LABELS: Record<StatsDimension, string> = {
  model: "模型",
  channel: "渠道",
  project: "项目",
  role: "角色",
};
const EMPTY_HIDDEN_KEYS: ReadonlySet<string> = new Set();

function seriesKey(series: TrendSeries): string {
  return series.isOther ? "__other" : series.key;
}

function TokenTrendCard() {
  const overviewState = useOverviewStore();
  const filterSignature = `${overviewState.dimension}:${overviewState.range.kind}:${overviewState.range.from ?? ""}:${overviewState.range.to ?? ""}`;
  const stats = useStats(overviewStatsQuery(overviewState));
  const [hiddenState, setHiddenState] = useState<{
    signature: string;
    keys: ReadonlySet<string>;
  }>(() => ({ signature: filterSignature, keys: new Set() }));
  const hiddenKeys =
    hiddenState.signature === filterSignature ? hiddenState.keys : EMPTY_HIDDEN_KEYS;
  const data = stats.data;
  const series = data?.tokenTrend ?? [];
  const buckets = data?.buckets ?? [];
  const granularity = data?.granularity ?? "day";
  const loading = stats.isPending && data === undefined;

  const legendItems = series.map((item) => ({
    key: seriesKey(item),
    label: item.label,
    colorVar: seriesColorVar(item.colorIndex),
    hidden: hiddenKeys.has(seriesKey(item)),
  }));
  const chartConfig = Object.fromEntries(
    series.map((item) => [
      seriesKey(item),
      { label: item.label, color: seriesColorVar(item.colorIndex) },
    ]),
  );
  const chartData: Array<Record<string, string | number>> = [];
  buckets.forEach((bucket, index) => {
    const row: Record<string, string | number> = { bucket };
    for (const item of series) {
      row[seriesKey(item)] = item.points[index] ?? 0;
    }
    chartData.push(row);
  });

  function toggleSeries(key: string): void {
    const visibleCount = series.filter((item) => !hiddenKeys.has(seriesKey(item))).length;
    if (!hiddenKeys.has(key) && visibleCount <= 1) return;
    setHiddenState((current) => {
      const next = new Set(
        current.signature === filterSignature ? current.keys : EMPTY_HIDDEN_KEYS,
      );
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { signature: filterSignature, keys: next };
    });
  }

  return (
    <div data-token-trend className="min-w-0">
      <SectionCard
        data-section="token-trend"
        title="token 趋势"
        right={
          <DimensionTabs value={overviewState.dimension} onChange={overviewState.setDimension} />
        }
      >
        {loading ? (
          <Skeleton className="h-[280px] w-full max-[799px]:h-[220px]" />
        ) : (
          <>
            <div className="mb-3">
              <SeriesLegend items={legendItems} onToggle={toggleSeries} />
            </div>
            <div
              role="img"
              aria-label={`token 趋势，按${DIMENSION_LABELS[overviewState.dimension]}，${series.length} 条线，${buckets.length} 个时间段`}
            >
              <ChartContainer
                config={chartConfig}
                className="h-[280px] w-full max-[799px]:h-[220px]"
              >
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tick={{ fill: "var(--text-3)", fontSize: 11 }}
                    tickFormatter={(value) => formatBucketLabel(String(value), granularity)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: "var(--text-3)", fontSize: 11 }}
                    tickFormatter={(value) => formatTokens(Number(value))}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => formatBucketTitle(String(value), granularity)}
                        formatter={(value) => formatTokens(Number(value))}
                      />
                    }
                  />
                  {series.map((item) => (
                    <Line
                      key={seriesKey(item)}
                      type="monotone"
                      dataKey={seriesKey(item)}
                      name={item.label}
                      stroke={seriesColorVar(item.colorIndex)}
                      strokeWidth={2}
                      dot={{
                        r: 3,
                        fill: seriesColorVar(item.colorIndex),
                        stroke: "var(--bg-panel)",
                        strokeWidth: 1,
                      }}
                      activeDot={{
                        r: 5,
                        fill: seriesColorVar(item.colorIndex),
                        stroke: "var(--bg-panel)",
                        strokeWidth: 2,
                      }}
                      isAnimationActive={false}
                      hide={hiddenKeys.has(seriesKey(item))}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            </div>
            <table className="sr-only">
              <caption>token 趋势明细</caption>
              <thead>
                <tr>
                  <th scope="col">时间段</th>
                  {series.map((item) => (
                    <th key={seriesKey(item)} scope="col">
                      {item.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map((bucket, index) => (
                  <tr key={bucket}>
                    <th scope="row">{formatBucketTitle(bucket, granularity)}</th>
                    {series.map((item) => (
                      <td key={seriesKey(item)}>{formatTokens(item.points[index] ?? 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </SectionCard>
    </div>
  );
}

export { TokenTrendCard };
