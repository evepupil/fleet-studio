import type { StatsDimension, StatsQuery } from "@fleet/core";
import type { RangeState } from "@/state/overviewStore";

export interface OverviewStatsState {
  range: RangeState;
  dimension: StatsDimension;
}

export function overviewStatsQuery(state: OverviewStatsState): StatsQuery {
  return {
    range: state.range.kind,
    from: state.range.from,
    to: state.range.to,
    dimension: state.dimension,
  };
}
