import { FAIL_REASON_LABELS, STATUS_LABELS, type WorkerSummary } from "@fleet/core";
import { elapsedMs, formatDuration } from "./duration.js";

type StatusFields = Pick<WorkerSummary, "status" | "queuePosition" | "retry" | "verdict">;

type PlacementFields = Pick<WorkerSummary, "status" | "poolId" | "queuePosition" | "model">;

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

/**
 * 状态行里的池那一段（规格第二版 2）：分到池了写池编号，还在公共排队（poolId 为 null）
 * 写「公共排队」。状态行和 fleet ps 的池列共用这一处写法，免得两处各写一份。
 */
export function formatPoolSegment(worker: Pick<WorkerSummary, "poolId">): string {
  return worker.poolId ?? "公共排队";
}

/** 状态行（规格 3.5）：<编号>  <状态>  <池>/<角色>  <时长>  <标题>。 */
export function formatStatusLine(worker: WorkerSummary, now: Date): string {
  const status = describeStatus(worker);
  const duration = formatDuration(elapsedMs(worker, now));
  return `${worker.id}  ${status}  ${formatPoolSegment(worker)}/${worker.roleLabel}  ${duration}  ${worker.title}`;
}

/**
 * fleet run 派完紧跟状态行的那一行说明（规格第二版 1）：只回答「这个苦工现在在哪」。
 * 结束态（已完成 / 失败 / 已取消）没有「现在在哪」可讲，返回 null 表示不打这一行。
 */
export function describePlacement(worker: PlacementFields): string | null {
  if (worker.status === "queued") {
    const position = worker.queuePosition !== null ? `第 ${worker.queuePosition} 位` : null;
    if (worker.poolId !== null) {
      return `排队中：${worker.poolId}${position !== null ? ` ${position}` : ""}`;
    }
    return `排队中，等任一池空位（公共排队${position ?? ""}）`;
  }
  if (worker.status === "running" && worker.poolId !== null) {
    return `池：${worker.poolId}${worker.model !== null ? `（${worker.model}）` : ""}`;
  }
  return null;
}

/**
 * fleet show 的「池与模型」一行（规格第二版 2）：没被放行过的苦工 poolId 为 null，
 * 写「公共排队（还没分到池）」，而不是打印一个 null。
 */
export function describePoolAndModel(worker: Pick<WorkerSummary, "poolId" | "model">): string {
  if (worker.poolId === null) {
    return "公共排队（还没分到池）";
  }
  return worker.model !== null ? `${worker.poolId} · ${worker.model}` : worker.poolId;
}

/**
 * 失败或取消的原因说明（fleet show 用，缺陷 8）：有失败原因就是「<原因中文>：<说明>」；
 * 已取消通常没有失败原因，这时只写说明；两边都没有时给个占位，不留空行。
 */
export function describeFailureReason(
  worker: Pick<WorkerSummary, "failReason" | "errorMessage">,
): string {
  const reasonLabel = worker.failReason !== null ? FAIL_REASON_LABELS[worker.failReason] : null;
  const message =
    worker.errorMessage !== null && worker.errorMessage.length > 0 ? worker.errorMessage : null;
  if (reasonLabel !== null && message !== null) {
    return `${reasonLabel}：${message}`;
  }
  if (reasonLabel !== null) {
    return reasonLabel;
  }
  if (message !== null) {
    return message;
  }
  return "没有更多说明";
}
