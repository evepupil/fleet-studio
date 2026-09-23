/**
 * opencode 启动参数。规则见模块设计文档《核心层 · 运行时适配》第 5.1、5.2 节。
 * 这里只拼参数、决定要不要落一个 task.md 文件，不做任何实际 IO。
 */
import type { PoolConfig } from "../../config/schema.js";
import { FleetError } from "../../domain/errors.js";
import { guardLeadingDash, joinFilePath } from "../text.js";
import {
  ARGV_PROMPT_MAX_CHARS,
  type BuildLaunchInput,
  type LaunchFile,
  type LaunchSpec,
} from "../types.js";

/** 正文超长时落盘的文件名。 */
const TASK_FILE_NAME = "task.md";
/** 正文超长时，命令行里换成的固定提示；真正的任务说明已经写进附件文件。 */
const OVERFLOW_MESSAGE = "请完整阅读并执行附件文件里的任务说明。";

/** 池在 opencode 下的显示模型名；池没有为 opencode 指定模型时为 null。 */
export function displayModel(pool: PoolConfig): string | null {
  return pool.runtimes.opencode?.model ?? null;
}

export function buildLaunch(input: BuildLaunchInput): LaunchSpec {
  const opencodeModel = input.pool.runtimes.opencode;
  if (opencodeModel === undefined) {
    throw new FleetError("runtime_unavailable", `池 ${input.pool.id} 没有为 opencode 指定模型`);
  }

  const agent = input.role.opencode.agent ?? null;
  const fullText = buildFullText(input.prompt, input.rolePromptText, agent);

  const files: LaunchFile[] = [];
  let taskFilePath: string | null = null;
  let message: string;
  if (fullText.length <= ARGV_PROMPT_MAX_CHARS) {
    message = guardLeadingDash(fullText);
  } else {
    taskFilePath = joinFilePath(input.runDir, TASK_FILE_NAME);
    files.push({ path: taskFilePath, content: fullText });
    message = OVERFLOW_MESSAGE;
  }

  const args = ["run", "--format", "json", "--auto", "--dir", input.cwd, "-m", opencodeModel.model];
  if (opencodeModel.variant !== undefined) {
    args.push("--variant", opencodeModel.variant);
  }
  if (agent !== null) {
    args.push("--agent", agent);
  }
  if (input.isContinuation) {
    if (input.sessionRef === null) {
      throw new FleetError("invalid_request", "会话还没建立，无法续接");
    }
    args.push("--session", input.sessionRef);
  } else {
    args.push("--title", input.title);
  }
  if (taskFilePath !== null) {
    // -f 在 opencode 里是数组类型参数：必须紧跟一个开关参数（--thinking）把它终结掉，
    // 否则排在命令行末尾的任务正文消息会被当成 -f 的又一个附件一起吞掉（D4）。
    args.push("-f", taskFilePath);
  }
  // 让思考内容出现在事件流里；同时（在走文件的情况下）终结 -f 的数组。
  // opencode 不认 thinking 档位，input.thinking 不参与拼参数。
  args.push("--thinking");
  args.push(message);

  return { args, files };
}

/**
 * 消息全文：没有 --agent 时，角色行为全靠拼进消息的系统提示词兜底，
 * 把角色提示词放在任务正文前面；有 --agent 时角色已经在 opencode 那一侧生效，不用再拼一遍。
 */
function buildFullText(
  prompt: string,
  rolePromptText: string | null,
  agent: string | null,
): string {
  if (agent === null && rolePromptText !== null) {
    return `${rolePromptText}\n\n---\n\n${prompt}`;
  }
  return prompt;
}
