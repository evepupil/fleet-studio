// 假服务脚本：只给 ensureDaemon 的自动拉起测试用，不是真的闸门服务。
// 用法：node fake-daemon.mjs --home <目录>
// 起一个只回应 /api/health 的桩 HTTP 服务，再按 --home 写出 daemon.json，
// 让命令行那一侧的 ensureDaemon 轮询探活时能读到、探得到。
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

function readHomeArg(argv) {
  const index = argv.indexOf("--home");
  if (index === -1 || argv[index + 1] === undefined) {
    throw new Error("缺少 --home 参数");
  }
  return argv[index + 1];
}

const home = readHomeArg(process.argv.slice(2));
const version = "test-fake-daemon";
const startedAt = new Date().toISOString();

const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        version,
        startedAt,
        pid: process.pid,
        home,
        port: server.address().port,
      }),
    );
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code: "not_found", message: "假服务只认 /api/health" } }));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const daemonInfo = {
    pid: process.pid,
    port,
    token: "fake-daemon-token",
    startedAt,
    version,
    home,
  };
  writeFileSync(join(home, "daemon.json"), JSON.stringify(daemonInfo), "utf8");
  // 记下真正拉起时子进程的工作目录：spawn 不传 cwd 时会继承调用方的工作目录（缺陷 10 的
  // 复现方式），测试拿这个文件的内容和 --home 参数比对，就知道 cwd 有没有被钉死成数据目录。
  writeFileSync(join(home, "spawn-cwd.txt"), process.cwd(), "utf8");
});
