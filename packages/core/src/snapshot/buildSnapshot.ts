import type { RoleView, Snapshot } from "../api/dto.js";
import type { FleetConfig } from "../config/schema.js";
import type { ProjectRecord, RunRecord, WorkerRecord } from "../domain/records.js";
import { isTerminalStatus } from "../domain/status.js";
import { SNAPSHOT_WORKER_LIMIT } from "./constants.js";
import { buildLiveTotals, countSharedQueued } from "./live.js";
import { buildPoolViews } from "./pools.js";
import { buildProjectViews } from "./projects.js";
import { buildWorkerSummary, findLatestRun } from "./workers.js";

/** buildSnapshot 的输入：调用方已经按模块设计第 3.1 节的口径查好全部记录。 */
export interface SnapshotInput {
  version: string;
  now: string;
  /** 本地时区今天零点（ISO），由调用方算好 */
  dayStart: string;
  config: FleetConfig;
  configError: string | null;
  projects: readonly ProjectRecord[];
  /** 下面 runs 涉及的全部苦工 */
  workers: readonly WorkerRecord[];
  runs: readonly RunRecord[];
  /** 排队中的运行在池内的预计放行位置 */
  queuePositions: ReadonlyMap<string, number>;
}

/**
 * 把项目、苦工、运行记录算成看板要显示的完整快照。
 * 池视图和项目今日用量特意用全部输入记录（不受苦工列表 300 条上限影响），
 * 因为容量占用和用量统计要反映真实状态；300 条上限只裁剪苦工列表本身的展示范围。
 */
export function buildSnapshot(input: SnapshotInput): Snapshot {
  const nowMs = Date.parse(input.now);
  const runsByWorkerId = groupRunsByWorkerId(input.runs);
  const selectedWorkers = selectSnapshotWorkers(
    input.workers,
    runsByWorkerId,
    input.now,
    input.config.snapshotWindowHours,
  );
  const workers = selectedWorkers.map((worker) =>
    buildWorkerSummary(
      worker,
      runsByWorkerId.get(worker.id) ?? [],
      input.config,
      input.queuePositions,
      nowMs,
    ),
  );

  const pools = buildPoolViews(
    input.config.pools,
    input.workers,
    input.runs,
    input.config.roles,
    input.now,
    input.dayStart,
  );

  const projects = buildProjectViews(
    workers,
    input.workers,
    input.runs,
    input.projects,
    input.dayStart,
  );

  const roles: RoleView[] = input.config.roles.map((role) => ({
    id: role.id,
    label: role.label,
    description: role.description,
  }));

  const workerById = new Map(input.workers.map((worker) => [worker.id, worker] as const));

  return {
    version: input.version,
    serverTime: input.now,
    pools,
    sharedQueued: countSharedQueued(input.runs, workerById),
    live: buildLiveTotals(input.workers, runsByWorkerId, pools),
    projects,
    workers,
    roles,
    configError: input.configError,
  };
}

function groupRunsByWorkerId(runs: readonly RunRecord[]): Map<string, RunRecord[]> {
  const grouped = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const list = grouped.get(run.workerId);
    if (list) {
      list.push(run);
    } else {
      grouped.set(run.workerId, [run]);
    }
  }
  return grouped;
}

interface TerminalCandidate {
  worker: WorkerRecord;
  endedAtMs: number;
}

/**
 * 挑选进快照苦工列表的记录：最新一次运行非终态（或压根没有运行）的永远保留；
 * 终态的按结束时间是否在窗口内筛出候选，超过 300 个上限时优先保留结束最晚的。
 */
function selectSnapshotWorkers(
  workers: readonly WorkerRecord[],
  runsByWorkerId: ReadonlyMap<string, RunRecord[]>,
  now: string,
  windowHours: number,
): WorkerRecord[] {
  const windowStartMs = Date.parse(now) - windowHours * 60 * 60 * 1000;
  const keepAlways: WorkerRecord[] = [];
  const terminalCandidates: TerminalCandidate[] = [];

  for (const worker of workers) {
    const latest = findLatestRun(worker, runsByWorkerId.get(worker.id) ?? []);
    // 一次运行都没有时视为数据不一致，按排队中（非终态）处理，永远保留。
    if (latest === null || !isTerminalStatus(latest.status)) {
      keepAlways.push(worker);
      continue;
    }
    if (latest.endedAt !== null && Date.parse(latest.endedAt) > windowStartMs) {
      terminalCandidates.push({ worker, endedAtMs: Date.parse(latest.endedAt) });
    }
  }

  const remainingSlots = Math.max(0, SNAPSHOT_WORKER_LIMIT - keepAlways.length);
  const keptTerminal = [...terminalCandidates]
    .sort((a, b) => b.endedAtMs - a.endedAtMs) // 结束最晚的在前
    .slice(0, remainingSlots)
    .map((candidate) => candidate.worker);

  return [...keepAlways, ...keptTerminal].sort(compareWorkersForOutput);
}

/** 输出顺序：createdAt 倒序，相同再按 id。 */
function compareWorkersForOutput(a: WorkerRecord, b: WorkerRecord): number {
  const createdDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
