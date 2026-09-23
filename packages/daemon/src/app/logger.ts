/**
 * 服务自己的日志（模块设计《服务层-调度引擎》4 节文件表 app/logger.ts 行）：
 * 追加写文本文件；单个文件超过阈值时把旧内容整份改名成 .1 再继续写新的，只保留一代历史。
 *
 * 全部用同步文件调用：日志量很小（每次一行），换成异步反而引入「多次调用的写入顺序
 * 可能乱序」的风险（两次 appendFile 各自排队到 libuv 线程池，完成顺序不保证和调用顺序
 * 一致）；本机单进程场景下同步阻塞几毫秒的代价可以忽略。
 */
import { appendFileSync, renameSync, statSync } from "node:fs";
import type { Logger } from "./types.js";

/** 单个日志文件的默认轮转阈值；测试用更小的值触发轮转，不用真的写够 5MB。 */
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export interface FileLoggerOptions {
  maxBytes?: number;
}

function currentSize(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0; // 文件还不存在，当作空文件，不触发轮转
  }
}

/** 已经达到阈值时，把旧文件整份改名成 .1（改名会覆盖已存在的同名文件）。 */
function rotateIfNeeded(file: string, maxBytes: number): void {
  if (currentSize(file) < maxBytes) {
    return;
  }
  renameSync(file, `${file}.1`);
}

function formatLine(level: string, message: string): string {
  return `${new Date().toISOString()} [${level}] ${message}\n`;
}

/**
 * 取出错误的堆栈用于记录（取不到堆栈就退回消息）。
 * 只读 Error 自带的 stack / message 字段，绝不把整个抛出物或环境变量值原样拼进日志——
 * 那是调用方构造错误信息时要负责的事（本文件只管如实落盘）。
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

function appendLine(file: string, maxBytes: number, line: string): void {
  rotateIfNeeded(file, maxBytes);
  appendFileSync(file, line, "utf8");
}

export function createFileLogger(file: string, options?: FileLoggerOptions): Logger {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  return {
    info(message: string): void {
      appendLine(file, maxBytes, formatLine("INFO", message));
    },
    warn(message: string): void {
      appendLine(file, maxBytes, formatLine("WARN", message));
    },
    error(message: string, error?: unknown): void {
      const detail = error === undefined ? "" : ` ${describeError(error)}`;
      appendLine(file, maxBytes, formatLine("ERROR", `${message}${detail}`));
    },
  };
}
