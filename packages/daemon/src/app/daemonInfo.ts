/**
 * daemon.json 的读写（模块设计《服务层-调度引擎》4 节文件表 app/daemonInfo.ts 行）：
 * 命令行靠这份文件找到服务，所以写入要先写临时文件再改名，不能让命令行读到写了一半的内容。
 */
import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import type { DaemonInfo } from "./types.js";

/** 先写临时文件再改名：改名在同一个文件系统内是原子操作，不会读到半截内容。 */
async function writeFileAtomic(file: string, content: string): Promise<void> {
  const tempFile = `${file}.tmp-${randomBytes(4).toString("hex")}`;
  await writeFile(tempFile, content, "utf8");
  await rename(tempFile, file);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 项目开了 noPropertyAccessFromIndexSignature，Record<string, unknown> 不能用点号读字段。 */
function readUnknownField(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

/** 读到的内容可能是旧版本写的、或者正好写了一半就被读到，逐字段核对形状。 */
function isDaemonInfo(value: unknown): value is DaemonInfo {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof readUnknownField(value, "pid") === "number" &&
    typeof readUnknownField(value, "port") === "number" &&
    typeof readUnknownField(value, "token") === "string" &&
    typeof readUnknownField(value, "startedAt") === "string" &&
    typeof readUnknownField(value, "version") === "string" &&
    typeof readUnknownField(value, "home") === "string"
  );
}

/** 文件不存在、内容不是 JSON、或者形状不对，统一当作「服务没在跑」返回 null。 */
export async function readDaemonInfo(file: string): Promise<DaemonInfo | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isDaemonInfo(parsed) ? parsed : null;
}

export async function writeDaemonInfo(file: string, info: DaemonInfo): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(info, null, 2)}\n`);
}

/**
 * 服务退出时删除 daemon.json；只删自己写的那份——如果文件里的进程号已经不是自己
 * （新实例抢先起来并覆盖了这个文件），说明这份文件属于别人，保留它，不能替新实例删掉。
 */
export async function removeDaemonInfoIfOwned(file: string, pid: number): Promise<void> {
  const info = await readDaemonInfo(file);
  if (info === null || info.pid !== pid) {
    return;
  }
  await rm(file, { force: true });
}
