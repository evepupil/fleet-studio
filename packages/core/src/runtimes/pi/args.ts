/**
 * pi 适配器的启动参数拼装：把池 / 角色配置翻译成 pi 认得的 argv。
 * 规则见 docs/模块设计/核心层-运行时适配.md 第 4.1、4.2 节。
 */

import type { PoolConfig } from "../../config/schema.js";
import { FleetError } from "../../domain/errors.js";
import { guardLeadingDash, joinFilePath } from "../text.js";
import type { BuildLaunchInput, LaunchFile, LaunchSpec } from "../types.js";
import { ARGV_PROMPT_MAX_CHARS } from "../types.js";

/** 池在 pi 下的显示模型名：<provider>/<model>；池没有为 pi 指定模型时为 null。 */
export function displayModel(pool: PoolConfig): string | null {
  const piModel = pool.runtimes.pi;
  return piModel === undefined ? null : `${piModel.provider}/${piModel.model}`;
}

/**
 * 拼 pi 的启动参数。固定顺序：
 * --mode json → --provider/--model → --session-id → --name → --no-approve →
 * --thinking(有) → --append-system-prompt(有) → --tools(有) → --exclude-tools(有) → -p <消息>。
 *
 * pi 续接和首次运行走同一套参数形状，唯一区别是 prompt 内容本身（追加指令 vs 完整任务），
 * 所以这里不需要看 input.isContinuation。pi 也没有 opencode 那种「运行时没法用文件追加角色
 * 提示词」的问题——它自己的 --append-system-prompt 就能接受文件或文本，role 里的值已经在
 * 上游展开成绝对路径，这里原样传下去即可，用不到 input.rolePromptText。
 */
export function buildLaunch(input: BuildLaunchInput): LaunchSpec {
  const piModel = input.pool.runtimes.pi;
  if (piModel === undefined) {
    throw new FleetError("runtime_unavailable", `池 ${input.pool.id} 没有为 pi 指定模型`);
  }
  if (input.sessionRef === null) {
    throw new FleetError("invalid_request", "pi 运行时必须有会话编号（sessionRef）才能启动");
  }

  const args: string[] = [
    "--mode",
    "json",
    "--provider",
    piModel.provider,
    "--model",
    piModel.model,
    "--session-id",
    input.sessionRef,
    "--name",
    input.title,
    "--no-approve",
  ];

  if (input.thinking !== null) {
    args.push("--thinking", input.thinking);
  }
  const appendSystemPrompt = input.role.pi.appendSystemPrompt;
  if (appendSystemPrompt !== undefined) {
    args.push("--append-system-prompt", appendSystemPrompt);
  }
  const tools = input.role.pi.tools;
  if (tools !== undefined && tools.length > 0) {
    args.push("--tools", tools.join(","));
  }
  const excludeTools = input.role.pi.excludeTools;
  if (excludeTools !== undefined && excludeTools.length > 0) {
    args.push("--exclude-tools", excludeTools.join(","));
  }

  const files: LaunchFile[] = [];
  if (input.prompt.length <= ARGV_PROMPT_MAX_CHARS) {
    args.push("-p", guardLeadingDash(input.prompt));
  } else {
    // 正文太长：写成文件，让 pi 把 @文件 包成 <file> 块拼进消息前面，
    // argv 里只留一句提示模型去读文件的固定指令。
    const taskFilePath = joinFilePath(input.runDir, "task.md");
    files.push({ path: taskFilePath, content: input.prompt });
    args.push("-p", "请完整阅读并执行上面文件里的任务说明。", `@${taskFilePath}`);
  }

  return { args, files };
}
