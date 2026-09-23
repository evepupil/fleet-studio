import type { ParsedReport, ReportSection, Verdict } from "../domain/report.js";

/**
 * 段头规则：大写字母开头，后面接大写字母或下划线，1~31 个字符，冒号收尾。
 * 允许前面带 Markdown 装饰（标题号、列表短横线、粗体星号），
 * 粗体星号也可能包在"键 + 冒号"外层、紧跟在冒号后面收尾（例如 `**SUMMARY:**`），
 * 所以键前后、冒号后都各留一个可选的 `**`。
 */
const SECTION_HEADER_PATTERN =
  /^\s*(?:#{1,6}\s+|-\s+)?\*{0,2}([A-Z][A-Z_]{1,31})\*{0,2}:\*{0,2}\s?(.*)$/;

interface SectionHeader {
  key: string;
  rest: string;
}

/** 这一行是否开启新段；不是的话交给调用方追加到当前段。 */
function matchSectionHeader(line: string): SectionHeader | null {
  const match = SECTION_HEADER_PATTERN.exec(line);
  const key = match?.[1];
  const rest = match?.[2];
  if (key === undefined || rest === undefined) {
    return null;
  }
  return { key, rest };
}

/**
 * 取文字最前面的一段英文字母，忽略大小写判断 pass / fail。
 * 用"取字母直到非字母字符"而不是按空白分词，是因为像"pass（附说明）"这种
 * 结论词后面直接贴汉字标点、中间没有空格的写法也要认得出来。
 */
function firstWordVerdict(text: string): Verdict | null {
  const word = /^[A-Za-z]+/.exec(text.trim())?.[0]?.toLowerCase();
  if (word === "pass") {
    return "pass";
  }
  if (word === "fail") {
    return "fail";
  }
  return null;
}

/** 优先看 VERDICT 段，没有再看 SELF_REPORT 段；都没有就是 null。 */
function extractVerdict(sections: readonly ReportSection[]): Verdict | null {
  const section =
    sections.find((item) => item.key === "VERDICT") ??
    sections.find((item) => item.key === "SELF_REPORT");
  return section ? firstWordVerdict(section.text) : null;
}

/**
 * 解析苦工收尾时按约定输出的固定格式回报。
 * 按行扫描：行首匹配段头规则的开启新段，其余行追加到当前段的文字里；
 * 第一个段头出现之前的文字直接丢弃。一个段都没认出来时返回 null。
 */
export function parseReport(text: string): ParsedReport | null {
  const lines = text.split(/\r\n|\r|\n/);
  const sections: { key: string; lines: string[] }[] = [];
  let current: { key: string; lines: string[] } | null = null;

  for (const line of lines) {
    const header = matchSectionHeader(line);
    if (header) {
      current = { key: header.key, lines: [header.rest] };
      sections.push(current);
    } else if (current !== null) {
      current.lines.push(line);
    }
  }

  if (sections.length === 0) {
    return null;
  }

  // 每段文字去掉首尾空白，保留内部换行：先按行 join，再整体 trim。
  const finalSections: ReportSection[] = sections.map((section) => ({
    key: section.key,
    text: section.lines.join("\n").trim(),
  }));

  return { sections: finalSections, verdict: extractVerdict(finalSections) };
}
