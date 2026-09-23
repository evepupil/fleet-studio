import type { PoolView, ProjectView, WorkerSummary } from "@fleet/core";
import { useLayoutEffect, useRef } from "react";
import { Skeleton } from "../../components/Skeleton";
import { useSnapshotStore } from "../../state/snapshotStore";
import styles from "./CapacityStrip.module.css";
import { PoolRow } from "./PoolRow";

const { root, skeletonRow, skeletonNameCol } = styles;

/** 和 PoolRow 里改用 SegmentBar 的阈值一致：超过这个容量画连续分段条，格子宽度不再按容量数走。 */
const SEGMENT_BAR_THRESHOLD = 48;
const CELL_WIDTH = 28;
const CELL_GAP = 2;
/** 全部池都暂停（容量 0 且没有在跑）这种极端情况下的兜底宽度，够放下「已暂停」三个字。 */
const FALLBACK_METER_WIDTH = 120;

/**
 * 计量条列的统一宽度：取全部池里「格子数」的最大值（容量 > 48 的池按 48 算，因为它画的是连续分段条，
 * 不是离散格子），按 SlotMeter 单格最大宽度 28px、格间距 2px 换算成像素。
 * 所有池用同一个宽度，数字列才能紧跟在最宽的那条计量条后面、且各行上下对齐，而不是各自撑满剩余空间。
 */
function computeMeterWidth(pools: readonly PoolView[]): number {
  const maxCells = pools.reduce((max, pool) => {
    const cells = Math.min(SEGMENT_BAR_THRESHOLD, Math.max(pool.capacity, pool.running));
    return Math.max(max, cells);
  }, 0);
  if (maxCells <= 0) {
    return FALLBACK_METER_WIDTH;
  }
  return maxCells * CELL_WIDTH + (maxCells - 1) * CELL_GAP;
}

/**
 * R3 容量条：产品存在的理由。每个模型池一行，展示占用、排队、健康度。
 * 项目和苦工的查表 Map 在这里建一次，往下传给每个 PoolRow，避免子组件各自重复遍历快照。
 */
export function CapacityStrip() {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const sectionRef = useRef<HTMLElement | null>(null);

  // --meter-width 挂在根元素上，靠 CSS 自定义属性的继承传给每一行 PoolRow；
  // 用 DOM API 直接设置而不是走 React 的 style 属性，这样不用给 style 做类型强转就能写自定义属性。
  useLayoutEffect(() => {
    if (snapshot === null || sectionRef.current === null) {
      return;
    }
    const meterWidth = computeMeterWidth(snapshot.pools);
    sectionRef.current.style.setProperty("--meter-width", `${meterWidth}px`);
  }, [snapshot]);

  if (snapshot === null) {
    return (
      <section ref={sectionRef} className={root} data-capacity aria-label="模型池容量">
        <SkeletonRow />
        <SkeletonRow />
      </section>
    );
  }

  const projectByKey = buildProjectMap(snapshot.projects);
  const workerById = buildWorkerMap(snapshot.workers);

  return (
    <section ref={sectionRef} className={root} data-capacity aria-label="模型池容量">
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
