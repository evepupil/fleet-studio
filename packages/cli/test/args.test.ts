import { describe, expect, it } from "vitest";
import {
  COMMON_OPTIONS,
  parseCommandArgs,
  parseEnumOption,
  parseNonNegativeInteger,
  parsePositiveInteger,
  parsePositiveMinutes,
} from "../src/args.js";
import { CliUsageError } from "../src/errors.js";

describe("parseCommandArgs", () => {
  it("解析出选项和位置参数", () => {
    const { values, positionals } = parseCommandArgs({
      args: ["--home", "/tmp/x", "--json", "写代码", "修 bug"],
      options: { ...COMMON_OPTIONS },
      allowPositionals: true,
    });
    expect(values.home).toBe("/tmp/x");
    expect(values.json).toBe(true);
    expect(positionals).toEqual(["写代码", "修 bug"]);
  });

  it("未知选项报中文错误，不透出 Node 的英文原话（缺陷 3）", () => {
    expect(() => parseCommandArgs({ args: ["--brief"], options: { ...COMMON_OPTIONS } })).toThrow(
      "不认识的选项：--brief。用 fleet <子命令> --help 查看用法",
    );
  });

  it("选项缺值时报中文错误，带上选项名和查看用法的提示（缺陷 3）", () => {
    expect(() => parseCommandArgs({ args: ["--home"], options: { ...COMMON_OPTIONS } })).toThrow(
      "选项 --home 的取值不对。用 fleet <子命令> --help 查看用法",
    );
  });

  it("布尔选项被塞了取值时也报「取值不对」（缺陷 3）", () => {
    expect(() => parseCommandArgs({ args: ["--json=1"], options: { ...COMMON_OPTIONS } })).toThrow(
      "选项 --json 的取值不对。用 fleet <子命令> --help 查看用法",
    );
  });

  it("不允许位置参数时给出的位置参数会报中文用法错误", () => {
    expect(() =>
      parseCommandArgs({ args: ["多余的参数"], options: { ...COMMON_OPTIONS } }),
    ).toThrow("参数不对。用 fleet <子命令> --help 查看用法");
  });

  it("翻译后的错误信息里不应该出现 Node 的英文原句片段", () => {
    try {
      parseCommandArgs({ args: ["--brief"], options: { ...COMMON_OPTIONS } });
      throw new Error("应该抛出异常");
    } catch (error) {
      expect(error instanceof CliUsageError && error.message.includes("positional argument")).toBe(
        false,
      );
    }
  });
});

describe("parsePositiveMinutes", () => {
  it("未传时返回 undefined", () => {
    expect(parsePositiveMinutes(undefined, "--timeout")).toBeUndefined();
  });

  it("接受正数（包括小数）", () => {
    expect(parsePositiveMinutes("30", "--timeout")).toBe(30);
    expect(parsePositiveMinutes("1.5", "--timeout")).toBe(1.5);
  });

  it("0、负数、非数字都报用法错误", () => {
    expect(() => parsePositiveMinutes("0", "--timeout")).toThrow(CliUsageError);
    expect(() => parsePositiveMinutes("-1", "--timeout")).toThrow(CliUsageError);
    expect(() => parsePositiveMinutes("abc", "--timeout")).toThrow(CliUsageError);
  });
});

describe("parsePositiveInteger / parseNonNegativeInteger", () => {
  it("parsePositiveInteger 拒绝 0 和小数", () => {
    expect(parsePositiveInteger("5", "--tail")).toBe(5);
    expect(() => parsePositiveInteger("0", "--tail")).toThrow(CliUsageError);
    expect(() => parsePositiveInteger("1.5", "--tail")).toThrow(CliUsageError);
  });

  it("parseNonNegativeInteger 接受 0，拒绝负数", () => {
    expect(parseNonNegativeInteger("0", "--capacity")).toBe(0);
    expect(parseNonNegativeInteger("20", "--capacity")).toBe(20);
    expect(() => parseNonNegativeInteger("-1", "--capacity")).toThrow(CliUsageError);
  });
});

describe("parseEnumOption", () => {
  const RUNTIMES = ["pi", "opencode"] as const;

  it("未传时返回 undefined", () => {
    expect(parseEnumOption(undefined, RUNTIMES, "--runtime")).toBeUndefined();
  });

  it("合法值原样返回，非法值报用法错误", () => {
    expect(parseEnumOption("pi", RUNTIMES, "--runtime")).toBe("pi");
    expect(() => parseEnumOption("claude", RUNTIMES, "--runtime")).toThrow(CliUsageError);
  });
});
