import type { Readable } from "node:stream";
import type { CliIo } from "./io.js";

/**
 * 每个子命令都要用到的运行环境。测试靠注入假的 io / stdin / cwd / now 来断言输出和请求，
 * 不需要劫持 process 或全局时钟。
 */
export interface CommandDeps {
  readonly io: CliIo;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly stdin: Readable;
  readonly now: () => Date;
}
