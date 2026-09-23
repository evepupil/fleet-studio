import type { PoolView, ProjectView, WorkerSummary } from "@fleet/core";
import { PoolLegend } from "./PoolLegend";
import { PoolNumbers } from "./PoolNumbers";
import styles from "./PoolRow.module.css";
import { SegmentBar } from "./SegmentBar";
import { SlotMeter } from "./SlotMeter";

const { root, nameCol, poolId, poolLabel, poolModel, meterCol, pausedTrack, pausedText } = styles;

/** 容量 > 48 时改用连续分段条；演示数据没有这种池，但阈值本身是规格明确写死的业务分界。 */
const SEGMENT_BAR_THRESHOLD = 48;

export interface PoolRowProps {
  pool: PoolView;
  projectByKey: ReadonlyMap<string, ProjectView>;
  workerById: ReadonlyMap<string, WorkerSummary>;
}

/**
 * 一个模型池一行：左边身份信息，中间计量条 + 图例，右边大数字。
 * 计量条三选一，容量为 0 且没有在跑的优先级最高（否则会被误判成「容量 ≤ 48」画出一堆空格）：
 * 容量为 0 且没有在跑 → 暂停轨道；容量 ≤ 48 → 离散格子 SlotMeter；否则 → 连续分段条 SegmentBar。
 */
export function PoolRow({ pool, projectByKey, workerById }: PoolRowProps) {
  const paused = pool.capacity === 0 && pool.running === 0;
  const useSegmentBar = !paused && pool.capacity > SEGMENT_BAR_THRESHOLD;

  return (
    <div className={root} data-pool={pool.id}>
      <div className={nameCol}>
        <div className={poolId}>{pool.id}</div>
        <div className={poolLabel}>{pool.label}</div>
        <div className={poolModel} title={pool.model}>
          {pool.model}
        </div>
      </div>
      <div className={meterCol}>
        {paused ? (
          <div className={pausedTrack}>
            <span className={pausedText}>已暂停</span>
          </div>
        ) : useSegmentBar ? (
          <SegmentBar pool={pool} projectByKey={projectByKey} />
        ) : (
          <SlotMeter pool={pool} projectByKey={projectByKey} workerById={workerById} />
        )}
        <PoolLegend pool={pool} projectByKey={projectByKey} />
      </div>
      <PoolNumbers pool={pool} projectByKey={projectByKey} />
    </div>
  );
}
