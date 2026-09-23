/** 解析器和适配器共用的文字、路径小工具。 */

export interface Truncated {
  text: string;
  truncated: boolean;
}

/** 超过 max 个字符就截断，并在末尾加省略号。 */
export function truncateText(text: string, max: number): Truncated {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  return { text: `${text.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

/** 把多行文字压成一行：连续空白合成一个空格，超长截断。 */
export function oneLine(text: string, max: number): string {
  return truncateText(text.replace(/\s+/g, " ").trim(), max).text;
}

/** 取最后 maxLines 行，总长不超过 maxChars（从尾部保留）。 */
export function tailLines(text: string, maxLines: number, maxChars: number): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const tail = lines.slice(-maxLines).join("\n");
  return tail.length <= maxChars ? tail : `…${tail.slice(tail.length - maxChars + 1)}`;
}

/**
 * 在目录下拼一个文件名。分隔符跟随目录本身的风格（含反斜杠就用反斜杠），
 * 因为核心层不能用 node:path，而目录一定来自调用方所在的平台。
 */
export function joinFilePath(dir: string, fileName: string): string {
  const separator = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.endsWith("\\") || dir.endsWith("/") ? dir.slice(0, -1) : dir;
  return `${trimmed}${separator}${fileName}`;
}

/**
 * 命令行里以 - 或 @ 开头的参数会被运行时当成选项或文件引用。
 * 任务正文恰好这样开头时，在前面补一个换行，模型读起来没有区别。
 */
export function guardLeadingDash(text: string): string {
  return text.startsWith("-") || text.startsWith("@") ? `\n${text}` : text;
}
