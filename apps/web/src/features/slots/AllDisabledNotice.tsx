import { Banner } from "@/components/Banner";
import { useSnapshotStore } from "@/state/snapshotStore";

/**
 * L2 全部停用提醒：配置里有池、但一个都没启用时才出现。
 * Banner 自带下边框，这里外层已经有边框，用子选择器把那条线去掉。
 */
function AllDisabledNotice() {
  const pools = useSnapshotStore((state) => state.snapshot?.pools ?? null);

  if (pools === null || pools.length === 0) {
    return null;
  }
  if (pools.some((pool) => pool.enabled)) {
    return null;
  }

  return (
    <div
      data-all-disabled
      className="overflow-hidden rounded-lg border border-line [&>[data-banner]]:border-b-0"
    >
      <Banner kind="warning">所有池都已停用，没点名的任务派不出去</Banner>
    </div>
  );
}

export { AllDisabledNotice };
