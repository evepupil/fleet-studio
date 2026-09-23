import { Skeleton } from "../../components/Skeleton";
import styles from "./DetailStates.module.css";

const { titleBlock, metaBlock, metaCell, timelineBlock } = styles;

const META_SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;
const TIMELINE_SKELETON_KEYS = ["t1", "t2", "t3", "t4", "t5"] as const;

/**
 * 详情加载中的骨架：标题两条 → 元信息 6 格 → 时间线 5 行，形状对齐真实内容，减少加载完成后的布局跳动。
 * 这时 detail 还没到手，DetailHeader / MetaGrid 需要的字段都拿不到，所以单独画一套占位块，不复用真实组件。
 */
export function DetailLoadingSkeleton() {
  return (
    <div>
      <div className={titleBlock}>
        <Skeleton width="60%" height={20} />
        <Skeleton width="40%" height={16} />
      </div>
      <div className={metaBlock}>
        {META_SKELETON_KEYS.map((key) => (
          <div key={key} className={metaCell}>
            <Skeleton width="40%" height={10} />
            <Skeleton width="70%" height={14} />
          </div>
        ))}
      </div>
      <div className={timelineBlock}>
        {TIMELINE_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} width="100%" height={20} />
        ))}
      </div>
    </div>
  );
}
