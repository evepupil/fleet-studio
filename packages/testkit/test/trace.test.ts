/**
 * readTrace / maxConcurrency 的纯函数测试。maxConcurrency 按模块设计第 4 节属于
 * “纯测”——直接构造 TraceEntry，不需要真的跑子进程。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maxConcurrency, readTrace, type TraceEntry } from "../src/index.js";

function entry(
  overrides: Partial<TraceEntry> & Pick<TraceEntry, "event" | "pid" | "at">,
): TraceEntry {
  return { runtime: "pi", cwd: "C:\\work", args: null, traceId: null, ...overrides };
}

describe("readTrace：解析轨迹文件", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fleet-testkit-trace-"));
  });

  afterEach(() => {
    // 收尾是尽力而为：删不掉不能让测试跟着失败，但也不能静默吞掉，打一行警告方便发现。
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      console.warn(`删除临时目录失败（可能是系统占用），忽略：${dir}`, error);
    }
  });

  it("start 行带 args 和轨迹编号，end 行不带 args 但带同一个轨迹编号；空行跳过", () => {
    const file = join(dir, "trace.jsonl");
    const lines = [
      JSON.stringify({
        event: "start",
        pid: 111,
        at: 1000,
        runtime: "pi",
        args: ["-p", "hi"],
        cwd: "C:\\work",
        traceId: "111-1000-abc",
      }),
      "",
      JSON.stringify({
        event: "end",
        pid: 111,
        at: 2000,
        runtime: "pi",
        cwd: "C:\\work",
        traceId: "111-1000-abc",
      }),
    ];
    writeFileSync(file, `${lines.join("\n")}\n`);

    const entries = readTrace(file);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      event: "start",
      pid: 111,
      at: 1000,
      args: ["-p", "hi"],
      traceId: "111-1000-abc",
    });
    expect(entries[1]).toMatchObject({
      event: "end",
      pid: 111,
      at: 2000,
      args: null,
      traceId: "111-1000-abc",
    });
  });

  it("旧格式行没有轨迹编号字段时，解析成 null（向后兼容）", () => {
    const file = join(dir, "trace.jsonl");
    writeFileSync(
      file,
      `${JSON.stringify({ event: "start", pid: 2, at: 1, runtime: "opencode", cwd: "C:\\w" })}\n`,
    );

    const entries = readTrace(file);
    expect(entries).toEqual([
      {
        event: "start",
        pid: 2,
        at: 1,
        runtime: "opencode",
        cwd: "C:\\w",
        args: null,
        traceId: null,
      },
    ]);
  });

  it("认不出的行（缺字段、非 JSON）直接跳过，不抛异常", () => {
    const file = join(dir, "trace.jsonl");
    const lines = [
      "不是 JSON",
      JSON.stringify({ event: "start", pid: 1 }), // 缺 at/runtime
      JSON.stringify({ event: "start", pid: 2, at: 1, runtime: "opencode", cwd: "C:\\w" }),
    ];
    writeFileSync(file, `${lines.join("\n")}\n`);

    expect(readTrace(file)).toEqual([
      {
        event: "start",
        pid: 2,
        at: 1,
        runtime: "opencode",
        cwd: "C:\\w",
        args: null,
        traceId: null,
      },
    ]);
  });
});

describe("maxConcurrency：按 start/end 时间算同时在跑的最大个数", () => {
  it("两次运行前后不重叠：最大并发是 1", () => {
    const entries = [
      entry({ event: "start", pid: 1, at: 0 }),
      entry({ event: "end", pid: 1, at: 10 }),
      entry({ event: "start", pid: 2, at: 10 }),
      entry({ event: "end", pid: 2, at: 20 }),
    ];
    expect(maxConcurrency(entries)).toBe(1);
  });

  it("两次运行有重叠：最大并发是 2", () => {
    const entries = [
      entry({ event: "start", pid: 1, at: 0 }),
      entry({ event: "end", pid: 1, at: 20 }),
      entry({ event: "start", pid: 2, at: 10 }),
      entry({ event: "end", pid: 2, at: 30 }),
    ];
    expect(maxConcurrency(entries)).toBe(2);
  });

  it("三次运行同时重叠：最大并发是 3", () => {
    const entries = [
      entry({ event: "start", pid: 1, at: 0 }),
      entry({ event: "end", pid: 1, at: 30 }),
      entry({ event: "start", pid: 2, at: 5 }),
      entry({ event: "end", pid: 2, at: 25 }),
      entry({ event: "start", pid: 3, at: 10 }),
      entry({ event: "end", pid: 3, at: 20 }),
    ];
    expect(maxConcurrency(entries)).toBe(3);
  });

  it("没有 end 的 start 按一直在跑算，会一直占着名额", () => {
    const entries = [
      entry({ event: "start", pid: 1, at: 0 }), // 没有对应的 end
      entry({ event: "start", pid: 2, at: 100 }),
      entry({ event: "end", pid: 2, at: 200 }),
    ];
    expect(maxConcurrency(entries)).toBe(2);
  });

  it("空列表：并发是 0", () => {
    expect(maxConcurrency([])).toBe(0);
  });

  // Windows 会重复分配进程号（主控实测：8 路并行起 300 个短命进程，26 次拿到用过的号），
  // 下面三个用例专门覆盖「进程号被复用」这一族问题。
  describe("进程号被复用", () => {
    it("带轨迹编号时按编号精确配对：正确算成 3，不会把前一个的结束时间和后一个的搭在一起", () => {
      // 两个基线进程（pid 200、201）从头到尾一直在跑；pid 100 先给苦工 1 用（0~50 结束），
      // 结束后同一个 pid 100 被系统重新分配给苦工 4（60~90）。只按进程号配对（改之前的
      // 实现）会把 endAtByPid.get(100) 算成苦工 4 的结束时间 90——苦工 1 的 start@0 和
      // 苦工 4 的 end@90 被错误地配成一对，苦工 1 从 0 到 90 全程被算成“还在跑”，
      // 60~90 这段就会把基线 2 个 + 被错误延长的苦工 1 + 真正在跑的苦工 4 一起数成 4。
      // 按轨迹编号配对后，苦工 1 应该在 50 就正确结束，60~90 只有基线 2 个 + 苦工 4 = 3。
      const entries: TraceEntry[] = [
        entry({ event: "start", pid: 200, at: 0, traceId: "baseline-a" }),
        entry({ event: "start", pid: 201, at: 0, traceId: "baseline-b" }),
        entry({ event: "start", pid: 100, at: 0, traceId: "worker-1" }),
        entry({ event: "end", pid: 100, at: 50, traceId: "worker-1" }),
        entry({ event: "start", pid: 100, at: 60, traceId: "worker-4" }), // 复用 pid 100
        entry({ event: "end", pid: 100, at: 90, traceId: "worker-4" }),
        entry({ event: "end", pid: 200, at: 100, traceId: "baseline-a" }),
        entry({ event: "end", pid: 201, at: 100, traceId: "baseline-b" }),
      ];
      expect(maxConcurrency(entries)).toBe(3);
    });

    it("没有轨迹编号的旧格式行退回按进程号配对：同一进程号的新 start 视为前一个已经结束", () => {
      // 苦工 1（pid 100）被强杀，没写 end 行；之后 pid 100 被复用给苦工 2，正常跑完。
      // 旧格式没有轨迹编号可用，只能靠“同一个进程号出现新的 start 就说明前一个已经不在了”
      // 这条规则收尾苦工 1：它在苦工 2 开跑的那一刻（10）视为结束，不会跟苦工 2 重叠计数。
      const entries: TraceEntry[] = [
        entry({ event: "start", pid: 100, at: 0 }), // 苦工 1：被强杀，没有 end
        entry({ event: "start", pid: 100, at: 10 }), // 苦工 2：复用 pid 100
        entry({ event: "end", pid: 100, at: 20 }),
      ];
      expect(maxConcurrency(entries)).toBe(1);
    });

    it("带轨迹编号时，被强杀没写 end 的进程不受同号新进程影响，仍按一直在跑算", () => {
      // 苦工 1（pid 100，轨迹编号 worker-1）被强杀没写 end；pid 100 之后被复用给苦工 2
      // （轨迹编号 worker-2），正常跑完。两个轨迹编号不同，按编号配对时互不干扰：
      // 苦工 1 从 0 开始一直被算成“还在跑”，10~20 期间苦工 1、苦工 2 都算在跑，应为 2。
      const entries: TraceEntry[] = [
        entry({ event: "start", pid: 100, at: 0, traceId: "worker-1" }), // 被强杀，没有 end
        entry({ event: "start", pid: 100, at: 10, traceId: "worker-2" }), // 复用 pid 100
        entry({ event: "end", pid: 100, at: 20, traceId: "worker-2" }),
      ];
      expect(maxConcurrency(entries)).toBe(2);
    });
  });
});
