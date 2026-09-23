import {
  buildWorkerSummary,
  FleetError,
  findLatestRun,
  isTerminalStatus,
  type RunRecord,
  type WaitResult,
  type WorkerSummary,
} from "@fleet/core";
import type { ConfigStore } from "../app/types.js";
import type { Repos } from "../store/types.js";
import type { ServiceEvent, WaitMode } from "./service.js";
import type { EventBus, Waiter } from "./types.js";

/** 排队位置只影响排队中的苦工；等待结果永远只关心已经终态的苦工，传空表即可。 */
const NO_QUEUE_POSITIONS: ReadonlyMap<string, number> = new Map();

interface WaiterDeps {
  repos: Repos;
  config: ConfigStore;
  events: EventBus;
}

interface CheckResult {
  done: WorkerSummary[];
  pending: string[];
}

function isSatisfied(result: CheckResult, mode: WaitMode): boolean {
  return mode === "all" ? result.pending.length === 0 : result.done.length > 0;
}

export function createWaiter(deps: WaiterDeps): Waiter {
  const { repos, config, events } = deps;

  function checkNow(ids: readonly string[]): CheckResult {
    const currentConfig = config.current();
    const workerById = new Map(
      repos.workers.listByIds(ids).map((worker) => [worker.id, worker] as const),
    );
    const runsByWorkerId = new Map<string, RunRecord[]>();

    const done: WorkerSummary[] = [];
    const pending: string[] = [];
    for (const id of ids) {
      const worker = workerById.get(id);
      if (worker === undefined) {
        // 前面已经校验过全部编号存在；真的走到这里说明查询之间发生了极端的数据变化，稳妥地当作未完成。
        pending.push(id);
        continue;
      }
      let runs = runsByWorkerId.get(id);
      if (runs === undefined) {
        runs = repos.runs.listByWorker(id);
        runsByWorkerId.set(id, runs);
      }
      const latest = findLatestRun(worker, runs);
      if (latest !== null && isTerminalStatus(latest.status)) {
        done.push(buildWorkerSummary(worker, runs, currentConfig, NO_QUEUE_POSITIONS));
      } else {
        pending.push(id);
      }
    }
    return { done, pending };
  }

  return {
    async wait(
      ids: readonly string[],
      mode: WaitMode,
      timeoutMs: number,
      signal: AbortSignal,
    ): Promise<WaitResult> {
      for (const id of ids) {
        if (!repos.workers.exists(id)) {
          throw new FleetError("not_found", `苦工不存在：${id}`);
        }
      }

      const initial = checkNow(ids);
      if (isSatisfied(initial, mode) || signal.aborted) {
        return { ...initial, timedOut: !isSatisfied(initial, mode) };
      }

      return new Promise<WaitResult>((resolve) => {
        let settled = false;

        const onEvent = (event: ServiceEvent): void => {
          if (event.type !== "worker" || !ids.includes(event.workerId)) {
            return;
          }
          if (isSatisfied(checkNow(ids), mode)) {
            finish(false);
          }
        };
        const onAbort = (): void => {
          finish(true);
        };

        const unsubscribe = events.subscribe(onEvent);
        const timer = setTimeout(() => finish(true), timeoutMs);
        signal.addEventListener("abort", onAbort);

        function finish(timedOut: boolean): void {
          if (settled) {
            return;
          }
          settled = true;
          unsubscribe();
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          const fresh = checkNow(ids);
          resolve({ done: fresh.done, pending: fresh.pending, timedOut });
        }
      });
    },
  };
}
