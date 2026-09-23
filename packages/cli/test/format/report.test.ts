import type { ParsedReport } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { formatFinalText, formatReportSections } from "../../src/format/report.js";

describe("formatReportSections", () => {
  it("按段落排版，每段带中括号段名，段间空一行", () => {
    const report: ParsedReport = {
      sections: [
        { key: "SUMMARY", text: "实现了 XYZ" },
        { key: "SELF_REPORT", text: "pass" },
      ],
      verdict: "pass",
    };
    expect(formatReportSections(report)).toBe("【SUMMARY】\n实现了 XYZ\n\n【SELF_REPORT】\npass");
  });

  it("report 为 null 时给出占位文字", () => {
    expect(formatReportSections(null)).toBe("（暂无回报）");
  });

  it("sections 为空数组时也给出占位文字", () => {
    expect(formatReportSections({ sections: [], verdict: null })).toBe("（暂无回报）");
  });
});

describe("formatFinalText", () => {
  it("原样返回回报原文", () => {
    expect(formatFinalText("SUMMARY: 完成了\nFILES: a.ts")).toBe("SUMMARY: 完成了\nFILES: a.ts");
  });

  it("null 或空字符串时给出占位文字", () => {
    expect(formatFinalText(null)).toBe("（暂无回报）");
    expect(formatFinalText("")).toBe("（暂无回报）");
  });
});
