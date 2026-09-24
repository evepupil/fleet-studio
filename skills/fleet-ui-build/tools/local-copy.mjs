// 验收工具：把静态导出改成一份能用 file:// 直接打开、页面之间能互相点通的副本。不起任何服务器。
// 用法：node .fleet/local-copy.mjs
// 项目根取 PROJECT_ROOT 或当前工作目录；导出目录取 EXPORT_DIR，默认 out。
//
// 为什么需要它：静态导出的 HTML 里资源和站内链接都是绝对路径（/_next/…、/course/），
// 用 file:// 打开时都指向磁盘根目录，页面会裸奔、链接点不通。
// 它遍历导出目录里的每一个 index.html，在旁边写一份 index-local.html：
//   1. 资源：/_next/…、/img/… 按页面深度改成 ./_next/… 或 ../_next/…
//   2. 站内链接：href="/course/"、href="/register/#form" 改成指向对应页的 index-local.html（保留锚点和查询串）
// 这份副本是截图、状态截图、交互检查三个工具的输入，也方便用户自己双击打开逐页点看。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const ROOT = process.env.PROJECT_ROOT ?? process.cwd();
const OUT = join(ROOT, process.env.EXPORT_DIR ?? "out");
if (!existsSync(join(OUT, "index.html"))) {
  console.error(`${join(OUT, "index.html")} 不存在，先跑构建`);
  process.exit(1);
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "_next") continue;
      files.push(...walk(p));
    } else if (name === "index.html") files.push(p);
  }
  return files;
}

// 路由（如 "/course/"）→ 文件路径
const routes = new Map();
for (const file of walk(OUT)) {
  const relDir = relative(OUT, dirname(file)).split(sep).join("/");
  routes.set(relDir ? `/${relDir}/` : "/", file);
}

for (const [route, file] of routes) {
  const depth = route.split("/").filter(Boolean).length;
  const up = depth === 0 ? "./" : "../".repeat(depth);
  let html = readFileSync(file, "utf8");
  let assetHits = 0;
  let linkHits = 0;

  html = html.replace(/(["'(])\/(_next|img|images|assets|static|fonts)\//g, (_m, q, dir) => {
    assetHits++;
    return `${q}${up}${dir}/`;
  });

  html = html.replace(/href="\/([^"#?]*)([#?][^"]*)?"/g, (m, path, suffix = "") => {
    const key = `/${path}`.endsWith("/") ? `/${path}` : `/${path}/`;
    if (!routes.has(key)) return m;
    linkHits++;
    const target = key === "/" ? "index-local.html" : `${key.slice(1)}index-local.html`;
    return `href="${up}${target}${suffix}"`;
  });

  const local = join(dirname(file), "index-local.html");
  writeFileSync(local, html);
  console.log(
    `${route.padEnd(14)} 资源 ${String(assetHits).padStart(3)} 处，站内链接 ${String(linkHits).padStart(3)} 处 → ${relative(ROOT, local)}`,
  );
}
console.log(
  `共 ${routes.size} 页。双击 ${relative(ROOT, join(OUT, "index-local.html"))} 就能在浏览器里逐页点看，不用起服务器。`,
);
