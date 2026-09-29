#!/usr/bin/env node
/**
 * 门禁脚本：扫描 apps/web/src 下的样式和源码，禁止写死的颜色值及淘汰的 Tailwind 类名。
 * 所有颜色必须来自 apps/web/src/styles/tokens.css 的 CSS 变量，因此这个文件本身跳过检查。
 * 只用 Node 内置模块，不依赖任何第三方包。
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, "apps", "web", "src");
const SKIP_FILE = join(SCAN_DIR, "styles", "tokens.css");
const SCAN_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** 紧跟在候选十六进制色值后面的字符如果属于标识符，则它不是独立色值。 */
const IDENTIFIER_CHAR_PATTERN = /[A-Za-z0-9_-]/;
const VALID_HEX_LENGTHS = new Set([3, 4, 6, 8]);
const HEX_COLOR_PATTERN = /#([0-9a-fA-F]+)/g;
const FUNCTIONAL_COLOR_PATTERN = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/gi;
const PALETTE_CLASS_PATTERN =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|caret|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:bg|text|border|fill|stroke)-(?:white|black)\b/g;
const BRACKET_COLOR_PATTERN = /-\[(?:#|rgb|rgba|hsl|hsla|oklch)/gi;
const DEPRECATED_CLASS_PATTERN =
  /\btext-(?:11|22|28|xs|sm|base|lg|xl|2xl|3xl)\b|\bfont-(?:semibold|bold|extrabold|black)\b|\b(?:bg|text|border)-page\b|\bshadow-none\b/g;

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
    if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

function findHardcodedColors(line) {
  const hits = [];
  for (const hexMatch of line.matchAll(HEX_COLOR_PATTERN)) {
    const hex = hexMatch[1] ?? "";
    if (!VALID_HEX_LENGTHS.has(hex.length)) continue;
    const nextChar = line[hexMatch.index + hexMatch[0].length];
    if (nextChar !== undefined && IDENTIFIER_CHAR_PATTERN.test(nextChar)) continue;
    hits.push(hexMatch[0]);
  }
  for (const fnMatch of line.matchAll(FUNCTIONAL_COLOR_PATTERN)) {
    hits.push(fnMatch[0]);
  }
  return hits;
}

function findMatches(line, pattern) {
  return [...line.matchAll(pattern)].map((match) => match[0]);
}

function main() {
  const files = collectFiles(SCAN_DIR).filter((file) => file !== SKIP_FILE);
  const findings = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    const relPath = relative(ROOT, file).replace(/\\/g, "/");
    const checkUtilityClasses = SOURCE_EXTENSIONS.has(extname(file));

    lines.forEach((line, index) => {
      const hits = findHardcodedColors(line);
      if (checkUtilityClasses) {
        hits.push(
          ...findMatches(line, PALETTE_CLASS_PATTERN),
          ...findMatches(line, BRACKET_COLOR_PATTERN),
          ...findMatches(line, DEPRECATED_CLASS_PATTERN),
        );
      }
      for (const hit of hits) {
        findings.push(`${relPath}:${index + 1}: ${line.trim()} (${hit})`);
      }
    });
  }

  if (findings.length > 0) {
    for (const finding of findings) console.log(finding);
    console.error(`check-tokens: 发现 ${findings.length} 处禁用的颜色或工具类`);
    process.exit(1);
  }

  console.log("check-tokens: 未发现禁用的颜色或工具类");
  process.exit(0);
}

main();
