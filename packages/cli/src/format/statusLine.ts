import { STATUS_LABELS, type WorkerSummary } from "@fleet/core";
import { elapsedMs, formatDuration } from "./duration.js";

type StatusFields = Pick<WorkerSummary, "status" | "queuePosition" | "retry" | "verdict">;

/**
 * 状态文字（规格 3.4 ps / 3.5）：排队中带「第 N 位」，重试中带「重试 N/M」，
 * 回报不通过带「自评不通过」。三个附加信息互不冲突，各自只在对应字段非空时才附加。
 */
export function describeStatus(worker: StatusFields): string {
  const base = STATUS_LABELS[worker.status];
  if (worker.status === "queued" && worker.queuePosition !== null) {
    return `${base}（第${worker.queuePosition}位）`;
  }
  if (worker.retry !== null) {
    return `${base}（重试${worker.retry.attempt}/${worker.retry.max}）`;
  }
  if (worker.verdict === "fail") {
    return `${base}（自评不通过）`;
  }
  return base;
}

/** 状态行（规格 3.5）：<编号>  <状态>  <池>/<角色>  <时长>  <标题>。 */
export function formatStatusLine(worker: WorkerSummary, now: Date): string {
  const status = describeStatus(worker);
  const duration = formatDuration(elapsedMs(worker, now));
  return `${worker.id}  ${status}  ${worker.poolId}/${worker.roleLabel}  ${duration}  ${worker.title}`;
}
