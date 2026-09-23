import { createFakeDeps, type FakeDeps, type FakeDepsOptions } from "./deps.js";
import { type StubHandler, type StubServer, startStubServer } from "./stubServer.js";
import { createTempHome, type TempHome } from "./tempHome.js";

export interface CommandHarness {
  readonly deps: FakeDeps;
  readonly stub: StubServer;
  readonly home: TempHome;
  readonly token: string;
  cleanup(): Promise<void>;
}

/** 本机令牌固定成这个值，方便测试直接断言请求头里的令牌对不对。 */
export const HARNESS_TOKEN = "test-fleet-token";

/**
 * 每个命令测试都要的一套东西：一个记请求的桩服务 + 一个写好 daemon.json 指向它的临时数据目录
 * + 一份假的运行环境（env 里带 FLEET_HOME，指向这个临时目录，命令不用每次都传 --home）。
 *
 * ensureDaemon 在真正发起业务请求之前，一定会先探一次 /api/health（判断要不要复用现有服务）；
 * 这里统一兜底应答，各个命令测试的 handler 就不用每次都记得处理这一条，只关心自己关心的接口。
 */
export async function createCommandHarness(
  handler: StubHandler,
  depsOptions: FakeDepsOptions = {},
): Promise<CommandHarness> {
  const withHealthCheck: StubHandler = (request) => {
    if (request.path === "/api/health") {
      return { status: 200, body: { ok: true } };
    }
    return handler(request);
  };

  const home = await createTempHome();
  const stub = await startStubServer(withHealthCheck);
  const port = Number(new URL(stub.baseUrl).port);

  await home.writeDaemonJson({
    pid: process.pid,
    port,
    token: HARNESS_TOKEN,
    startedAt: new Date().toISOString(),
    version: "0.0.0-test",
    home: home.path,
  });

  const deps = createFakeDeps({
    ...depsOptions,
    env: { ...depsOptions.env, FLEET_HOME: home.path },
  });

  return {
    deps,
    stub,
    home,
    token: HARNESS_TOKEN,
    async cleanup(): Promise<void> {
      await stub.close();
      await home.cleanup();
    },
  };
}
