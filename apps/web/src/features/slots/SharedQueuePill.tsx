import { Clock } from "lucide-react";
import { useNavigate } from "react-router";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

/**
 * L1 公共排队：视图栏右侧的小按钮。数字为 0（或快照还没到）时整个不渲染。
 * 点击等价于「带着条件跳到任务列表」——先按公共排队条件重置筛选，再进列表视图。
 */
function SharedQueuePill() {
  const sharedQueued = useSnapshotStore((state) => state.snapshot?.sharedQueued ?? 0);
  const applyFromOverview = useTaskFilterStore((state) => state.applyFromOverview);
  const navigate = useNavigate();

  if (sharedQueued <= 0) {
    return null;
  }

  return (
    <button
      data-shared-queue
      type="button"
      aria-label={`公共排队 ${sharedQueued} 个，查看任务`}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-card px-2 text-12 text-fg-2 shadow-card transition-colors hover:bg-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      onClick={() => {
        applyFromOverview({ status: "queued" });
        navigate("/tasks/list");
      }}
    >
      <Clock aria-hidden="true" className="size-3.5 text-fg-3" />
      <span className="max-md:sr-only">公共排队</span>
      <span className="font-mono text-fg-1">{sharedQueued}</span>
    </button>
  );
}

export { SharedQueuePill };
