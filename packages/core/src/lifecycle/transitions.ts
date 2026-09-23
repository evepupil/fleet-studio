import { FleetError } from "../domain/errors.js";
import { STATUS_LABELS } from "../domain/labels.js";
import type { RunStatus } from "../domain/status.js";

/**
 * 合法的状态流转：排队中只能走向工作中、已取消或失败；工作中只能走向已完成、失败或已取消。
 * 其余组合都不合法，包括原地不动——一次流转必须真的改变状态，重复推进不能靠“转到自己”表达。
 */
const ALLOWED_TRANSITIONS: ReadonlyMap<RunStatus, ReadonlySet<RunStatus>> = new Map([
  ["queued", new Set<RunStatus>(["running", "cancelled", "failed"])],
  ["running", new Set<RunStatus>(["completed", "failed", "cancelled"])],
]);

/** 判断 from → to 是否是一次合法的状态流转。 */
export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}

/** 不合法时抛 FleetError；说明文字用 STATUS_LABELS 换成中文状态名，方便直接展示给人看。 */
export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new FleetError(
      "illegal_transition",
      `不能从「${STATUS_LABELS[from]}」变为「${STATUS_LABELS[to]}」`,
    );
  }
}
