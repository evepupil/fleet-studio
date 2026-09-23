import { readFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import { CliUsageError } from "./errors.js";

const BOM = "﻿";

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

export interface PromptSource {
  /** run/send 的位置参数；多个用空格拼接；恰好是单个 "-" 时表示从标准输入读。 */
  readonly positionals: readonly string[];
  readonly promptFile: string | undefined;
}

async function readStdinText(stdin: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * 读任务正文，三选一（规格 3.4 run）：位置参数 / --prompt-file / 单个 "-" 从标准输入读到结束。
 * 都没给就是用法错误。--prompt-file 按 UTF-8 读并去掉开头的 BOM；标准输入原样返回，不做裁剪，
 * 因为脚本可能故意保留首尾空白。
 */
export async function readPromptBody(source: PromptSource, stdin: Readable): Promise<string> {
  if (source.positionals.length === 1 && source.positionals[0] === "-") {
    return readStdinText(stdin);
  }
  if (source.positionals.length > 0) {
    return source.positionals.join(" ");
  }
  if (source.promptFile !== undefined) {
    const text = await readFile(source.promptFile, "utf8");
    return stripBom(text);
  }
  throw new CliUsageError(
    "缺少任务正文：请提供位置参数、--prompt-file <文件>，或传入 - 从标准输入读取",
  );
}
