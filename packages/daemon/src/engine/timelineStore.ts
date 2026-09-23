import {
  assembleTimeline,
  getRuntimeAdapter,
  isTerminalStatus,
  type RunRecord,
  type TimelineDraft,
  type TimelineEvent,
  type TimelinePage,
} from "@fleet/core";
import type { DaemonPaths, Logger } from "../app/types.js";
import type { Repos } from "../store/types.js";
import { flushRemainder, replayRunOutput } from "./outputReplay.js";
import { readTimelineDrafts } from "./timelineFile.js";
import type { EventBus, TimelineStore } from "./types.js";

/** 缓存最近用过的苦工个数；在跑的苦工不计入这个上限（常驻）。 */
const CACHE_LIMIT = 50;

interface TimelineStoreDeps {
  repos: Repos;
  paths: DaemonPaths;
  logger: Logger;
  events: EventBus;
}

/**
 * 一个苦工的完整时间线 = assembleTimeline(每次运行 + 它的草稿)。
 * 草稿来源：在跑的运行用内存里攒的（appendDrafts 喂进来的）；已结束的运行先看
 * runs/<运行编号>/timeline.jsonl，这个文件都不存在时才用新的解析器把原始输出重新解析一遍。
 */
export function createTimelineStore(deps: TimelineStoreDeps): TimelineStore {
  const { repos, paths, logger, events } = deps;
  const liveDraftsByRunId = new Map<string, TimelineDraft[]>();
  const cache = new Map<string, TimelineEvent[]>();
  /** 上一次 refresh/assemble 时，这个苦工是否还有非终态运行——常驻缓存的依据。 */
  const activeFlags = new Map<string, boolean>();

  // workerId 目前的实现不需要（内存草稿按 runId 归档即可），保留在签名里是为了跟 refresh /
  // timeline 的调用方式一致，也方便以后按苦工维度做额外统计时不用改调用点。
  function appendDrafts(_workerId: string, runId: string, drafts: readonly TimelineDraft[]): void {
    if (drafts.length === 0) {
      return;
    }
    const existing = liveDraftsByRunId.get(runId) ?? [];
    liveDraftsByRunId.set(runId, [...existing, ...drafts]);
    // appendDrafts 本身不触发重新拼接：调用方（runTracker）攒够一批之后会紧接着调用 refresh。
  }

  /** 已结束运行找不到内存草稿时的兜底：磁盘上的 timeline.jsonl，都没有就从原始输出重新解析。 */
  async function draftsFromDiskOrReplay(run: RunRecord): Promise<readonly TimelineDraft[]> {
    const fromDisk = await readTimelineDrafts(paths.timelineFile(run.id), logger);
    if (fromDisk !== null) {
      return fromDisk;
    }
    const worker = repos.workers.get(run.workerId);
    if (worker === null) {
      return [];
    }
    const adapter = getRuntimeAdapter(worker.runtime);
    const at = run.startedAt ?? run.queuedAt;
    try {
      const replay = await replayRunOutput(
        paths.outFile(run.id),
        paths.errFile(run.id),
        adapter,
        at,
      );
      flushRemainder(replay.stdoutTailer, "stdout", replay.reducer, at, replay.drafts);
      flushRemainder(replay.stderrTailer, "stderr", replay.reducer, at, replay.drafts);
      return replay.drafts;
    } catch (error) {
      logger.error(`重新解析运行 ${run.id} 的原始输出失败`, error);
      return [];
    }
  }

  async function draftsForRun(run: RunRecord): Promise<readonly TimelineDraft[]> {
    const live = liveDraftsByRunId.get(run.id);
    if (live !== undefined) {
      return live;
    }
    if (!isTerminalStatus(run.status)) {
      // 非终态但没有内存草稿：真实存在的情况是刚建档还没轮到第一次输出，如实按「暂无草稿」处理。
      return [];
    }
    return draftsFromDiskOrReplay(run);
  }

  async function assembleFor(
    workerId: string,
  ): Promise<{ events: TimelineEvent[]; active: boolean }> {
    const runs = repos.runs.listByWorker(workerId);
    const runDrafts = await Promise.all(
      runs.map(async (run) => ({ run, drafts: await draftsForRun(run) })),
    );
    const active = runs.some((run) => !isTerminalStatus(run.status));
    return { events: assembleTimeline(runDrafts), active };
  }

  /** 把 workerId 标记为「最近用过」：Map 里删了再插回去，插入顺序即最近使用顺序。 */
  function touch(workerId: string, value: TimelineEvent[]): void {
    cache.delete(workerId);
    cache.set(workerId, value);
  }

  function enforceCacheLimit(): void {
    if (cache.size <= CACHE_LIMIT) {
      return;
    }
    for (const workerId of cache.keys()) {
      if (cache.size <= CACHE_LIMIT) {
        break;
      }
      if (activeFlags.get(workerId) === true) {
        continue; // 常驻缓存，不参与淘汰
      }
      cache.delete(workerId);
      // 评审 F6a：activeFlags 之前只 set 不 delete，长期运行会无限增长；
      // 缓存里都已经淘汰掉的苦工，它的常驻标记也一并清掉。
      activeFlags.delete(workerId);
    }
  }

  async function refresh(workerId: string): Promise<void> {
    const { events: nextEvents, active } = await assembleFor(workerId);
    activeFlags.set(workerId, active);
    const previous = cache.get(workerId) ?? [];
    touch(workerId, nextEvents);
    enforceCacheLimit();

    if (nextEvents.length > previous.length) {
      const delta = nextEvents.slice(previous.length);
      events.emit({ type: "timeline", workerId, events: delta });
    }

    // 运行已经全部结束、且不再需要跟踪时，内存草稿已经安全落盘（timeline.jsonl），
    // 释放掉这份内存缓冲，避免长期运行的服务积累越来越多的历史草稿。
    if (!active) {
      for (const run of repos.runs.listByWorker(workerId)) {
        liveDraftsByRunId.delete(run.id);
      }
    }
  }

  async function timeline(
    workerId: string,
    after: number,
    limit: number,
  ): Promise<TimelinePage | null> {
    if (!repos.workers.exists(workerId)) {
      return null;
    }
    let cached = cache.get(workerId);
    if (cached === undefined) {
      const { events: computed, active } = await assembleFor(workerId);
      activeFlags.set(workerId, active);
      cached = computed;
    }
    touch(workerId, cached);
    enforceCacheLimit();

    const selected = cached.filter((event) => event.seq > after).slice(0, limit);
    const last = selected.at(-1);
    return { events: selected, next: last?.seq ?? after, total: cached.length };
  }

  /** 评审 F6a：过期清理删掉苦工之后调用，避免 cache/activeFlags 里留着永远用不到的条目。 */
  function forget(workerId: string): void {
    cache.delete(workerId);
    activeFlags.delete(workerId);
  }

  return { appendDrafts, refresh, timeline, forget };
}
