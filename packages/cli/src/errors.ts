/**
 * 命令行统一的退出码与两类跨子命令都用得到的异常。
 * 之所以单独成文件：main.ts 的顶层错误处理和几乎每个子命令都要引用同一份退出码常量，
 * 放进任何一个具体子命令文件都会造成循环引用。
 */

/** 退出码含义见 命令行层-fleet命令 模块设计 3.1。 */
export const EXIT_CODE = {
  ok: 0,
  failure: 1,
  timeout: 2,
  usage: 3,
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

/** 用法错误：参数缺失或不合法，还没来得及联系服务。main.ts 统一映射成退出码 3。 */
export class CliUsageError extends Error {}

/** 连不上服务：daemon.json 读不到、探活失败、拉起服务超时等。main.ts 统一映射成退出码 3。 */
export class CliConnectionError extends Error {}
