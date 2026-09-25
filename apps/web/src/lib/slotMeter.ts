import type { PoolView, ProjectView, SlotView } from "@fleet/core";

export interface ProjectSegment {
  projectKey: string;
  slots: SlotView[];
}

export function groupSegments(slots: readonly SlotView[]): ProjectSegment[] {
  const order: string[] = [];
  const grouped = new Map<string, SlotView[]>();
  for (const slot of slots) {
    const segment = grouped.get(slot.projectKey);
    if (segment === undefined) {
      order.push(slot.projectKey);
      grouped.set(slot.projectKey, [slot]);
    } else {
      segment.push(slot);
    }
  }
  return order.map((projectKey) => ({
    projectKey,
    slots: grouped.get(projectKey) ?? [],
  }));
}

const SEGMENT_BAR_THRESHOLD = 48;
const CELL_WIDTH = 28;
const CELL_GAP = 2;
const FALLBACK_METER_WIDTH = 120;

export function meterWidthStyle(pools: readonly PoolView[]): string {
  const maxCells = pools.reduce(
    (max, pool) =>
      Math.max(max, Math.min(SEGMENT_BAR_THRESHOLD, Math.max(pool.capacity, pool.running))),
    0,
  );
  if (maxCells <= 0) {
    return `${FALLBACK_METER_WIDTH}px`;
  }
  return `${maxCells * CELL_WIDTH + (maxCells - 1) * CELL_GAP}px`;
}

export function projectMap(projects: readonly ProjectView[]): ReadonlyMap<string, ProjectView> {
  return new Map(projects.map((project) => [project.key, project]));
}
