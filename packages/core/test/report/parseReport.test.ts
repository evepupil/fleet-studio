import { describe, expect, it } from "vitest";
import { parseReport } from "../../src/report/parseReport.js";

describe("parseReport", () => {
  it("解析标准格式的回报，按出现顺序拆出各段", () => {
    const text = [
      "SUMMARY: 一段话说清楚做了什么",
      "FILES:",
      "- a.ts 改了什么",
      "VERIFY: pnpm test，12 个通过",
      "SELF_REPORT: pass",
      "BLOCKED: 无",
    ].join("\n");

    const report = parseReport(text);

    expect(report).not.toBeNull();
    expect(report?.sections).toEqual([
      { key: "SUMMARY", text: "一段话说清楚做了什么" },
      { key: "FILES", text: "- a.ts 改了什么" },
      { key: "VERIFY", text: "pnpm test，12 个通过" },
      { key: "SELF_REPORT", text: "pass" },
      { key: "BLOCKED", text: "无" },
    ]);
    expect(report?.verdict).toBe("pass");
  });

  it("认得出几种常见的 Markdown 装饰写法", () => {
    expect(parseReport("**SUMMARY**: 加粗只包住键名")?.sections).toEqual([
      { key: "SUMMARY", text: "加粗只包住键名" },
    ]);
    expect(parseReport("**SUMMARY:** 加粗连冒号一起包住")?.sections).toEqual([
      { key: "SUMMARY", text: "加粗连冒号一起包住" },
    ]);
    expect(parseReport("## SUMMARY: 标题号装饰")?.sections).toEqual([
      { key: "SUMMARY", text: "标题号装饰" },
    ]);
    expect(parseReport("- SUMMARY: 列表短横线装饰")?.sections).toEqual([
      { key: "SUMMARY", text: "列表短横线装饰" },
    ]);
  });

  it("段内多行文字保留内部换行，首尾空白去掉", () => {
    const text = "SUMMARY: 第一行  \n第二行\n第三行\n";

    const report = parseReport(text);

    expect(report?.sections).toEqual([{ key: "SUMMARY", text: "第一行  \n第二行\n第三行" }]);
  });

  it("第一个段名之前的文字直接丢弃", () => {
    const text = "开场白，模型东拉西扯\n还没到正题\nSUMMARY: 正题在这里";

    const report = parseReport(text);

    expect(report?.sections).toEqual([{ key: "SUMMARY", text: "正题在这里" }]);
  });

  it("一个段都没认出来时返回 null", () => {
    expect(parseReport("完全没有任何段头的一段闲聊文字。")).toBeNull();
    expect(parseReport("")).toBeNull();
  });

  it("VERDICT 段优先于 SELF_REPORT 段", () => {
    const text = "VERDICT: fail\nSELF_REPORT: pass";

    expect(parseReport(text)?.verdict).toBe("fail");
  });

  it("没有 VERDICT 段时退回看 SELF_REPORT 段", () => {
    expect(parseReport("SELF_REPORT: pass")?.verdict).toBe("pass");
  });

  it("两段都没有时 verdict 为 null", () => {
    expect(parseReport("SUMMARY: 没有结论段")?.verdict).toBeNull();
  });

  it.each([
    ["PASS", "pass"],
    ["Fail.", "fail"],
    ["pass（附说明，通道偶尔重试）", "pass"],
    ["FAIL", "fail"],
    ["不确定", null],
  ] as const)("结论文字 %s 解析为 %s", (raw, expected) => {
    expect(parseReport(`SELF_REPORT: ${raw}`)?.verdict).toBe(expected);
  });
});
