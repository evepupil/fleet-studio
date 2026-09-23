import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { Context } from "hono";

const NOT_BUILT_MESSAGE = "看板还没有构建，请在 fleet-studio 目录运行 pnpm build";

/** 按扩展名给 Content-Type；看板产物用得到的类型列全，其余一律当二进制流处理。 */
const MIME_TYPES: ReadonlyMap<string, string> = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".txt", "text/plain; charset=utf-8"],
]);

function contentTypeFor(path: string): string {
  return MIME_TYPES.get(extname(path).toLowerCase()) ?? "application/octet-stream";
}

/** 不存在、不是普通文件、权限错误等意外情况一律当作“找不到”，交给上层决定怎么回退。 */
async function readFileIfExists(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return null;
    }
    return await readFile(path);
  } catch {
    return null;
  }
}

function decodePathname(rawPathname: string): string | null {
  try {
    return decodeURIComponent(rawPathname);
  } catch {
    return null;
  }
}

function indexResponseHeaders(): Record<string, string> {
  // index.html 是单页应用的入口，内容会随发布变化，禁止缓存。
  return { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
}

/**
 * 按 webDistDir 计算请求路径对应的真实文件路径；越界（路径里出现 `..`，或者解析后跑出
 * 目录之外，例如 Windows 上带盘符的绝对路径会让 path.resolve 直接无视 root）一律返回 null。
 *
 * 单独抽成纯函数方便直接单测：无论是 fetch() 还是 node:http 发出的请求，字面量或百分号编码
 * 的 `..` 段都会在构造 WHATWG URL / Request 的过程中被当作路径归一化的一部分自动吃掉，
 * HTTP 集成测试根本送不到一个真的带 `..` 的路径给这个函数所在的调用点，只能直接调用它来测。
 */
export function resolveStaticTarget(root: string, pathname: string): string | null {
  if (pathname.split("/").includes("..")) {
    return null;
  }
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const target = resolve(root, relative);
  const withinRoot = target === root || target.startsWith(root + sep);
  return withinRoot ? target : null;
}

/**
 * 看板静态文件托管：命中就按扩展名返回；没命中回退单页应用的 index.html；
 * 路径越界一律 404；没有构建产物时提示怎么构建。
 */
export function createStaticHandler(webDistDir: string): (c: Context) => Promise<Response> {
  const root = resolve(webDistDir);
  const indexPath = resolve(root, "index.html");
  const assetsPrefix = resolve(root, "assets") + sep;

  return async (c) => {
    const pathname = decodePathname(new URL(c.req.url).pathname);
    if (pathname === null) {
      return c.body(null, 404);
    }

    const target = resolveStaticTarget(root, pathname);
    if (target === null) {
      return c.body(null, 404);
    }

    const fileBuffer = await readFileIfExists(target);
    if (fileBuffer !== null) {
      if (target === indexPath) {
        return c.body(new Uint8Array(fileBuffer), 200, indexResponseHeaders());
      }
      const headers: Record<string, string> = { "Content-Type": contentTypeFor(target) };
      if (target.startsWith(assetsPrefix)) {
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
      }
      return c.body(new Uint8Array(fileBuffer), 200, headers);
    }

    const indexBuffer = await readFileIfExists(indexPath);
    if (indexBuffer !== null) {
      return c.body(new Uint8Array(indexBuffer), 200, indexResponseHeaders());
    }

    return c.text(NOT_BUILT_MESSAGE, 200);
  };
}
