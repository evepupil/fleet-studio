import { describe, expect, it } from "vitest";
import { identityOfRun } from "../../src/engine/identity.js";
import { LAUNCH_TIMEOUT_MS } from "../../src/engine/launcher.js";
import { createRunRecord } from "./support/records.js";

describe("identityOfRun：从运行记录拼出核对身份用的信息（模块设计 3.6 末尾）", () => {
  it("spawnedAt 非 null：直接取它的毫秒值", () => {
    const run = createRunRecord({
      processImage: "node.exe",
      spawnedAt: "2026-01-01T00:00:30.000Z",
      startedAt: "2026-01-01T00:00:25.000Z",
    });
    expect(identityOfRun(run)).toEqual({
      image: "node.exe",
      spawnedAtMs: Date.parse("2026-01-01T00:00:30.000Z"),
    });
  });

  it("spawnedAt 为 null 但 startedAt 非 null（升级前就在跑的旧记录）：spawnedAtMs = startedAt + 启动超时", () => {
    const run = createRunRecord({
      processImage: "node.exe",
      spawnedAt: null,
      startedAt: "2026-01-01T00:00:25.000Z",
    });
    expect(identityOfRun(run)).toEqual({
      image: "node.exe",
      spawnedAtMs: Date.parse("2026-01-01T00:00:25.000Z") + LAUNCH_TIMEOUT_MS,
    });
  });

  it("spawnedAt 和 startedAt 都为 null（从没真正启动过）：spawnedAtMs 为 null，只核对映像名", () => {
    const run = createRunRecord({ processImage: "node.exe", spawnedAt: null, startedAt: null });
    expect(identityOfRun(run)).toEqual({ image: "node.exe", spawnedAtMs: null });
  });

  it("processImage 为 null 时 image 也是 null（不核对映像名）", () => {
    const run = createRunRecord({
      processImage: null,
      spawnedAt: "2026-01-01T00:00:30.000Z",
    });
    expect(identityOfRun(run).image).toBeNull();
  });
});
