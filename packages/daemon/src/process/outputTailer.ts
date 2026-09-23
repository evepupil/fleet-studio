/**
 * 增量读一个不断增长的输出文件：多字节字符跨读取边界不乱码，单次最多读 4MB，
 * 文件被截短时从头重读（模块设计第 3.6 节）。
 */

import { open, stat } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import type { OutputTailer } from "./types.js";

const MAX_READ_BYTES = 4 * 1024 * 1024;

export function createOutputTailer(filePath: string, startOffset = 0): OutputTailer {
  let offset = startOffset;
  let pending = ""; // 上次读到的、还不完整的最后一行
  let decoder = new StringDecoder("utf8");

  return {
    get offset(): number {
      return offset;
    },

    async readNew(): Promise<string[]> {
      const size = await fileSizeOrNull(filePath);
      if (size === null) {
        return [];
      }

      if (size < offset) {
        // 文件被截短：旧的偏移和残留字节都对不上号了，从头重新读。
        offset = 0;
        pending = "";
        decoder = new StringDecoder("utf8");
      }
      if (size === offset) {
        return [];
      }

      const bytesToRead = Math.min(size - offset, MAX_READ_BYTES);
      const chunk = await readChunk(filePath, offset, bytesToRead);
      offset += chunk.length;

      const text = pending + decoder.write(chunk);
      const lines = text.split("\n");
      pending = lines.pop() ?? "";
      return lines.map(stripTrailingCr);
    },

    flush(): string | null {
      const remainder = pending + decoder.end();
      pending = "";
      return remainder === "" ? null : stripTrailingCr(remainder);
    },
  };
}

async function fileSizeOrNull(filePath: string): Promise<number | null> {
  try {
    const stats = await stat(filePath);
    return stats.size;
  } catch {
    return null;
  }
}

/** 从指定位置读最多 maxBytes 字节，返回实际读到的部分（文件可能比预期短）。 */
async function readChunk(filePath: string, position: number, maxBytes: number): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function stripTrailingCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
