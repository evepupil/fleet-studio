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

  it("遇到未知选项时抛出 CliUsageError 而不是原始异常", () => {
    expect(() =>
      parseCommandArgs({ args: ["--not-a-real-option"], options: { ...COMMON_OPTIONS } }),
    ).toThrow(CliUsageError);
  });

  it("不允许位置参数时给出的位置参数会报用法错误", () => {
    expect(() =>
      parseCommandArgs({ args: ["多余的参数"], options: { ...COMMON_OPTIONS } }),
    ).toThrow(CliUsageError);
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
