/**
 * scenarioPrompt / fakePiCommand / fakeOpencodeCommand 的纯函数测试：不涉及子进程。
 * 标记格式必须和 packages/testkit/bin/scenario.mjs 里的 parseScenario 逐字对得上，
 * 否则假苦工永远走不到期望的剧本分支。
 */

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeOpencodeCommand, fakePiCommand, scenarioPrompt } from "../src/index.js";

describe("scenarioPrompt：拼出剧本标记", () => {
  it("只给剧本名：只有 [[scenario:xxx]] 一个标记", () => {
    expect(scenarioPrompt("success")).toBe("[[scenario:success]]");
  });

  it("带 delay/tools/exit：按 scenario/delay/tools/exit 的固定顺序拼", () => {
    const prompt = scenarioPrompt("crash", { delayMs: 200, tools: 3, exitCode: 7 });
    expect(prompt).toBe("[[scenario:crash]] [[delay:200]] [[tools:3]] [[exit:7]]");
  });

  it("带 text：追加在标记后面，用空格分开", () => {
    const prompt = scenarioPrompt("success", { text: "顺手看看这段任务文字有没有被吞掉" });
    expect(prompt).toBe("[[scenario:success]] 顺手看看这段任务文字有没有被吞掉");
  });

  it("没传的选项不会留下标记（不会拼出 [[delay:undefined]] 这种东西）", () => {
    const prompt = scenarioPrompt("no-key", { tools: 2 });
    expect(prompt).toBe("[[scenario:no-key]] [[tools:2]]");
    expect(prompt).not.toContain("undefined");
  });
});

describe("fakePiCommand / fakeOpencodeCommand：脚本路径要真实存在", () => {
  it("fakePiCommand 指向 Node 自己 + bin/fake-pi.mjs，文件真实存在", () => {
    const [exe, script] = fakePiCommand();
    expect(exe).toBe(process.execPath);
    expect(script).toBeDefined();
    expect(script?.endsWith("fake-pi.mjs")).toBe(true);
    expect(existsSync(script ?? "")).toBe(true);
  });

  it("fakeOpencodeCommand 指向 Node 自己 + bin/fake-opencode.mjs，文件真实存在", () => {
    const [exe, script] = fakeOpencodeCommand();
    expect(exe).toBe(process.execPath);
    expect(script).toBeDefined();
    expect(script?.endsWith("fake-opencode.mjs")).toBe(true);
    expect(existsSync(script ?? "")).toBe(true);
  });
});
