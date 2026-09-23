/**
 * 环境变量相关的纯函数测试，外加一个真实读注册表的冒烟测试。
 * 规格见 docs/模块设计/服务层-进程托管.md 第 3.2、4 节：readRegistryEnvironment 只断言
 * 返回对象、常见变量名存在，不打印任何变量的值。
 */

import { describe, expect, it } from "vitest";
import {
  expandEnvReferences,
  mergeWorkerEnv,
  parseRegQueryOutput,
  readRegistryEnvironment,
  snapshotProcessEnv,
} from "../../src/process/userEnv.js";
import { createFakeLogger } from "./support/fakeLogger.js";

describe("parseRegQueryOutput", () => {
  it("解析 REG_SZ 和 REG_EXPAND_SZ 行，跳过标题行和空行", () => {
    const output = [
      "HKEY_CURRENT_USER\\Environment",
      "",
      "    OneDrive    REG_SZ    C:\\Users\\demo\\OneDrive",
      "    TEMP    REG_EXPAND_SZ    %USERPROFILE%\\AppData\\Local\\Temp",
      "",
    ].join("\r\n");

    const entries = parseRegQueryOutput(output);
    expect(entries).toEqual([
      { name: "OneDrive", type: "REG_SZ", value: "C:\\Users\\demo\\OneDrive" },
      { name: "TEMP", type: "REG_EXPAND_SZ", value: "%USERPROFILE%\\AppData\\Local\\Temp" },
    ]);
  });

  it("值里带空格时完整保留", () => {
    const output = "    MYVAR    REG_SZ    C:\\Program Files\\Some App\\bin";
    expect(parseRegQueryOutput(output)).toEqual([
      { name: "MYVAR", type: "REG_SZ", value: "C:\\Program Files\\Some App\\bin" },
    ]);
  });

  it("空值：类型后面还有四个空格但内容为空", () => {
    const output = "    EMPTYVAR    REG_SZ    ";
    expect(parseRegQueryOutput(output)).toEqual([{ name: "EMPTYVAR", type: "REG_SZ", value: "" }]);
  });

  it("空值：类型后面直接是行尾，没有多余分隔符", () => {
    const output = "    EMPTYVAR    REG_SZ";
    expect(parseRegQueryOutput(output)).toEqual([{ name: "EMPTYVAR", type: "REG_SZ", value: "" }]);
  });

  it("认不出的行（不是四空格缩进）直接跳过", () => {
    const output = ["HKEY_CURRENT_USER\\Environment", "ERROR: 找不到指定的注册表项。"].join("\r\n");
    expect(parseRegQueryOutput(output)).toEqual([]);
  });
});

describe("expandEnvReferences", () => {
  it("展开存在的变量", () => {
    const result = expandEnvReferences("%USERPROFILE%\\AppData", {
      USERPROFILE: "C:\\Users\\demo",
    });
    expect(result).toBe("C:\\Users\\demo\\AppData");
  });

  it("不存在的变量原样保留", () => {
    const result = expandEnvReferences("%NOT_DEFINED%\\x", { USERPROFILE: "C:\\Users\\demo" });
    expect(result).toBe("%NOT_DEFINED%\\x");
  });

  it("一个字符串里出现多次引用，各自独立展开", () => {
    const result = expandEnvReferences("%A%-%B%-%A%", { A: "1", B: "2" });
    expect(result).toBe("1-2-1");
  });

  it("变量名比较不区分大小写", () => {
    const result = expandEnvReferences("%path%", { Path: "C:\\bin" });
    expect(result).toBe("C:\\bin");
  });
});

describe("mergeWorkerEnv", () => {
  it("注册表里有、当前环境没有的变量补进去", () => {
    const result = mergeWorkerEnv({ FOO: "1" }, { BAR: "2" });
    expect(result).toEqual({ FOO: "1", BAR: "2" });
  });

  it("当前环境已有同名变量（忽略大小写）时不覆盖", () => {
    const result = mergeWorkerEnv({ Foo: "current" }, { FOO: "from-registry" });
    expect(result).toEqual({ Foo: "current" });
  });

  it("Path / PATH 永远不从注册表补，即使当前环境没有", () => {
    const result = mergeWorkerEnv({ FOO: "1" }, { Path: "C:\\a", PATH: "C:\\b" });
    expect(result).toEqual({ FOO: "1" });
  });
});

describe("snapshotProcessEnv", () => {
  it("只包含已定义的字符串值（用测试自建的变量验证，不读取任何已存在的真实变量）", () => {
    const marker = "FLEET_STUDIO_TEST_MARKER";
    process.env[marker] = "sample-value";
    try {
      const snapshot = snapshotProcessEnv();
      expect(snapshot[marker]).toBe("sample-value");
      expect(Object.values(snapshot).every((value) => typeof value === "string")).toBe(true);
    } finally {
      delete process.env[marker];
    }
  });
});

// readRegistryEnvironment 会真的执行 reg query，只在 Windows 上跑；按规格只断言形状和
// 常见变量名存在，绝不读取或打印任何变量的实际值。
describe.runIf(process.platform === "win32")("readRegistryEnvironment（真实注册表）", () => {
  it("返回对象，且包含系统级常见变量名之一", async () => {
    const logger = createFakeLogger();
    const result = await readRegistryEnvironment(logger);

    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();

    // windir / TEMP / NUMBER_OF_PROCESSORS 是 HKLM 的 Session Manager Environment 里
    // 恒定存在的系统变量，本机实测过（开发过程记录）；这里只判断“键存在”，不读值。
    const namesLower = new Set(Object.keys(result).map((name) => name.toLowerCase()));
    const hasCommonName = ["windir", "temp", "number_of_processors", "os"].some((name) =>
      namesLower.has(name),
    );
    expect(hasCommonName).toBe(true);
    // 正常读取不应该触发失败日志（失败路径本身依赖 reg.exe 真的读不到注册表项，
    // 这台机器上没有能安全、确定性地制造这种失败的办法，因此只覆盖正常路径）。
    expect(logger.records).toEqual([]);
  });
});
