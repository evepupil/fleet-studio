import { Readable } from "node:stream";
import type { CommandDeps } from "../../src/context.js";

export interface FakeDeps extends CommandDeps {
  readonly stdoutLines: string[];
  readonly stderrLines: string[];
}

export interface FakeDepsOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly stdinText?: string;
  readonly now?: () => Date;
}

/** 固定的「现在」时间：格式化相关测试要能重复断言，不能每次跑出不同的相对时长。 */
const DEFAULT_NOW = (): Date => new Date("2026-09-23T10:00:00.000Z");

/** 测试用的运行环境：stdout / stderr 写进数组，不碰真的终端；stdin 是一段固定文本。 */
export function createFakeDeps(options: FakeDepsOptions = {}): FakeDeps {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    io: {
      stdout(line: string): void {
        stdoutLines.push(line);
      },
      stderr(line: string): void {
        stderrLines.push(line);
      },
    },
    env: options.env ?? {},
    cwd: options.cwd ?? process.cwd(),
    stdin: Readable.from([options.stdinText ?? ""]),
    now: options.now ?? DEFAULT_NOW,
    stdoutLines,
    stderrLines,
  };
}
