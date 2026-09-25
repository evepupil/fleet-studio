import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { EngineContext } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;
const RAW_OUTPUT_FILES = ["out.jsonl", "err.log", "task.md"] as const;

/** 原始输出清理：启动时和之后每小时跑一次，任务记录与解析后的时间线永久保留。 */
export async function runRetentionSweep(ctx: EngineContext): Promise<void> {
  const config = ctx.deps.config.current();
  const cutoff = new Date(ctx.now() - config.rawOutputRetentionDays * DAY_MS).toISOString();
  let purgedCount = 0;

  while (true) {
    const candidates = ctx.deps.repos.runs.listRawPurgeCandidates(cutoff, BATCH_SIZE);
    if (candidates.length === 0) {
      break;
    }

    const purgedIds: string[] = [];
    for (const { id } of candidates) {
      const runDir = ctx.deps.paths.runDir(id);
      const results = await Promise.allSettled(
        RAW_OUTPUT_FILES.map((file) => rm(join(runDir, file), { force: true })),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        ctx.deps.logger.error(`原始输出清理删除文件失败：${id}`, failure.reason);
        continue;
      }
      purgedIds.push(id);
    }

    if (purgedIds.length === 0) {
      break;
    }
    ctx.deps.repos.runs.markRawPurged(purgedIds);
    purgedCount += purgedIds.length;
  }

  ctx.deps.logger.info(`原始输出清理：标记了 ${purgedCount} 个运行`);
}
