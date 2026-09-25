/**
 * 数据目录布局（技术设计文档第三节；模块设计《服务层-调度引擎》4.1 节）：
 * 给定数据目录根路径，算出各文件和目录的绝对路径，全部用 node:path 拼接，
 * 不在字符串里手写分隔符，保证 Windows 和 POSIX 都能用。
 */
import { join } from "node:path";
import type { DaemonPaths } from "./types.js";

/**
 * 配置文件备份目录（第二版：看板改配置前先留一份原文）。
 * DaemonPaths 是主控维护的契约，这次不动它的字段，先以独立函数导出；
 * 之后契约扩字段时可以直接接上。
 */
export function configBackupsDir(home: string): string {
  return join(home, "config-backups");
}

type DaemonPathsWithDbBackups = DaemonPaths & { dbBackupsDir: string };

export function resolveDaemonPaths(home: string): DaemonPathsWithDbBackups {
  const runsDir = join(home, "runs");
  return {
    home,
    configFile: join(home, "config.json"),
    daemonInfoFile: join(home, "daemon.json"),
    dbFile: join(home, "fleet.db"),
    dbBackupsDir: join(home, "db-backups"),
    logFile: join(home, "daemon.log"),
    runsDir,
    runDir(runId: string): string {
      return join(runsDir, runId);
    },
    outFile(runId: string): string {
      return join(runsDir, runId, "out.jsonl");
    },
    errFile(runId: string): string {
      return join(runsDir, runId, "err.log");
    },
    timelineFile(runId: string): string {
      return join(runsDir, runId, "timeline.jsonl");
    },
  };
}
