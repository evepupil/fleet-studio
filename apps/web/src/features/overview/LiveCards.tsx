import { useNavigate } from "react-router";
import { StatCard } from "@/components/StatCard";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

const RETRYING_VALUE_CLASSES = {
  warning: "text-st-warning",
  normal: "text-fg-1",
};

function LiveCards() {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const applyFromOverview = useTaskFilterStore((state) => state.applyFromOverview);
  const navigate = useNavigate();
  const live = snapshot?.live ?? {
    slotsUsed: 0,
    slotsTotal: 0,
    running: 0,
    queued: 0,
    retrying: 0,
  };
  const disabledPools = snapshot?.pools.filter((pool) => !pool.enabled).length ?? 0;
  const runningProjects = new Set(
    snapshot?.workers
      .filter((worker) => worker.status === "running")
      .map((worker) => worker.projectKey),
  ).size;
  const sharedQueued = snapshot?.sharedQueued ?? 0;
  const pct = live.slotsTotal === 0 ? 0 : Math.min(100, (live.slotsUsed / live.slotsTotal) * 100);

  function openTasks(status: "running" | "queued" | "retrying"): void {
    // 先重置并应用总览筛选，避免任务页沿用此前的条件。
    applyFromOverview({ status });
    navigate("/tasks");
  }

  return (
    <section data-live-cards aria-label="实时" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        data-stat="slots"
        label="槽位占用"
        value={`${live.slotsUsed} / ${live.slotsTotal}`}
        ariaLabel={`槽位占用 ${live.slotsUsed} / ${live.slotsTotal}，打开槽位页`}
        onClick={() => navigate("/slots")}
        loading={snapshot === null}
        lines={[
          <div
            key="slots-bar"
            data-slots-bar
            role="img"
            aria-label={`已用 ${live.slotsUsed}，容量 ${live.slotsTotal}`}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-meter-track"
          >
            <div className="h-full rounded-full bg-status-running" style={{ width: `${pct}%` }} />
          </div>,
          ...(disabledPools > 0 ? [`停用 ${disabledPools} 个池`] : []),
        ]}
      />
      <StatCard
        data-stat="running"
        label="工作中"
        value={`${live.running}`}
        ariaLabel={`工作中 ${live.running} 个，查看任务`}
        onClick={() => openTasks("running")}
        loading={snapshot === null}
        lines={runningProjects > 0 ? [`${runningProjects} 个项目`] : []}
      />
      <StatCard
        data-stat="queued"
        label="排队中"
        value={`${live.queued}`}
        ariaLabel={`排队中 ${live.queued} 个，查看任务`}
        onClick={() => openTasks("queued")}
        loading={snapshot === null}
        lines={sharedQueued > 0 ? [`公共排队 ${sharedQueued}`] : []}
      />
      <StatCard
        data-stat="retrying"
        label="重试中"
        value={`${live.retrying}`}
        valueClassName={
          live.retrying > 0 ? RETRYING_VALUE_CLASSES.warning : RETRYING_VALUE_CLASSES.normal
        }
        ariaLabel={`重试中 ${live.retrying} 个，查看任务`}
        onClick={() => openTasks("retrying")}
        loading={snapshot === null}
      />
    </section>
  );
}

export { LiveCards };
