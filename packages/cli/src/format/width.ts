/**
 * 命令行表格按「显示宽度」对齐，而不是字符数：中文、全角符号占 2 个位置，
 * 否则中英文混排的表格列会看起来歪斜。覆盖常见的东亚宽字符区间，够终端对齐用。
 */
function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function widthOf(char: string): number {
  const codePoint = char.codePointAt(0);
  return codePoint !== undefined && isWideCodePoint(codePoint) ? 2 : 1;
}

/** 字符串的显示宽度；用 for...of 按码点遍历，正确处理代理对（emoji、生僻字）。 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += widthOf(char);
  }
  return width;
}

/** 补空格到目标显示宽度；已经达到或超过就原样返回。 */
export function padDisplay(text: string, targetWidth: number): string {
  const width = displayWidth(text);
  return width >= targetWidth ? text : text + " ".repeat(targetWidth - width);
}

const ELLIPSIS = "…";

/** 超过目标显示宽度就截断并加省略号；省略号本身的宽度也算在预算内。 */
export function truncateDisplay(text: string, maxWidth: number): string {
  if (displayWidth(text) <= maxWidth) {
    return text;
  }
  const budget = maxWidth - displayWidth(ELLIPSIS);
  let result = "";
  let width = 0;
  for (const char of text) {
    const charWidth = widthOf(char);
    if (width + charWidth > budget) {
      break;
    }
    result += char;
    width += charWidth;
  }
  return result + ELLIPSIS;
}
