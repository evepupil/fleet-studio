import type { ProcessExit, RunProgress, TimelineDraft } from "@fleet/core";
import type { RunPatch } from "../store/types.js";
import { resolveAndFinishRun } from "./finisher.js";
import { drainNewLines, flushRemainder } from "./outputReplay.js";
import { hasProgressChanged, isCriticalProgressChange } from "./progressDiff.js";
import { appendTimelineDrafts } from "./timelineFile.js";
import type {
  EngineContext,
  OutputTailer,
  ProcessExitInfo,
  RunTrackerHandle,
  StreamReducer,
} from "./types.js";

/** 同一运行落库最多每秒一次，除非阶段/重试/暂定结局变化需要立即落库。 */
const PERSIST_THROTTLE_MS = 1000;
/** 事件流已经「ended」之后，进程还不退出就主动结束它。 */
const ENDED_KILL_GRACE_MS = 10_000;
/** 接管的运行没有 onExit 回调，只能定期探测存活；这里控制探测的最小间隔。 */
const ADOPTED_ALIVE_CHECK_INTERVAL_MS = 2000;

export interface CreateRunTrackerOptions {
  runId: string;
  workerId: string;
  pid: number;
  processImage: string | null;
  reducer: StreamReducer;
  stdoutTailer: OutputTailer;
  stderrTailer: OutputTailer;
  /** 服务重启后接管的运行没有 onExit 回调，只能靠轮询存活判断退出。 */
  isAdopted: boolean;
  /** 创建时苦工的 sessionRef 是否已知；已知时不用再监视 progress.sessionRef 抢先落库。 */
  sessionRefKnown: boolean;
}

/**
 * 一次运行的跟踪句柄（模块设计 3.6）。轮询和 onExit 回调可能在时间上交叠
 * （轮询还没读完文件，进程恰好退出），用一条串行执行队列避免两边同时读同一对 tailer。
 */
export function createRunTracker(
  ctx: EngineContext,
  options: CreateRunTrackerOptions,
): RunTrackerHandle {
  const { runId, workerId, pid, processImage, reducer, stdoutTailer, stderrTailer, isAdopted } =
    options;

  let finished = false;
  let lastPersisted: RunProgress | null = null;
  let lastPersistAtMs: number | null = null;
  let sessionRefWritten = options.sessionRefKnown;
  let endedSinceMs: number | null = null;
  let killedForEnded = false;
  let lastAliveCheckAtMs = 0;

  let tail: Promise<unknown> = Promise.resolve();
  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function isoNow(nowMs: number): string {
    return new Date(nowMs).toISOString();
  }

  async function drainBoth(at: string): Promise<TimelineDraft[]> {
    const drafts: TimelineDraft[] = [];
    await drainNewLines(stdoutTailer, "stdout", reducer, at, drafts);
    await drainNewLines(stderrTailer, "stderr", reducer, at, drafts);
    return drafts;
  }

  async function publishDrafts(drafts: TimelineDraft[]): Promise<void> {
    if (drafts.length === 0) {
      return;
    }
    ctx.timelines.appendDrafts(workerId, runId, drafts);
    try {
      await appendTimelineDrafts(ctx.deps.paths.timelineFile(runId), drafts);
    } catch (error) {
      ctx.deps.logger.error(`追加时间线草稿文件失败：${runId}`, error);
    }
    await ctx.timelines.refresh(workerId);
  }

  function maybeCaptureSessionRef(progress: RunProgress): void {
    if (sessionRefWritten || progress.sessionRef === null) {
      return;
    }
    sessionRefWritten = true;
    ctx.deps.repos.workers.update(workerId, { sessionRef: progress.sessionRef });
  }

  function maybePersistProgress(progress: RunProgress, nowMs: number): void {
    if (lastPersisted !== null && !hasProgressChanged(lastPersisted, progress)) {
      return;
    }
    const critical = lastPersisted === null || isCriticalProgressChange(lastPersisted, progress);
    const throttleElapsed =
      lastPersistAtMs === null || nowMs - lastPersistAtMs >= PERSIST_THROTTLE_MS;
    if (!critical && !throttleElapsed) {
      return;
    }
    const patch: RunPatch = {
      usage: progress.usage,
      retry: progress.retry,
      activity: progress.activity,
      lastActivityAt: progress.lastEventAt,
      finalText: progress.finalText,
      eventCount: progress.eventCount,
    };
    ctx.deps.repos.runs.update(runId, patch);
    lastPersisted = progress;
    lastPersistAtMs = nowMs;
    ctx.notifyWorker(workerId);
  }

  async function maybeKillAfterEnded(progress: RunProgress, nowMs: number): Promise<void> {
    if (progress.phase !== "ended") {
      return;
    }
    if (endedSinceMs === null) {
      endedSinceMs = nowMs;
      return;
    }
    if (killedForEnded || nowMs - endedSinceMs < ENDED_KILL_GRACE_MS) {
      return;
    }
    killedForEnded = true;
    try {
      await ctx.deps.host.kill(pid);
    } catch (error) {
      ctx.deps.logger.error(`「ended」超时未退出，结束进程失败：${runId}`, error);
    }
  }

  async function finishInternal(exit: ProcessExit): Promise<void> {
    finished = true;
    const freshRun = ctx.deps.repos.runs.get(runId);
    const worker = ctx.deps.repos.workers.get(workerId);
    if (freshRun === null || worker === null) {
      ctx.deps.logger.error(`运行 ${runId} 收尾时找不到记录，放弃收尾`);
      return;
    }
    await resolveAndFinishRun(ctx, { run: freshRun, worker, progress: reducer.progress(), exit });
  }

  async function pollInternal(nowMs: number): Promise<boolean> {
    if (finished) {
      return true;
    }
    try {
      const drafts = await drainBoth(isoNow(nowMs));
      await publishDrafts(drafts);

      const progress = reducer.progress();
      maybeCaptureSessionRef(progress);
      maybePersistProgress(progress, nowMs);
      await maybeKillAfterEnded(progress, nowMs);

      if (isAdopted && nowMs - lastAliveCheckAtMs >= ADOPTED_ALIVE_CHECK_INTERVAL_MS) {
        lastAliveCheckAtMs = nowMs;
        const alive = await ctx.deps.host.isAlive(pid, processImage);
        if (!alive) {
          await finishInternal({ kind: "lost" });
          return true;
        }
      }
      return false;
    } catch (error) {
      ctx.deps.logger.error(`跟踪运行 ${runId} 出错`, error);
      return false;
    }
  }

  async function handleExitInternal(exit: ProcessExitInfo): Promise<void> {
    if (finished) {
      return;
    }
    try {
      const at = isoNow(ctx.now());
      const drafts = await drainBoth(at);
      flushRemainder(stdoutTailer, "stdout", reducer, at, drafts);
      flushRemainder(stderrTailer, "stderr", reducer, at, drafts);
      await publishDrafts(drafts);
      await finishInternal({ kind: "exited", code: exit.code, signal: exit.signal });
    } catch (error) {
      ctx.deps.logger.error(`处理运行 ${runId} 的进程退出出错`, error);
    }
  }

  return {
    runId,
    workerId,
    isAdopted,
    poll(nowMs: number): Promise<boolean> {
      return runExclusive(() => pollInternal(nowMs));
    },
    handleExit(exit: ProcessExitInfo): Promise<void> {
      return runExclusive(() => handleExitInternal(exit));
    },
  };
}
