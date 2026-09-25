import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_PATHS } from "@fleet/core";
import { expect, it } from "vitest";
import { startDaemon } from "../../src/app/startDaemon.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));

it("看板实时连接仍开着时，停止服务也能完成资源清理", async () => {
  const dir = await createTempDir("fleet-shutdown-streams-");
  const handle = await startDaemon({
    home: dir,
    port: 0,
    repoRoot: REPO_ROOT,
    version: "0.0.0-test",
  });
  const controller = new AbortController();
  let stopPromise: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await fetch(`http://127.0.0.1:${handle.port}${API_PATHS.stream}`, {
      signal: controller.signal,
    });
    expect(response.ok).toBe(true);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("实时连接没有响应体");
    expect((await reader.read()).done).toBe(false);

    stopPromise = handle.stop();
    const stopped = await Promise.race([
      stopPromise.then(() => true),
      new Promise<boolean>((resolveTimeout) => {
        timer = setTimeout(() => resolveTimeout(false), 1500);
      }),
    ]);
    expect(stopped, "关停不能一直等待浏览器主动断开实时连接").toBe(true);
    await expect(readFile(resolve(dir, "daemon.json"), "utf8")).rejects.toThrow();
    await expect(
      fetch(`http://127.0.0.1:${handle.port}${API_PATHS.health}`, {
        signal: AbortSignal.timeout(500),
      }),
    ).rejects.toThrow();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    await (stopPromise ?? handle.stop());
    await removeTempDir(dir);
  }
});
