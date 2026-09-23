import { FleetError } from "../domain/errors.js";

/**
 * 项目路径的归一化与派生信息。浏览器安全：只做字符串操作，不碰任何文件系统 API。
 */

export type PathPlatform = "win32" | "posix";

/** 不是绝对路径时统一抛这个错误。 */
function assertAbsolute(condition: boolean, rawInput: string): void {
  if (!condition) {
    throw new FleetError("invalid_request", `项目目录必须是绝对路径：${rawInput}`);
  }
}

/**
 * 按段处理 . 和 ..：. 直接丢弃，.. 弹出上一段；rootDepth 之内的段（盘符，或 UNC 的
 * \\server\share）永远保留，.. 到了根部就是空操作，不会越过它。
 */
function resolveDotSegments(segments: readonly string[], rootDepth: number): string[] {
  const result = segments.slice(0, rootDepth);
  for (const segment of segments.slice(rootDepth)) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (result.length > rootDepth) {
        result.pop();
      }
      continue;
    }
    result.push(segment);
  }
  return result;
}

// ---------- win32 ----------

/** Git Bash 写法：/ + 单个字母 + （/ 或结尾），转成 大写字母:\ + 剩余部分。 */
function convertGitBashDrive(path: string): string {
  const match = /^\/([A-Za-z])(\/.*)?$/.exec(path);
  if (!match) {
    return path;
  }
  const drive = match[1];
  if (drive === undefined) {
    return path;
  }
  const rest = match[2] ?? ""; // 有的话形如 "/code/x"，没有就是空串（裸盘符）
  return `${drive.toUpperCase()}:\\${rest.slice(1)}`;
}

/** 所有 / 换成 \ 之后，合并连续的 \；开头的 UNC 双反斜杠前缀保留成恰好两个。 */
function collapseBackslashes(path: string): string {
  const isUnc = path.startsWith("\\\\");
  const collapsed = path.replace(/\\+/g, "\\");
  return isUnc && !collapsed.startsWith("\\\\") ? `\\${collapsed}` : collapsed;
}

function normalizeWin32(trimmed: string, rawInput: string): string {
  const backslashed = convertGitBashDrive(trimmed).replace(/\//g, "\\");
  const collapsed = collapseBackslashes(backslashed);
  const segments = collapsed.split("\\");
  const first = segments[0] ?? "";
  const isUnc = collapsed.startsWith("\\\\");
  const isDrive = /^[A-Za-z]:$/.test(first);

  assertAbsolute(isUnc || isDrive, rawInput);

  if (isUnc) {
    // segments 形如 ["", "", server, share, ...]；server、share 是 UNC 的根，.. 不能越过它们。
    // share 段可能缺失（"\\server" 或 "\\server\" 这种没有 share 名的写法）：这时
    // segments[3] 要么不存在，要么是 collapseBackslashes 为保留末尾分隔符而留下的空字符串，
    // 不能当成真的 share 名一起保护起来，否则末尾分隔符去不掉（"\\server\" 应该归一化成
    // "\\server"，跟没有尾部分隔符的 "\\server" 一样）。
    const hasShare = segments.length > 4 || (segments.length === 4 && segments[3] !== "");
    const rootDepth = hasShare ? 4 : 3;
    const resolved = resolveDotSegments(segments, rootDepth);
    return `\\\\${resolved.slice(2).join("\\")}`;
  }

  // 盘符根：segments[0] 形如 "C:"，是唯一受保护的根段。
  const resolved = resolveDotSegments(segments, 1);
  const drive = first.toUpperCase();
  const rest = resolved.slice(1);
  return rest.length === 0 ? `${drive}\\` : `${drive}\\${rest.join("\\")}`;
}

// ---------- posix ----------

function normalizePosix(trimmed: string, rawInput: string): string {
  assertAbsolute(trimmed.startsWith("/"), rawInput);

  const collapsed = trimmed.replace(/\/+/g, "/");
  const segments = collapsed.split("/"); // 开头的 "" 代表根，是受保护的段
  const resolved = resolveDotSegments(segments, 1);
  const rest = resolved.slice(1);
  return rest.length === 0 ? "/" : `/${rest.join("/")}`;
}

// ---------- 导出 ----------

/**
 * 归一化项目路径：去掉首尾空白，按平台规则统一分隔符、盘符大小写、`.`/`..`、
 * 末尾分隔符；不是绝对路径（win32 没有盘符也不是 UNC；posix 不以 / 开头）时抛错。
 */
export function normalizeProjectPath(input: string, platform: PathPlatform): string {
  const trimmed = input.trim();
  return platform === "win32" ? normalizeWin32(trimmed, input) : normalizePosix(trimmed, input);
}

/** 项目的主键：win32 不区分大小写，统一转小写；posix 区分大小写，原样返回。 */
export function projectKeyOf(normalizedPath: string, platform: PathPlatform): string {
  return platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

/** 项目目录名：路径最后一段；盘符根返回 "C:"；posix 根返回 "/"。 */
export function projectNameOf(normalizedPath: string): string {
  if (normalizedPath === "/") {
    return "/";
  }
  if (/^[A-Za-z]:\\$/.test(normalizedPath)) {
    // 正则已经锁定整串恰好是 "<字母>:\\" 三个字符，直接取前两个字符即可。
    return normalizedPath.slice(0, 2);
  }
  const lastSlash = normalizedPath.lastIndexOf("/");
  const lastBackslash = normalizedPath.lastIndexOf("\\");
  const cutIndex = Math.max(lastSlash, lastBackslash);
  return cutIndex === -1 ? normalizedPath : normalizedPath.slice(cutIndex + 1);
}
