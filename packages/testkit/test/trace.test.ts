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
  return { runtime: "pi", cwd: "C:\\work", args: null, ...overrides };
}

describe("readTrace：解析轨迹文件", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fleet-testkit-trace-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("start 行带 args，end 行不带 args；空行跳过", () => {
    const file = join(dir, "trace.jsonl");
    const lines = [
      JSON.stringify({
        event: "start",
        pid: 111,
        at: 1000,
        runtime: "pi",
        args: ["-p", "hi"],
        cwd: "C:\\work",
      }),
      "",
      JSON.stringify({ event: "end", pid: 111, at: 2000, runtime: "pi", cwd: "C:\\work" }),
    ];
    writeFileSync(file, `${lines.join("\n")}\n`);

    const entries = readTrace(file);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ event: "start", pid: 111, at: 1000, args: ["-p", "hi"] });
    expect(entries[1]).toMatchObject({ event: "end", pid: 111, at: 2000, args: null });
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
      { event: "start", pid: 2, at: 1, runtime: "opencode", cwd: "C:\\w", args: null },
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
});
