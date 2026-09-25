/**
 * 存活判断：Windows 靠 tasklist 按 PID 过滤，核对进程映像名以防进程号被系统复用；
 * 其他平台靠 kill(pid, 0) 是否抛异常（模块设计第 3.5 节）。
 */

import { runBackgroundCommand } from "./backgroundCommand.js";

/** tasklist /FO CSV 输出的一行，只保留判断存活用得到的两个字段。 */
export interface TasklistEntry {
  imageName: string;
  pid: number;
}

export async function isProcessAlive(pid: number, image: string | null): Promise<boolean> {
  if (process.platform !== "win32") {
    return isProcessAlivePosix(pid);
  }
  const { stdout } = await runBackgroundCommand("tasklist", [
    "/FI",
    `PID eq ${pid}`,
    "/FO",
    "CSV",
    "/NH",
  ]);
  const entry = parseTasklistCsv(stdout).find((candidate) => candidate.pid === pid);
  if (entry === undefined) {
    return false;
  }
  if (image === null) {
    return true;
  }
  return entry.imageName.toLowerCase() === image.toLowerCase();
}

function isProcessAlivePosix(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 解析 tasklist /FO CSV /NH 的输出；没有任务时那一行提示不以引号开头，天然被跳过。 */
export function parseTasklistCsv(output: string): TasklistEntry[] {
  const entries: TasklistEntry[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('"')) {
      continue;
    }
    const fields = parseCsvLine(line);
    const imageName = fields[0];
    const pidText = fields[1];
    if (imageName === undefined || pidText === undefined) {
      continue;
    }
    const pid = Number.parseInt(pidText, 10);
    if (Number.isNaN(pid)) {
      continue;
    }
    entries.push({ imageName, pid });
  }
  return entries;
}

/** 逐字符解析一行 CSV：字段总被双引号包住，值里可能带逗号（例如内存用量 "89,720 K"）。 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  const length = line.length;
  let i = 0;
  while (i < length) {
    if (line.charAt(i) === '"') {
      let value = "";
      i += 1;
      while (i < length) {
        const ch = line.charAt(i);
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      fields.push(value);
      if (line.charAt(i) === ",") {
        i += 1;
      }
    } else {
      let end = line.indexOf(",", i);
      if (end === -1) {
        end = length;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}
