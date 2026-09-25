import { useStats } from "@/api/queries";
import { RangePicker } from "@/components/RangePicker";
import { overviewStatsQuery } from "@/features/overview/overviewStatsQuery";
import { useOverviewStore } from "@/state/overviewStore";

const GRANULARITY_LABELS = {
  hour: "按小时",
  day: "按天",
  week: "按周",
};

function RangeBar() {
  const overviewState = useOverviewStore();
  const stats = useStats(overviewStatsQuery(overviewState));
  const granularity = stats.data?.granularity;

  return (
    <section
      data-range-bar
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-5 py-3"
    >
      <span className="text-12 text-fg-3">时间范围</span>
      <RangePicker
        variant="segmented"
        name="overview-range"
        value={overviewState.range}
        onChange={overviewState.setRange}
      />
      {granularity ? (
        <span data-granularity={granularity} className="ml-auto text-12 text-fg-3">
          {GRANULARITY_LABELS[granularity]}
        </span>
      ) : null}
    </section>
  );
}

export { RangeBar };
