import { describe, expect, it } from "vitest";
import {
  createWorkerId,
  isWorkerId,
  parseRunId,
  piSessionIdOf,
  runIdOf,
  WORKER_ID_ALPHABET,
} from "../../src/domain/ids.js";

describe("createWorkerId", () => {
  it("格式固定为 w + 5 个字母表字符", () => {
    const id = createWorkerId();
    expect(id).toMatch(/^w.{5}$/);
    expect(isWorkerId(id)).toBe(true);
  });

  it("只使用字母表里的字符，不出现容易看错的 i、l、o、0、1", () => {
    expect(WORKER_ID_ALPHABET).not.toMatch(/[ilo01]/);
    for (let i = 0; i < 200; i++) {
      const suffix = createWorkerId().slice(1);
      for (const ch of suffix) {
        expect(WORKER_ID_ALPHABET.includes(ch)).toBe(true);
      }
    }
  });

  it("注入固定随机源时结果确定，且等于按公式手算的字符", () => {
    const values = [0, 0.1, 0.2, 0.3, 0.4];
    let call = 0;
    const fixedRandom = () => {
      const value = values[call] ?? 0;
      call++;
      return value;
    };
    const expected = `w${values
      .map((value) => WORKER_ID_ALPHABET.charAt(Math.floor(value * WORKER_ID_ALPHABET.length)))
      .join("")}`;
    expect(createWorkerId(fixedRandom)).toBe(expected);
  });
});

describe("isWorkerId", () => {
  it("接受合法格式", () => {
    expect(isWorkerId("w7k2mq")).toBe(true);
  });

  it.each([
    ["少一位", "w7k2m"],
    ["多一位", "w7k2mqx"],
    ["前缀不是 w", "x7k2mq"],
    ["包含字母表以外的字符 1", "w7k2m1"],
    ["包含字母表以外的字符（大写）", "w7k2mI"],
    ["空字符串", ""],
  ])("拒绝不合法格式：%s（%s）", (_label, input) => {
    expect(isWorkerId(input)).toBe(false);
  });
});

describe("runIdOf / parseRunId", () => {
  it("互为逆运算", () => {
    const runId = runIdOf("w7k2mq", 3);
    expect(runId).toBe("w7k2mq.3");
    expect(parseRunId(runId)).toEqual({ workerId: "w7k2mq", seq: 3 });
  });

  it.each([
    ["没有点号", "w7k2mq"],
    ["序号是 0", "w7k2mq.0"],
    ["序号是负数", "w7k2mq.-1"],
    ["序号是小数（多一个点号）", "w7k2mq.1.5"],
    ["序号不是数字", "w7k2mq.abc"],
    ["序号带前导加号", "w7k2mq.+1"],
    ["苦工编号为空", ".3"],
  ])("非法输入返回 null：%s（%s）", (_label, input) => {
    expect(parseRunId(input)).toBeNull();
  });
});

describe("piSessionIdOf", () => {
  it("拼成 fleet-<苦工编号>", () => {
    expect(piSessionIdOf("w7k2mq")).toBe("fleet-w7k2mq");
  });
});
