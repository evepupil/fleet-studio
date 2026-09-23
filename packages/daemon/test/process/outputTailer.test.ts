/**
 * 增量读输出文件（规格第 3.6、4 节）：分几次追加，含 CRLF、跨读取边界的中文、末尾半行；
 * flush 取最后半行；文件被截短后从头读。
 */

import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOutputTailer } from "../../src/process/outputTailer.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

describe("createOutputTailer", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await createTempDir("fleet-outputtailer-");
    filePath = join(tempDir, "out.log");
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("文件不存在时返回空数组", async () => {
    const tailer = createOutputTailer(join(tempDir, "not-there.log"));
    expect(await tailer.readNew()).toEqual([]);
    expect(tailer.offset).toBe(0);
  });

  it("分几次追加，逐次只读到新增的完整行", async () => {
    const tailer = createOutputTailer(filePath);

    await appendFile(filePath, "line1\nline2\n", "utf8");
    expect(await tailer.readNew()).toEqual(["line1", "line2"]);
    expect(await tailer.readNew()).toEqual([]); // 没有新增内容

    await appendFile(filePath, "line3\n", "utf8");
    expect(await tailer.readNew()).toEqual(["line3"]);
  });

  it("CRLF 行尾：每行去掉末尾 \\r", async () => {
    const tailer = createOutputTailer(filePath);
    await appendFile(filePath, "a\r\nb\r\n", "utf8");
    expect(await tailer.readNew()).toEqual(["a", "b"]);
  });

  it("末尾不完整的一行留到下次；flush 能取到它，取完之后 flush 返回 null", async () => {
    const tailer = createOutputTailer(filePath);
    await appendFile(filePath, "complete\npartial-tail", "utf8");

    expect(await tailer.readNew()).toEqual(["complete"]);
    expect(tailer.flush()).toBe("partial-tail");
    expect(tailer.flush()).toBeNull();
  });

  it("flush 返回的半行也会去掉末尾 \\r", async () => {
    const tailer = createOutputTailer(filePath);
    await appendFile(filePath, "partial-tail\r", "utf8");
    await tailer.readNew();
    expect(tailer.flush()).toBe("partial-tail");
  });

  it("没有残留内容时 flush 返回 null", async () => {
    const tailer = createOutputTailer(filePath);
    await appendFile(filePath, "line1\n", "utf8");
    await tailer.readNew();
    expect(tailer.flush()).toBeNull();
  });

  it("多字节字符跨两次读取边界也不乱码", async () => {
    const tailer = createOutputTailer(filePath);
    const zhong = Buffer.from("中", "utf8"); // UTF-8 下是 3 个字节
    expect(zhong.length).toBe(3);

    // 第一次只写「中」的前两个字节，字符被从中间切断。
    await appendFile(filePath, Buffer.concat([Buffer.from("AB", "utf8"), zhong.subarray(0, 2)]));
    expect(await tailer.readNew()).toEqual([]); // 还没有换行，也没有解码出完整字符

    // 补上剩下的一个字节，再加完整的后续内容。
    await appendFile(filePath, Buffer.concat([zhong.subarray(2), Buffer.from("CD\n", "utf8")]));
    expect(await tailer.readNew()).toEqual(["AB中CD"]);
  });

  it("文件被截短（大小小于已消费的偏移）时从头重新读", async () => {
    const tailer = createOutputTailer(filePath);
    await appendFile(filePath, "first-long-line\nsecond-line\n", "utf8");
    expect(await tailer.readNew()).toEqual(["first-long-line", "second-line"]);
    expect(tailer.offset).toBeGreaterThan(0);

    // 模拟文件被截断重写成更短的内容（例如日志轮转）。
    await writeFile(filePath, "new-start\n", "utf8");
    expect(await tailer.readNew()).toEqual(["new-start"]);
    expect(tailer.offset).toBe(Buffer.byteLength("new-start\n", "utf8"));
  });

  it("从非零 startOffset 开始读，跳过之前的内容", async () => {
    await appendFile(filePath, "skip-me\nread-me\n", "utf8");
    const skipBytes = Buffer.byteLength("skip-me\n", "utf8");
    const tailer = createOutputTailer(filePath, skipBytes);
    expect(await tailer.readNew()).toEqual(["read-me"]);
  });

  it("单次读取最多 4MB，超出部分留到下次", async () => {
    const tailer = createOutputTailer(filePath);
    const bigLine = "x".repeat(3 * 1024 * 1024); // 3MB 一行
    await appendFile(filePath, `${bigLine}\n${bigLine}\n`, "utf8"); // 总共超过 4MB

    const firstBatch = await tailer.readNew();
    // 两行总共 ~6MB，单次最多读 4MB：第一次一定读不全，证明上限确实生效了。
    expect(firstBatch.length).toBeLessThan(2);

    let combined = firstBatch;
    while (combined.length < 2) {
      const more = await tailer.readNew();
      expect(more.length).toBeGreaterThan(0);
      combined = combined.concat(more);
    }
    expect(combined).toEqual([bigLine, bigLine]);
  });
});
