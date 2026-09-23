#!/usr/bin/env node
/**
 * 门禁脚本：扫描 apps/web/src 下的样式和源码，禁止写死的颜色值。
 * 所有颜色必须来自 apps/web/src/styles/tokens.css 的 CSS 变量，因此这个文件本身跳过检查。
 * 只用 Node 内置模块，不依赖任何第三方包。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, "apps", "web", "src");
const SKIP_FILE = join(SCAN_DIR, "styles", "tokens.css");
const SCAN_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);

/** 紧跟在候选十六进制色值后面、会让它其实是更长标识符（选择器、URL 片段等）的字符。 */
const IDENTIFIER_CHAR_PATTERN = /[A-Za-z0-9_-]/;
/** 合法的十六进制颜色写法：#rgb、#rgba、#rrggbb、#rrggbbaa */
const VALID_HEX_LENGTHS = new Set([3, 4, 6, 8]);
const HEX_COLOR_PATTERN = /#([0-9a-fA-F]+)/g;
/** 函数式颜色写法，前面必须是非标识符字符（或行首），避免匹配到 myRgba( 之类的标识符尾部 */
const FUNCTIONAL_COLOR_PATTERN = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/gi;

/** 递归收集目录下所有目标扩展名的文件（绝对路径）。 */
function collectFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
      continue;
    }
    const dotIndex = entry.name.lastIndexOf(".");
    const ext = dotIndex === -1 ? "" : entry.name.slice(dotIndex);
    if (entry.isFile() && SCAN_EXTENSIONS.has(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 一行文字里命中的写死颜色片段，每处命中单独一条。 */
function findHardcodedColors(line) {
  const hits = [];

  for (const hexMatch of line.matchAll(HEX_COLOR_PATTERN)) {
    const hex = hexMatch[1] ?? "";
    if (!VALID_HEX_LENGTHS.has(hex.length)) {
      continue;
    }
    const nextChar = line[hexMatch.index + hexMatch[0].length];
    if (nextChar !== undefined && IDENTIFIER_CHAR_PATTERN.test(nextChar)) {
      continue;
    }
    hits.push(hexMatch[0]);
  }

  for (const fnMatch of line.matchAll(FUNCTIONAL_COLOR_PATTERN)) {
    hits.push(fnMatch[0]);
  }

  return hits;
}

function main() {
  const files = collectFiles(SCAN_DIR).filter((file) => file !== SKIP_FILE);
  const findings = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    const relPath = relative(ROOT, file).replace(/\\/g, "/");

    lines.forEach((line, index) => {
      const hits = findHardcodedColors(line);
      for (const hit of hits) {
        findings.push(`${relPath}:${index + 1}: ${line.trim()} (${hit})`);
      }
    });
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.log(finding);
    }
    console.error(
      `check-tokens: 发现 ${findings.length} 处写死的颜色值，请改用 tokens.css 里的变量`,
    );
    process.exit(1);
  }

  console.log("check-tokens: 未发现写死的颜色值");
  process.exit(0);
}

main();
