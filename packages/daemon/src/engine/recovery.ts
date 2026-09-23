import { getRuntimeAdapter, type RunRecord } from "@fleet/core";
import { finishRun, resolveAndFinishRun } from "./finisher.js";
import { flushRemainder, replayRunOutput } from "./outputReplay.js";
import { createRunTracker } from "./runTracker.js";
import { writeTimelineDrafts } from "./timelineFile.js";
import type { EngineContext } from "./types.js";

/**
 * 服务启动时接管（模块设计 3.14）：对每个工作中的运行判断要不要接着跟踪。
 * 排队中的运行不用处理，正常参与随后的放行。一个运行接管出错不影响其它运行。
 */
export async function runRecovery(ctx: EngineContext): Promise<void> {
  const runningRuns = ctx.deps.repos.runs.listActive().filter((run) => run.status === "running");
  for (const run of runningRuns) {
    try {
      await recoverRun(ctx, run);
    } catch (error) {
      ctx.deps.logger.error(`接管运行 ${run.id} 出错`, error);
    }
  }
}

async function recoverRun(ctx: EngineContext, run: RunRecord): Promise<void> {
  const worker = ctx.deps.repos.workers.get(run.workerId);
  if (worker === null) {
    ctx.deps.logger.error(`接管运行 ${run.id} 时找不到所属苦工，跳过`);
    return;
  }

  if (run.pid === null) {
    // 上次服务在启动这个苦工的途中退出：从没真正拉起过进程，没有输出可看。
    await finishRun(ctx, {
      run,
      worker,
      outcome: { status: "failed", failReason: "interrupted", message: "服务在启动苦工时退出" },
      exitCode: run.exitCode,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
    });
    return;
  }

  const alive = await ctx.deps.host.isAlive(run.pid, run.processImage);
  const adapter = getRuntimeAdapter(worker.runtime);
  const at = run.startedAt ?? run.queuedAt;
  const replay = await replayRunOutput(
    ctx.deps.paths.outFile(run.id),
    ctx.deps.paths.errFile(run.id),
    adapter,
    at,
  );

  if (!alive) {
    // 进程已经不在了：文件不会再增长，可以放心 flush 出最后半行，然后按输出判定结局
    // （输出里已经正常收尾的会被 resolveRunOutcome 判为已完成，不会因为「重启后找不到进程」误判失败）。
    flushRemainder(replay.stdoutTailer, "stdout", replay.reducer, at, replay.drafts);
    flushRemainder(replay.stderrTailer, "stderr", replay.reducer, at, replay.drafts);
    await writeTimelineDrafts(ctx.deps.paths.timelineFile(run.id), replay.drafts);
    await resolveAndFinishRun(ctx, {
      run,
      worker,
      progress: replay.reducer.progress(),
      exit: { kind: "lost" },
    });
    return;
  }

  // 还活着：重写 timeline.jsonl 落盘，把重放出的草稿灌进内存缓存，
  // 用同一批已经追平当前文件末尾的 tailer 和解析器继续跟踪（不能新建，否则会把历史内容重复喂一遍）。
  await writeTimelineDrafts(ctx.deps.paths.timelineFile(run.id), replay.drafts);
  ctx.timelines.appendDrafts(worker.id, run.id, replay.drafts);

  const tracker = createRunTracker(ctx, {
    runId: run.id,
    workerId: worker.id,
    pid: run.pid,
    processImage: run.processImage,
    reducer: replay.reducer,
    stdoutTailer: replay.stdoutTailer,
    stderrTailer: replay.stderrTailer,
    isAdopted: true,
    sessionRefKnown: worker.sessionRef !== null,
  });
  ctx.trackers.set(run.id, tracker);
  await ctx.timelines.refresh(worker.id);
}
