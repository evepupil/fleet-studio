import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliUsageError } from "../src/errors.js";
import { readPromptBody } from "../src/prompt.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fleet-cli-prompt-test-"));
});

afterEach(async () => {
  // 收尾是尽力而为：删不掉不能让测试跟着失败，但也不能静默吞掉，打一行警告方便发现。
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.warn(`删除临时目录失败（可能是系统占用），忽略：${dir}`, error);
  }
});

describe("readPromptBody", () => {
  it("位置参数用空格拼接", async () => {
    const text = await readPromptBody(
      { positionals: ["写代码", "修 bug"], promptFile: undefined },
      Readable.from([]),
    );
    expect(text).toBe("写代码 修 bug");
  });

  it("--prompt-file 按 UTF-8 读取并去掉开头的 BOM", async () => {
    const file = join(dir, "task.md");
    await writeFile(file, `﻿任务内容\n第二行`, "utf8");
    const text = await readPromptBody({ positionals: [], promptFile: file }, Readable.from([]));
    expect(text).toBe("任务内容\n第二行");
    expect(text.startsWith("﻿")).toBe(false);
  });

  it("单个 - 从标准输入读到结束", async () => {
    const stdin = Readable.from(["第一段\n", "第二段"]);
    const text = await readPromptBody({ positionals: ["-"], promptFile: undefined }, stdin);
    expect(text).toBe("第一段\n第二段");
  });

  it("三种来源都没给时报用法错误", async () => {
    await expect(
      readPromptBody({ positionals: [], promptFile: undefined }, Readable.from([])),
    ).rejects.toThrow(CliUsageError);
  });
});
