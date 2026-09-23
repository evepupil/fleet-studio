import { describe, expect, it } from "vitest";
import { renderTable } from "../../src/format/table.js";

describe("renderTable", () => {
  it("按显示宽度对齐，中文算 2 个宽度", () => {
    const lines = renderTable(
      [{ header: "编号" }, { header: "标题" }],
      [
        ["w7k2mq", "写代码"],
        ["a", "改 bug"],
      ],
    );
    // 第一列最宽的是 "w7k2mq"（显示宽度 6）；其余单元格补空格补到这个宽度，
    // 列之间再用两个空格隔开；最后一列永远不补尾部空格。
    expect(lines[0]).toBe(`编号${" ".repeat(2)}${" ".repeat(2)}标题`);
    expect(lines[1]).toBe(`w7k2mq${" ".repeat(2)}写代码`);
    expect(lines[2]).toBe(`a${" ".repeat(5)}${" ".repeat(2)}改 bug`);
  });

  it("超过 maxWidth 的列会截断加省略号", () => {
    const lines = renderTable([{ header: "标题", maxWidth: 5 }], [["一个很长的标题文字"]]);
    expect(lines[1]).toBe("一个…");
  });

  it("最后一列不补尾部空格", () => {
    const lines = renderTable([{ header: "编号" }, { header: "标题" }], [["w1", "短"]]);
    expect(lines[1]?.endsWith(" ")).toBe(false);
  });
});
