import type { PoolView, QueueShare, SlotView } from "../api/dto.js";
import type { PoolConfig, RoleConfig } from "../config/schema.js";
import type { RunRecord, WorkerRecord } from "../domain/records.js";
import { addUsage, ZERO_USAGE } from "../domain/usage.js";
import { HEALTH_WINDOW_MINUTES } from "./constants.js";
import { poolDisplayModel } from "./poolModel.js";
import { resolveRoleLabel } from "./workers.js";

/**
 * 池视图特意使用全部输入的 workers / runs（不是快照里裁剪到 300 条的苦工列表），
 * 因为容量占用、健康窗口、今日用量都要反映真实状态，300 条上限只是苦工列表本身的展示上限。
 */
export function buildPoolViews(
  pools: readonly PoolConfig[],
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
  roles: readonly RoleConfig[],
  now: string,
  dayStart: string,
): PoolView[] {
  const workerById = new Map(workers.map((worker) => [worker.id, worker] as const));
  const nowMs = Date.parse(now);
  const dayStartMs = Date.parse(dayStart);
  const windowStartMs = nowMs - HEALTH_WINDOW_MINUTES * 60_000;

  return pools.map((pool) =>
    buildPoolView(pool, runs, workerById, roles, nowMs, windowStartMs, dayStartMs),
  );
}

function buildPoolView(
  pool: PoolConfig,
  runs: readonly RunRecord[],
  workerById: ReadonlyMap<string, WorkerRecord>,
  roles: readonly RoleConfig[],
  nowMs: number,
  windowStartMs: number,
  dayStartMs: number,
): PoolView {
  const poolRuns = runs.filter((run) => workerById.get(run.workerId)?.poolId === pool.id);
  const runningRuns = poolRuns.filter((run) => run.status === "running");
  const queuedRuns = poolRuns.filter((run) => run.status === "queued");

  const slots = buildSlots(runningRuns, workerById, roles);
  const queuedByProject = buildQueuedByProject(
    queuedRuns,
    workerById,
    orderedUniqueProjectKeys(slots),
  );

  const completed = poolRuns.filter(
    (run) => run.status === "completed" && isEndedWithinWindow(run.endedAt, windowStartMs, nowMs),
  ).length;
  const failed = poolRuns.filter(
    (run) => run.status === "failed" && isEndedWithinWindow(run.endedAt, windowStartMs, nowMs),
  ).length;
  const retrying = runningRuns.filter((run) => run.retry !== null).length;

  const usageToday = poolRuns
    .filter((run) => run.startedAt !== null && Date.parse(run.startedAt) >= dayStartMs)
    .reduce((sum, run) => addUsage(sum, run.usage), { ...ZERO_USAGE });

  return {
    id: pool.id,
    label: pool.label,
    model: poolDisplayModel(pool),
    capacity: pool.capacity,
    perProjectCap: pool.perProjectCap,
    running: runningRuns.length,
    queued: queuedRuns.length,
    slots,
    queuedByProject,
    health: { windowMinutes: HEALTH_WINDOW_MINUTES, completed, failed, retrying },
    usageToday,
  };
}

/** (now − 窗口, now] 之内结束，恰好等于窗口起点的不算。 */
function isEndedWithinWindow(
  endedAt: string | null,
  windowStartMs: number,
  nowMs: number,
): boolean {
  if (endedAt === null) {
    return false;
  }
  const endedAtMs = Date.parse(endedAt);
  return endedAtMs > windowStartMs && endedAtMs <= nowMs;
}

interface SlotGroup {
  projectKey: string;
  earliestStartedAtMs: number;
  slots: SlotView[];
}

/**
 * 容量条格子：按项目成段排列——在跑数多的项目在前，并列按该项目最早开跑时间，
 * 再并列按 projectKey 字典序；每段内部按开跑时间升序，再按 runId。
 */
