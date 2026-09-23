/**
 * resolveDaemonPaths 组装测试（模块设计《服务层-调度引擎》4.1 节）：数据目录下每个
 * 文件/目录的绝对路径都算对，单次运行专属路径按运行编号拼在 runs/ 下面。
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDaemonPaths } from "../../src/app/paths.js";

describe("resolveDaemonPaths", () => {
  const home = join("C:", "fake-home", ".fleet-studio");

  it("顶层文件和目录都在 home 下", () => {
    const paths = resolveDaemonPaths(home);
    expect(paths.home).toBe(home);
    expect(paths.configFile).toBe(join(home, "config.json"));
    expect(paths.daemonInfoFile).toBe(join(home, "daemon.json"));
    expect(paths.dbFile).toBe(join(home, "fleet.db"));
    expect(paths.logFile).toBe(join(home, "daemon.log"));
    expect(paths.runsDir).toBe(join(home, "runs"));
  });

  it("单次运行专属路径都在 runs/<运行编号>/ 下", () => {
    const paths = resolveDaemonPaths(home);
    const runId = "w7k2mq.1";
    expect(paths.runDir(runId)).toBe(join(home, "runs", runId));
    expect(paths.outFile(runId)).toBe(join(home, "runs", runId, "out.jsonl"));
    expect(paths.errFile(runId)).toBe(join(home, "runs", runId, "err.log"));
    expect(paths.timelineFile(runId)).toBe(join(home, "runs", runId, "timeline.jsonl"));
  });

  it("不同运行编号算出互不相同的目录", () => {
    const paths = resolveDaemonPaths(home);
    expect(paths.runDir("w7k2mq.1")).not.toBe(paths.runDir("w7k2mq.2"));
  });
});
