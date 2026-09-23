/**
 * daemon.json 读写测试（模块设计《服务层-调度引擎》4 节文件表 app/daemonInfo.ts 行）：
 * 读取容错、原子写入、只删除自己写的那份运行信息。
 */
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readDaemonInfo,
  removeDaemonInfoIfOwned,
  writeDaemonInfo,
} from "../../src/app/daemonInfo.js";
import type { DaemonInfo } from "../../src/app/types.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

describe("daemonInfo", () => {
  let dir: string;
  let file: string;

  const sample: DaemonInfo = {
    pid: 1234,
    port: 4870,
    token: "abc123",
    startedAt: "2026-09-23T00:00:00.000Z",
    version: "0.1.0",
    home: "C:\\fake-home",
  };

  beforeEach(async () => {
    dir = await createTempDir("fleet-daemoninfo-");
    file = join(dir, "daemon.json");
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("文件不存在时读到 null", async () => {
    expect(await readDaemonInfo(file)).toBeNull();
  });

  it("内容不是合法 JSON 时读到 null", async () => {
    await writeFile(file, "不是 json", "utf8");
    expect(await readDaemonInfo(file)).toBeNull();
  });

  it("内容缺字段时读到 null", async () => {
    await writeFile(file, JSON.stringify({ pid: 1234 }), "utf8");
    expect(await readDaemonInfo(file)).toBeNull();
  });

  it("写入之后能原样读回", async () => {
    await writeDaemonInfo(file, sample);
    expect(await readDaemonInfo(file)).toEqual(sample);
  });

  it("写入用临时文件再改名，写完目录里不留临时文件", async () => {
    await writeDaemonInfo(file, sample);
    const entries = await readdir(dir);
    expect(entries).toEqual(["daemon.json"]);
  });

  it("进程号还是自己时会删除文件", async () => {
    await writeDaemonInfo(file, sample);
    await removeDaemonInfoIfOwned(file, sample.pid);
    expect(await readDaemonInfo(file)).toBeNull();
  });

  it("进程号不是自己时保留文件（可能是新实例已经抢先起来）", async () => {
    await writeDaemonInfo(file, sample);
    await removeDaemonInfoIfOwned(file, sample.pid + 1);
    expect(await readDaemonInfo(file)).toEqual(sample);
  });

  it("文件不存在时删除操作静默返回，不报错", async () => {
    await expect(removeDaemonInfoIfOwned(file, sample.pid)).resolves.toBeUndefined();
  });
});
