import { rm } from "node:fs/promises";
import type { EngineContext } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 过期清理（模块设计 3.15）：启动时和之后每小时跑一次。
 * 删掉最新一次运行已是终态、且结束时间早于 cutoff 的苦工——连同它们全部运行的磁盘目录，
 * 再删没有任何苦工、创建时间早于 cutoff 的项目。单个目录删不掉不影响其它苦工的清理。
 */
export async function runRetentionSweep(ctx: EngineContext): Promise<void> {
  const config = ctx.deps.config.current();
  const cutoff = new Date(ctx.now() - config.retentionDays * DAY_MS).toISOString();

  const workerIds = ctx.deps.repos.runs.listExpiredWorkerIds(cutoff);
  if (workerIds.length > 0) {
    const runs = ctx.deps.repos.runs.listByWorkers(workerIds);
    for (const run of runs) {
      try {
        await rm(ctx.deps.paths.runDir(run.id), { recursive: true, force: true });
      } catch (error) {
        ctx.deps.logger.error(`过期清理删除运行目录失败：${run.id}`, error);
      }
    }
    // workers 表对 runs 有 ON DELETE CASCADE，删苦工会一并删掉它的全部运行记录。
    ctx.deps.repos.workers.deleteMany(workerIds);
    // 评审 F6a：苦工都删了，timelineStore 里对应的缓存和常驻标记也要一并清掉，
    // 否则这两张表会随着「建档又过期」的苦工数量只增不减。
    for (const workerId of workerIds) {
      ctx.timelines.forget(workerId);
    }
  }

  const orphanCount = ctx.deps.repos.projects.deleteOrphansCreatedBefore(cutoff);
  ctx.deps.logger.info(
    `过期清理：删除了 ${workerIds.length} 个苦工、${orphanCount} 个没有苦工的项目`,
  );

  if (workerIds.length > 0) {
    ctx.notifySnapshot();
  }
}
