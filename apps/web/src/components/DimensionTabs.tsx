import { STATS_DIMENSIONS, type StatsDimension } from "@fleet/core";
import { SegmentedControl } from "@/components/SegmentedControl";

const DIMENSION_OPTIONS = STATS_DIMENSIONS.map((value) => ({
  value,
  label:
    value === "project"
      ? "项目"
      : value === "model"
        ? "模型"
        : value === "channel"
          ? "渠道"
          : "角色",
}));

interface DimensionTabsProps {
  value: StatsDimension;
  onChange: (value: StatsDimension) => void;
}

function DimensionTabs({ value, onChange }: DimensionTabsProps) {
  return (
    <SegmentedControl
      options={DIMENSION_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="统计维度"
      name="dimension"
      size="sm"
    />
  );
}

export { DimensionTabs };
