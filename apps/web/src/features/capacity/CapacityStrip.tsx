import type { ProjectView, WorkerSummary } from "@fleet/core";
import { Skeleton } from "../../components/Skeleton";
import { useSnapshotStore } from "../../state/snapshotStore";
import styles from "./CapacityStrip.module.css";
import { PoolRow } from "./PoolRow";

const { root, skeletonRow, skeletonNameCol } = styles;

/**
 * R3 容量条：产品存在的理由。每个模型池一行，展示占用、排队、健康度。
 * 项目和苦工的查表 Map 在这里建一次，往下传给每个 PoolRow，避免子组件各自重复遍历快照。
 */
export function CapacityStrip() {
  const snapshot = useSnapshotStore((state) => state.snapshot);

  if (snapshot === null) {
    return (
      <section className={root} data-capacity aria-label="模型池容量">
        <SkeletonRow />
        <SkeletonRow />
      </section>
    );
  }

  const projectByKey = buildProjectMap(snapshot.projects);
  const workerById = buildWorkerMap(snapshot.workers);

  return (
    <section className={root} data-capacity aria-label="模型池容量">
      {snapshot.pools.map((pool) => (
        <PoolRow key={pool.id} pool={pool} projectByKey={projectByKey} workerById={workerById} />
      ))}
    </section>
  );
}

function buildProjectMap(projects: readonly ProjectView[]): ReadonlyMap<string, ProjectView> {
  return new Map(projects.map((project) => [project.key, project] as const));
}

function buildWorkerMap(workers: readonly WorkerSummary[]): ReadonlyMap<string, WorkerSummary> {
  return new Map(workers.map((worker) => [worker.id, worker] as const));
}

/** 快照还没到时的骨架，形状对齐 PoolRow 的三栏（见 design/工作区.md R3 第 5 节）。 */
function SkeletonRow() {
  return (
    <div className={skeletonRow}>
      <div className={skeletonNameCol}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="80%" height={12} />
      </div>
      <Skeleton width="100%" height={18} />
      <Skeleton width={80} height={22} />
    </div>
  );
}
