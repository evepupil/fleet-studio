import type { RunView, WorkerDetail, WorkerSummary } from "../api/dto.js";
import type { FleetConfig, RoleConfig } from "../config/schema.js";
import type { ProjectRecord, RunRecord, WorkerRecord } from "../domain/records.js";
import type { RunStatus } from "../domain/status.js";
import { addUsage, ZERO_USAGE } from "../domain/usage.js";
import { parseReport } from "../report/parseReport.js";

/**
 * 苦工的最新一次运行：优先按 `worker.latestRunSeq` 精确匹配；
 * 找不到（数据不一致）时退而取 seq 最大的一条；一次运行都没有时返回 null，
 * 由调用方按"排队中"兜底处理（见 buildWorkerSummary、buildSnapshot 的挑苦工逻辑）。
 */
export function findLatestRun(worker: WorkerRecord, runs: readonly RunRecord[]): RunRecord | null {
  if (runs.length === 0) {
    return null;
  }
  const bySeq = runs.find((run) => run.seq === worker.latestRunSeq);
  if (bySeq) {
    return bySeq;
  }
  return runs.reduce((latest, run) => (run.seq > latest.seq ? run : latest));
}

/** 角色的中文名；配置里找不到这个角色时退回角色编号本身，保证看板始终有字可显示。 */
export function resolveRoleLabel(roles: readonly RoleConfig[], roleId: string): string {
  return roles.find((role) => role.id === roleId)?.label ?? roleId;
}

/**
 * 苦工摘要：看板列表和容量条悬浮详情都用它。
 * `runs` 必须是这个苦工的全部运行（累加用量要用到历史运行）。
 */
export function buildWorkerSummary(
  worker: WorkerRecord,
  runs: readonly RunRecord[],
  config: FleetConfig,
  queuePositions: ReadonlyMap<string, number>,
): WorkerSummary {
  const latest = findLatestRun(worker, runs);
  const status: RunStatus = latest?.status ?? "queued";
  // 初值用 ZERO_USAGE 的拷贝，避免多次调用之间共享同一个可变对象。
  const usage = runs.reduce((sum, run) => addUsage(sum, run.usage), { ...ZERO_USAGE });

  return {
    id: worker.id,
    projectKey: worker.projectKey,
    cwd: worker.cwd,
    title: worker.title,
    role: worker.role,
    roleLabel: resolveRoleLabel(config.roles, worker.role),
    runtime: worker.runtime,
    poolId: worker.poolId,
    model: worker.model,
    status,
    failReason: latest?.failReason ?? null,
    errorMessage: latest?.errorMessage ?? null,
    // 一次运行都没有时，仍然把 worker 声明的最新序号当作 runSeq，而不是瞎编一个 0。
    runSeq: latest?.seq ?? worker.latestRunSeq,
    createdAt: worker.createdAt,
    queuedAt: latest?.queuedAt ?? worker.createdAt,
    startedAt: latest?.startedAt ?? null,
    endedAt: latest?.endedAt ?? null,
    lastActivityAt: latest?.lastActivityAt ?? null,
    activity: latest?.activity ?? null,
    retry: latest?.retry ?? null,
    verdict: latest?.finalText ? (parseReport(latest.finalText)?.verdict ?? null) : null,
    usage,
    // 排队位置按运行编号从调用方给的 Map 里查；没有真实运行（兜底场景）时没有编号可查，只能是 null。
    queuePosition: status === "queued" && latest ? (queuePositions.get(latest.id) ?? null) : null,
  };
}

/** 运行视图：字段基本照抄 RunRecord，额外把最后一条模型文字解析成结构化回报。 */
export function buildRunView(run: RunRecord): RunView {
  return {
    id: run.id,
    seq: run.seq,
    status: run.status,
    failReason: run.failReason,
    errorMessage: run.errorMessage,
    prompt: run.prompt,
    queuedAt: run.queuedAt,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.exitCode,
    usage: run.usage,
    finalText: run.finalText,
    report: run.finalText ? parseReport(run.finalText) : null,
  };
}

/** 苦工详情：摘要 + 项目路径 + 按运行序号从小到大排好的历史运行。 */
export function buildWorkerDetail(
  worker: WorkerRecord,
  runs: readonly RunRecord[],
  project: ProjectRecord,
  config: FleetConfig,
  queuePositions: ReadonlyMap<string, number>,
): WorkerDetail {
  const summary = buildWorkerSummary(worker, runs, config, queuePositions);
  // 排序前先拷贝一份：sort 会原地修改数组，不能动调用方传进来的 runs。
  const orderedRuns = [...runs].sort((a, b) => a.seq - b.seq);

  return {
    summary,
    projectPath: project.path,
    sessionRef: worker.sessionRef,
    thinking: worker.thinking,
    runs: orderedRuns.map((run) => buildRunView(run)),
  };
}
