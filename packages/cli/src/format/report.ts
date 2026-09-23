import type { ParsedReport } from "@fleet/core";

const EMPTY_REPORT_TEXT = "（暂无回报）";

/** fleet show 的回报按段落排版：每段用中括号标出段名，段之间空一行。 */
export function formatReportSections(report: ParsedReport | null): string {
  if (report === null || report.sections.length === 0) {
    return EMPTY_REPORT_TEXT;
  }
  return report.sections.map((section) => `【${section.key}】\n${section.text}`).join("\n\n");
}

/** fleet wait 输出的是回报原文（最后一条模型文字），不做分段，只在缺失时给个占位。 */
export function formatFinalText(finalText: string | null): string {
  return finalText !== null && finalText.length > 0 ? finalText : EMPTY_REPORT_TEXT;
}
