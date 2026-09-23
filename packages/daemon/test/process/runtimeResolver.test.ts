/**
 * 运行时可执行文件探测（规格第 3.1、4 节）：配置优先、npm 全局目录里两种 bin 写法、
 * 找不到时报中文错误、自动探测结果缓存到 invalidate 为止。
 */

import { join } from "node:path";
import { isFleetError } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeResolver } from "../../src/process/runtimeResolver.js";
import { createTempDir, removeTempDir, writeJsonFile, writeTextFile } from "./support/tempDir.js";
import { baseFleetConfig, withRuntimeCommand } from "./support/testConfig.js";

const configWithoutOverride = baseFleetConfig();

describe("createRuntimeResolver：配置覆盖优先于自动探测", () => {
  it("配置里写死 command 时直接用配置，不做任何探测", async () => {
    const config = withRuntimeCommand(baseFleetConfig(), "pi", ["C:\\fake\\node.exe", "--flag"]);
    const resolver = createRuntimeResolver({
      getConfig: () => config,
      npmGlobalRoot: "C:\\this\\path\\does\\not\\exist\\at\\all", // 就算探测也找不到，证明确实没走探测
    });

    const resolved = await resolver.resolve("pi");
    expect(resolved).toEqual({
      executable: "C:\\fake\\node.exe",
      prefixArgs: ["--flag"],
      image: "node.exe",
    });
  });
});

describe("createRuntimeResolver：npm 全局目录自动探测", () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    if (tempRoot !== null) {
      await removeTempDir(tempRoot);
      tempRoot = null;
    }
  });

  it("pi：package.json 的 bin 是对象写法（真实 pi 就是这种写法）", async () => {
    tempRoot = await createTempDir("fleet-npmroot-pi-object-");
    const entryPath = join(
      tempRoot,
      "@earendil-works",
      "pi-coding-agent",
      "dist",
      "bundle",
      "cli.js",
    );
    await writeTextFile(entryPath, "// fake pi entry\n");
    await writeJsonFile(join(tempRoot, "@earendil-works", "pi-coding-agent", "package.json"), {
      name: "@earendil-works/pi-coding-agent",
      version: "0.87.0",
      bin: { pi: "dist/bundle/cli.js" },
    });

    const resolver = createRuntimeResolver({
      getConfig: () => configWithoutOverride,
      npmGlobalRoot: tempRoot,
    });
    const resolved = await resolver.resolve("pi");

    expect(resolved.executable).toBe(process.execPath);
    expect(resolved.prefixArgs).toEqual([entryPath]);
    expect(resolved.image).toBe(process.platform === "win32" ? "node.exe" : "node");
  });

  it("opencode：package.json 的 bin 是字符串写法", async () => {
    tempRoot = await createTempDir("fleet-npmroot-opencode-string-");
    const entryPath = join(tempRoot, "opencode-ai", "bin", "opencode.exe");
    await writeTextFile(entryPath, "");
    await writeJsonFile(join(tempRoot, "opencode-ai", "package.json"), {
      name: "opencode-ai",
      version: "1.18.4",
      bin: "bin/opencode.exe",
    });

    const resolver = createRuntimeResolver({
      getConfig: () => configWithoutOverride,
      npmGlobalRoot: tempRoot,
    });
    const resolved = await resolver.resolve("opencode");

    expect(resolved.executable).toBe(entryPath);
    expect(resolved.prefixArgs).toEqual([]);
    expect(resolved.image).toBe("opencode.exe");
  });

  it("opencode：package.json 的 bin 是对象写法", async () => {
    tempRoot = await createTempDir("fleet-npmroot-opencode-object-");
    const entryPath = join(tempRoot, "opencode-ai", "bin", "opencode.exe");
    await writeTextFile(entryPath, "");
    await writeJsonFile(join(tempRoot, "opencode-ai", "package.json"), {
      bin: { opencode: "bin/opencode.exe" },
    });

    const resolver = createRuntimeResolver({
      getConfig: () => configWithoutOverride,
      npmGlobalRoot: tempRoot,
    });
    const resolved = await resolver.resolve("opencode");

    expect(resolved.executable).toBe(entryPath);
  });

  it("找不到入口脚本时抛 FleetError('runtime_unavailable')，带中文说明", async () => {
    tempRoot = await createTempDir("fleet-npmroot-empty-");
    const resolver = createRuntimeResolver({
      getConfig: () => configWithoutOverride,
      npmGlobalRoot: tempRoot,
    });

    let caught: unknown;
    try {
      await resolver.resolve("pi");
    } catch (error) {
      caught = error;
    }
    expect(isFleetError(caught)).toBe(true);
    if (isFleetError(caught)) {
      expect(caught.code).toBe("runtime_unavailable");
      expect(caught.message).toContain("找不到 pi");
    }
  });

  it("package.json 存在但 bin 字段认不出来时也报找不到", async () => {
    tempRoot = await createTempDir("fleet-npmroot-badbin-");
    await writeJsonFile(join(tempRoot, "opencode-ai", "package.json"), {
      bin: { wrongName: "bin/opencode.exe" },
    });
    const resolver = createRuntimeResolver({
      getConfig: () => configWithoutOverride,
      npmGlobalRoot: tempRoot,
    });

    await expect(resolver.resolve("opencode")).rejects.toThrow(/找不到 opencode/);
  });

  it("自动探测的结果会缓存到 invalidate() 为止", async () => {
    tempRoot = await createTempDir("fleet-npmroot-cache-");
    const entryPath = join(tempRoot, "opencode-ai", "bin", "opencode.exe");
    await writeTextFile(entryPath, "");
    await writeJsonFile(join(tempRoot, "opencode-ai", "package.json"), {
      bin: { opencode: "bin/opencode.exe" },
    });

    const resolver = createRuntimeResolver({
      getConfig: () => configWithoutOverride,
      npmGlobalRoot: tempRoot,
    });

    const first = await resolver.resolve("opencode");
    expect(first.executable).toBe(entryPath);

    // 把固件整个删掉：如果第二次 resolve 还能成功，说明确实是命中缓存、没有重新探测文件系统。
    await removeTempDir(tempRoot);

    const second = await resolver.resolve("opencode");
    expect(second).toEqual(first);

    resolver.invalidate();
    await expect(resolver.resolve("opencode")).rejects.toMatchObject({
      code: "runtime_unavailable",
    });

    tempRoot = null; // 已经删过了
  });
});

// 本机全局装了真实的 pi 和 opencode（docs/调研 两份运行时报告的调研对象），这里顺带做一次
// 端到端冒烟：不注入 npmGlobalRoot，走真正的探测路径。
describe.runIf(process.platform === "win32")("createRuntimeResolver：真实机器冒烟", () => {
  it("能在本机真实探测到 pi 和 opencode 的入口", async () => {
    const resolver = createRuntimeResolver({ getConfig: () => configWithoutOverride });

    const pi = await resolver.resolve("pi");
    expect(pi.executable.toLowerCase().endsWith("node.exe")).toBe(true);
    expect(pi.image).toBe("node.exe");
    expect(pi.prefixArgs).toHaveLength(1);
    expect(pi.prefixArgs[0]).toMatch(/cli\.js$/);

    const opencode = await resolver.resolve("opencode");
    expect(opencode.image).toContain("opencode");
  });
});
