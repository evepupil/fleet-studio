/**
 * 测试用的 DaemonPaths 实现：跟 app/paths.ts（另一路负责）的目录布局保持一致，
 * 但这里独立实现一份——引擎测试不依赖装配那一路还没定稿的代码。
 */
import { join } from "node:path";
import type { DaemonPaths } from "../../../src/app/types.js";

export function createTestPaths(home: string): DaemonPaths {
  const runsDir = join(home, "runs");
  return {
    home,
    configFile: join(home, "config.json"),
    daemonInfoFile: join(home, "daemon.json"),
    dbFile: join(home, "fleet.db"),
    logFile: join(home, "daemon.log"),
    runsDir,
    runDir: (runId: string) => join(runsDir, runId),
    outFile: (runId: string) => join(runsDir, runId, "out.jsonl"),
    errFile: (runId: string) => join(runsDir, runId, "err.log"),
    timelineFile: (runId: string) => join(runsDir, runId, "timeline.jsonl"),
  };
}
