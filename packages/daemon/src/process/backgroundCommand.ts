import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** 后台辅助命令不创建可见终端；输出和失败信息照常交给调用方，不经过 shell。 */
export function runBackgroundCommand(
  executable: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(executable, args, { windowsHide: true, encoding: "utf8" });
}
