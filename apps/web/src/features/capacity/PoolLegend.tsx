import type { PoolView, ProjectView, SlotView } from "@fleet/core";
import { ProjectDot } from "../../components/ProjectDot";
import styles from "./PoolLegend.module.css";

const { root, item, name, count } = styles;

export interface PoolLegendProps {
  pool: PoolView;
  projectByKey: ReadonlyMap<string, ProjectView>;
}

interface LegendEntry {
  projectKey: string;
  count: number;
}

/** 按 slots 里项目首次出现的顺序统计每个项目在这个池里的在跑数。 */
function buildLegendEntries(slots: readonly SlotView[]): LegendEntry[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const slot of slots) {
    const current = counts.get(slot.projectKey);
    if (current === undefined) {
      order.push(slot.projectKey);
      counts.set(slot.projectKey, 1);
    } else {
      counts.set(slot.projectKey, current + 1);
    }
  }
  return order.map((projectKey) => ({ projectKey, count: counts.get(projectKey) ?? 0 }));
}

/** 池的项目图例：只列有在跑苦工的项目，一个在跑都没有时不渲染（调用方无需再判断一次）。 */
export function PoolLegend({ pool, projectByKey }: PoolLegendProps) {
  if (pool.slots.length === 0) {
    return null;
  }
  const entries = buildLegendEntries(pool.slots);
  return (
    <div className={root} data-pool-legend>
      {entries.map((entry) => {
        const project = projectByKey.get(entry.projectKey) ?? null;
        return (
          <span className={item} key={entry.projectKey}>
            <ProjectDot colorIndex={project?.colorIndex ?? 0} size={8} />
            <span className={name}>{project?.name ?? entry.projectKey}</span>
            <span className={count}>{entry.count}</span>
          </span>
        );
      })}
    </div>
  );
}
