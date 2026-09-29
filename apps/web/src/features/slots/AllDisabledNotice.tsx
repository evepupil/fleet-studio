import { Banner } from "@/components/Banner";
import { useSnapshotStore } from "@/state/snapshotStore";

/**
 * L2 全部停用提醒：配置里有池、但一个都没启用时才出现。
 * 通栏贴在表格上方，Banner 自带下边细线，外面不再包卡片。
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
    <div data-all-disabled>
      <Banner kind="warning">所有池都已停用，没点名的任务派不出去</Banner>
    </div>
  );
}

export { AllDisabledNotice };
