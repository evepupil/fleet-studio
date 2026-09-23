/**
 * createFileLogger 组装测试（模块设计《服务层-调度引擎》4 节文件表 app/logger.ts 行）：
 * 追加写、按级别标记、携带的抛出物取出堆栈/消息、超过阈值后把旧文件轮转成 .1。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileLogger } from "../../src/app/logger.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

describe("createFileLogger", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await createTempDir("fleet-logger-");
    file = join(dir, "daemon.log");
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("info / warn / error 各自追加一行，带级别标记和消息原文", async () => {
    const logger = createFileLogger(file);
    logger.info("服务启动");
    logger.warn("配置有问题");
    logger.error("处理失败");

    const text = await readFile(file, "utf8");
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("[INFO]");
    expect(lines[0]).toContain("服务启动");
    expect(lines[1]).toContain("[WARN]");
    expect(lines[1]).toContain("配置有问题");
    expect(lines[2]).toContain("[ERROR]");
    expect(lines[2]).toContain("处理失败");
  });

  it("error 带 Error 对象时把堆栈信息也写进日志", async () => {
    const logger = createFileLogger(file);
    logger.error("处理失败", new Error("坏了"));

    const text = await readFile(file, "utf8");
    expect(text).toContain("处理失败");
    expect(text).toContain("坏了");
  });

  it("error 带非 Error 抛出物时用字符串形式记录，不丢信息", async () => {
    const logger = createFileLogger(file);
    logger.error("处理失败", "纯字符串错误");

    const text = await readFile(file, "utf8");
    expect(text).toContain("纯字符串错误");
  });

  it("超过阈值后把旧内容轮转成 .1，新内容写进新文件", async () => {
    const logger = createFileLogger(file, { maxBytes: 10 });
    logger.info("第一行超过十个字节了"); // 第一次写，文件还不存在，不触发轮转
    logger.info("第二行"); // 这次写之前发现已经超过阈值，先轮转再写

    const rotated = await readFile(`${file}.1`, "utf8");
    expect(rotated).toContain("第一行超过十个字节了");

    const current = await readFile(file, "utf8");
    expect(current).toContain("第二行");
    expect(current).not.toContain("第一行超过十个字节了");
  });

  it("多次超过阈值只保留一份轮转文件，不会一直累加", async () => {
    const logger = createFileLogger(file, { maxBytes: 10 });
    logger.info("第一批内容超过十个字节");
    logger.info("第二批内容也超过十个字节");
    logger.info("第三批内容再次超过十个字节");

    const rotated = await readFile(`${file}.1`, "utf8");
    expect(rotated).toContain("第二批内容也超过十个字节");
    expect(rotated).not.toContain("第一批内容超过十个字节");
  });
});