function buildSlots(
  runningRuns: readonly RunRecord[],
  workerById: ReadonlyMap<string, WorkerRecord>,
  roles: readonly RoleConfig[],
): SlotView[] {
  const groups = new Map<string, SlotGroup>();

  for (const run of runningRuns) {
    const worker = workerById.get(run.workerId);
    if (!worker) {
      continue; // 数据不一致：运行找不到所属苦工，防御性跳过
    }
    // 工作中的运行理论上必有 startedAt；兜底取 queuedAt 只是为了让类型始终是 string。
    const startedAt = run.startedAt ?? run.queuedAt;
    const slot: SlotView = {
      runId: run.id,
      workerId: run.workerId,
      projectKey: worker.projectKey,
      title: worker.title,
      role: worker.role,
      roleLabel: resolveRoleLabel(roles, worker.role),
      startedAt,
      retrying: run.retry !== null,
    };

    const startedAtMs = Date.parse(startedAt);
    const existing = groups.get(worker.projectKey);
    if (existing) {
      existing.slots.push(slot);
      existing.earliestStartedAtMs = Math.min(existing.earliestStartedAtMs, startedAtMs);
    } else {
      groups.set(worker.projectKey, {
        projectKey: worker.projectKey,
        earliestStartedAtMs: startedAtMs,
        slots: [slot],
      });
    }
  }

  const orderedGroups = [...groups.values()].sort((a, b) => {
    if (a.slots.length !== b.slots.length) {
      return b.slots.length - a.slots.length;
    }
    if (a.earliestStartedAtMs !== b.earliestStartedAtMs) {
      return a.earliestStartedAtMs - b.earliestStartedAtMs;
    }
    return compareStrings(a.projectKey, b.projectKey);
  });

  return orderedGroups.flatMap((group) =>
    [...group.slots].sort((a, b) => {
      const startedAtDiff = Date.parse(a.startedAt) - Date.parse(b.startedAt);
      return startedAtDiff !== 0 ? startedAtDiff : compareStrings(a.runId, b.runId);
    }),
  );
}

/** slots 里项目出现的先后顺序（去重，只留第一次出现的位置）。 */
function orderedUniqueProjectKeys(slots: readonly SlotView[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const slot of slots) {
    if (!seen.has(slot.projectKey)) {
      seen.add(slot.projectKey);
      order.push(slot.projectKey);
    }
  }
  return order;
}

/** 排队按项目拆分：先按 slots 里的项目顺序，其余项目按各自最早排队时间。 */
function buildQueuedByProject(
  queuedRuns: readonly RunRecord[],
  workerById: ReadonlyMap<string, WorkerRecord>,
  slotProjectOrder: readonly string[],
): QueueShare[] {
  const counts = new Map<string, number>();
  const earliestQueuedAtMs = new Map<string, number>();

  for (const run of queuedRuns) {
    const worker = workerById.get(run.workerId);
    if (!worker) {
      continue;
    }
    const key = worker.projectKey;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const queuedAtMs = Date.parse(run.queuedAt);
    const currentEarliest = earliestQueuedAtMs.get(key);
    if (currentEarliest === undefined || queuedAtMs < currentEarliest) {
      earliestQueuedAtMs.set(key, queuedAtMs);
    }
  }

  const ordered: QueueShare[] = [];
  const consumed = new Set<string>();

  for (const projectKey of slotProjectOrder) {
    const count = counts.get(projectKey);
    if (count !== undefined) {
      ordered.push({ projectKey, count });
      consumed.add(projectKey);
    }
  }

  const remainingProjectKeys = [...counts.keys()]
    .filter((key) => !consumed.has(key))
    .sort((a, b) => (earliestQueuedAtMs.get(a) ?? 0) - (earliestQueuedAtMs.get(b) ?? 0));

  for (const projectKey of remainingProjectKeys) {
    const count = counts.get(projectKey);
    if (count !== undefined) {
      ordered.push({ projectKey, count });
    }
  }

  return ordered;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
