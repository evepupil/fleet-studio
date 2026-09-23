/**
 * 身份核对纯函数 + 批量查询测试（模块设计：服务层-进程托管 3.5、第 4 节）。
 * 真实进程的身份核对（isAlive/kill 带身份）在 processHost.test.ts 里，
 * 因为那是 ProcessHost 组装之后的公开行为，这里只测 identityProbe.ts 自己的东西。
 */
import { describe, expect, it } from "vitest";
import {
  createIdentityProbe,
  IDENTITY_CLOCK_TOLERANCE_MS,
  matchesIdentity,
  parseProcessFactsLines,
} from "../../src/process/identityProbe.js";

describe("parseProcessFactsLines", () => {
  it("解析多行 <pid>|<映像名>|<创建时间毫秒>", () => {
    const output = "1234|node.exe|1700000000000\n5678|opencode.exe|1700000001000\n";
    const facts = parseProcessFactsLines(output);
    expect(facts.get(1234)).toEqual({ image: "node.exe", createdAtMs: 1700000000000 });
    expect(facts.get(5678)).toEqual({ image: "opencode.exe", createdAtMs: 1700000001000 });
    expect(facts.size).toBe(2);
  });

  it("空行直接跳过", () => {
    const facts = parseProcessFactsLines("\n1234|node.exe|1700000000000\n\n");
    expect(facts.size).toBe(1);
  });

  it("字段不全的行跳过", () => {
    const facts = parseProcessFactsLines("1234|node.exe\n5678|opencode.exe|1700000001000\n");
    expect(facts.has(1234)).toBe(false);
    expect(facts.get(5678)).toEqual({ image: "opencode.exe", createdAtMs: 1700000001000 });
  });

  it("pid 或创建时间不是数字的行跳过", () => {
    const facts = parseProcessFactsLines(
      "abc|node.exe|1700000000000\n1234|node.exe|not-a-number\n",
    );
    expect(facts.size).toBe(0);
  });

  it("处理 CRLF 行尾", () => {
    const facts = parseProcessFactsLines("1234|node.exe|1700000000000\r\n");
    expect(facts.get(1234)).toEqual({ image: "node.exe", createdAtMs: 1700000000000 });
  });
});

describe("matchesIdentity", () => {
  const facts = { image: "node.exe", createdAtMs: 1_700_000_000_000 };

  it("映像名不区分大小写相等才算匹配", () => {
    expect(matchesIdentity(facts, { image: "NODE.EXE", spawnedAtMs: null })).toBe(true);
    expect(matchesIdentity(facts, { image: "opencode.exe", spawnedAtMs: null })).toBe(false);
  });

  it("identity.image 为 null 时不核对映像名", () => {
    expect(matchesIdentity(facts, { image: null, spawnedAtMs: null })).toBe(true);
  });

  it("创建时间恰好等于 spawnedAtMs + 容差：算匹配（边界值）", () => {
    const identity = { image: null, spawnedAtMs: facts.createdAtMs - IDENTITY_CLOCK_TOLERANCE_MS };
    expect(matchesIdentity(facts, identity)).toBe(true);
  });

  it("创建时间比 spawnedAtMs + 容差晚 1 毫秒：不匹配", () => {
    const identity = {
      image: null,
      spawnedAtMs: facts.createdAtMs - IDENTITY_CLOCK_TOLERANCE_MS - 1,
    };
    expect(matchesIdentity(facts, identity)).toBe(false);
  });

  it("创建时间早于 spawnedAtMs：算匹配（进程创建理应不晚于拿到号的时刻）", () => {
    const identity = { image: null, spawnedAtMs: facts.createdAtMs + 60_000 };
    expect(matchesIdentity(facts, identity)).toBe(true);
  });

  it("identity.spawnedAtMs 为 null 时不核对创建时间", () => {
    const identity = { image: "node.exe", spawnedAtMs: null };
    expect(matchesIdentity({ ...facts, createdAtMs: 0 }, identity)).toBe(true);
  });

  it("两项都为 null：永远匹配", () => {
    expect(matchesIdentity(facts, { image: null, spawnedAtMs: null })).toBe(true);
  });
});

describe("createIdentityProbe：合批查询", () => {
  it("同一轮事件循环里的多个 lookup 合并成一次查询，各自拿到自己的结果", async () => {
    const calls: (readonly number[])[] = [];
    const probe = createIdentityProbe(async (pids) => {
      calls.push(pids);
      return "1|node.exe|100\n2|opencode.exe|200\n";
    });

    const [first, second, third] = await Promise.all([
      probe.lookup(1),
      probe.lookup(2),
      probe.lookup(3), // 查不到
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([1, 2, 3]);
    expect(first).toEqual({ image: "node.exe", createdAtMs: 100 });
    expect(second).toEqual({ image: "opencode.exe", createdAtMs: 200 });
    expect(third).toBeNull();
  });

  it("不同轮次分别查询，不会跨轮合并", async () => {
    const calls: (readonly number[])[] = [];
    const probe = createIdentityProbe(async (pids) => {
      calls.push(pids);
      return "1|node.exe|100\n";
    });

    await probe.lookup(1);
    await probe.lookup(1);

    expect(calls).toHaveLength(2);
  });

  it("同一批里重复的 pid 去重之后再查询", async () => {
    const calls: (readonly number[])[] = [];
    const probe = createIdentityProbe(async (pids) => {
      calls.push(pids);
      return "1|node.exe|100\n";
    });

    const [first, second] = await Promise.all([probe.lookup(1), probe.lookup(1)]);

    expect(calls[0]).toEqual([1]);
    expect(first).toEqual(second);
  });

  it("查询本身出错时，这一批的全部 lookup 都会 reject", async () => {
    const probe = createIdentityProbe(async () => {
      throw new Error("PowerShell 起不来");
    });

    await expect(Promise.all([probe.lookup(1), probe.lookup(2)])).rejects.toThrow(
      "PowerShell 起不来",
    );
  });

  it("pid 不是正整数时拒绝查询（防止拼进命令的不是我们自己产生的整数）", async () => {
    const probe = createIdentityProbe(async () => "");
    await expect(probe.lookup(-1)).rejects.toThrow();
  });
});
