import type { DispatchOrder, PoolLimit, QueuedEntry, RunningEntry } from "./types.js";

/**
 * 排队时间的排序权重：解析不出来的时间不丢弃条目（丢了就少了一个排队位置，
 * queuePositions 会对不上），而是让它排到同批里最后，靠 runId 兜底分出先后。
 */
function queueTimeRank(queuedAt: string): number {
  const ms = Date.parse(queuedAt);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** 先按排队时间早晚，再按运行编号字典序，得到确定的先后顺序。 */
function compareQueued(a: QueuedEntry, b: QueuedEntry): number {
  const rankDiff = queueTimeRank(a.queuedAt) - queueTimeRank(b.queuedAt);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  if (a.runId < b.runId) return -1;
  if (a.runId > b.runId) return 1;
  return 0;
}

/** 循环里正在争夺“下一个放行名额”的候选项目。 */
interface Candidate {
  projectKey: string;
  /** 该项目此刻在这个池里的占用数（在跑 + 已经被本次循环放行但还没数进 running 的） */
  count: number;
  /** 该项目排队队首 */
  head: QueuedEntry;
  /** 队首所在的队列，命中后直接从这个数组出队，不用再查一次 Map */
  queue: QueuedEntry[];
}

/** 谁更该被放行：占得少的优先；占得一样多比队首排队早的；再一样比项目编号字典序小的。 */
function isBetterCandidate(candidate: Candidate, current: Candidate | null): boolean {
  if (current === null) {
    return true;
  }
  if (candidate.count !== current.count) {
    return candidate.count < current.count;
  }
  const candidateRank = queueTimeRank(candidate.head.queuedAt);
  const currentRank = queueTimeRank(current.head.queuedAt);
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank;
  }
  return candidate.projectKey < current.projectKey;
}

/**
 * 算出一个池“不考虑还剩几个空位”时的公平放行顺序。
 * 规则见模块设计 3.2：每轮从有排队、且没撞单项目上限的项目里，挑占用最少的那个，
 * 放它的队首；占用打平了比队首排队早的，再打平比项目编号字典序。
 */
export function dispatchOrder(
  limit: PoolLimit,
  running: readonly RunningEntry[],
  queued: readonly QueuedEntry[],
): DispatchOrder {
  const poolRunning = running.filter((entry) => entry.poolId === limit.poolId);
  const poolQueued = queued.filter((entry) => entry.poolId === limit.poolId);

  // 每个项目自己的排队先排成先来先到的队列，之后每轮只看队首。
  const queues = new Map<string, QueuedEntry[]>();
  for (const entry of poolQueued) {
    const list = queues.get(entry.projectKey);
    if (list) {
      list.push(entry);
    } else {
      queues.set(entry.projectKey, [entry]);
    }
  }
  for (const list of queues.values()) {
    list.sort(compareQueued);
  }

  // count 初值 = 该项目在这个池里的在跑数；没有排队的项目不会成为候选，不用记它。
  const counts = new Map<string, number>();
  for (const projectKey of queues.keys()) {
    counts.set(projectKey, 0);
  }
  for (const entry of poolRunning) {
    const current = counts.get(entry.projectKey);
    if (current !== undefined) {
      counts.set(entry.projectKey, current + 1);
    }
  }

  const eligible: string[] = [];
  for (;;) {
    let best: Candidate | null = null;
    for (const [projectKey, list] of queues) {
      const head = list[0];
      if (head === undefined) {
        continue;
      }
      const count = counts.get(projectKey) ?? 0;
      if (limit.perProjectCap !== null && count >= limit.perProjectCap) {
        continue;
      }
      const candidate: Candidate = { projectKey, count, head, queue: list };
      if (isBetterCandidate(candidate, best)) {
        best = candidate;
      }
    }
    if (best === null) {
      break;
    }
    best.queue.shift();
    eligible.push(best.head.runId);
    counts.set(best.projectKey, best.count + 1);
  }

  // 循环结束后队列里剩下的，就是被单项目上限挡住的，按全局排队时间重新排序。
  const blocked: QueuedEntry[] = [];
  for (const list of queues.values()) {
    blocked.push(...list);
  }
  blocked.sort(compareQueued);

  return {
    eligible,
    blocked: blocked.map((entry) => entry.runId),
  };
}
