import { RangePicker } from "@/components/RangePicker";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOverviewStore } from "@/state/overviewStore";

function RangeBar() {
  const overviewState = useOverviewStore();
  const isPhone = useMediaQuery("(max-width: 799px)");

  return (
    <div data-range-bar className="flex items-center">
      <RangePicker
        name="overview-range"
        value={overviewState.range}
        onChange={overviewState.setRange}
        variant={isPhone ? "select" : "segmented"}
      />
    </div>
  );
}

export { RangeBar };
