import { describe, expect, it } from "vitest";
import { displayWidth, padDisplay, truncateDisplay } from "../../src/format/width.js";

describe("displayWidth", () => {
  it("英文字符按 1 计算", () => {
    expect(displayWidth("abc")).toBe(3);
  });

  it("中文字符按 2 计算", () => {
    expect(displayWidth("你好")).toBe(4);
  });

  it("中英文混排按各自宽度累加", () => {
    expect(displayWidth("ab你好cd")).toBe(2 + 4 + 2);
  });
});

describe("padDisplay", () => {
  it("按显示宽度补空格，中文字符少补一个空格", () => {
    expect(padDisplay("ab", 6)).toBe("ab    ");
    expect(padDisplay("你好", 6)).toBe("你好  ");
  });

  it("已经达到或超过目标宽度时原样返回", () => {
    expect(padDisplay("你好", 4)).toBe("你好");
    expect(padDisplay("你好呀呢", 4)).toBe("你好呀呢");
  });
});

describe("truncateDisplay", () => {
  it("超过宽度时截断并加省略号", () => {
    expect(truncateDisplay("你好世界", 5)).toBe("你好…");
  });

  it("没超过宽度时原样返回", () => {
    expect(truncateDisplay("你好", 10)).toBe("你好");
  });
});
