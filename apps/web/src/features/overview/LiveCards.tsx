import { useNavigate } from "react-router";
import { Metric, MetricStrip } from "@/components/MetricStrip";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

/** 重试中的数字只在有重试时变警告色：完整类名映射，避免 Tailwind 拼接类名失效。 */
const RETRYING_VALUE_CLASSES = {
  warning: "text-status-warning",
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
    navigate("/tasks/list");
  }

  return (
    <div data-live-cards>
      <MetricStrip aria-label="实时">
        <Metric
          data-stat="slots"
          label="槽位占用"
          value={`${live.slotsUsed} / ${live.slotsTotal}`}
          ariaLabel={`槽位占用 ${live.slotsUsed} / ${live.slotsTotal}，打开槽位页`}
          onClick={() => navigate("/slots")}
          loading={snapshot === null}
          extra={
            <div
              data-slots-bar
              role="img"
              aria-label={`已用 ${live.slotsUsed}，容量 ${live.slotsTotal}`}
              className="mt-1 h-1 w-full overflow-hidden rounded-full bg-meter-track"
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          }
          sub={disabledPools > 0 ? `停用 ${disabledPools} 个池` : undefined}
        />
        <Metric
          data-stat="running"
          label="工作中"
          value={`${live.running}`}
          ariaLabel={`工作中 ${live.running} 个，查看任务`}
          onClick={() => openTasks("running")}
          loading={snapshot === null}
          sub={runningProjects > 0 ? `${runningProjects} 个项目` : undefined}
        />
        <Metric
          data-stat="queued"
          label="排队中"
          value={`${live.queued}`}
          ariaLabel={`排队中 ${live.queued} 个，查看任务`}
          onClick={() => openTasks("queued")}
          loading={snapshot === null}
          sub={sharedQueued > 0 ? `公共排队 ${sharedQueued}` : undefined}
        />
        <Metric
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
      </MetricStrip>
    </div>
  );
}

export { LiveCards };
