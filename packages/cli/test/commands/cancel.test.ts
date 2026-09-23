import { TOKEN_HEADER } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { runCancelCommand } from "../../src/commands/cancel.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import {
  type CommandHarness,
  createCommandHarness,
  HARNESS_TOKEN,
} from "../support/commandHarness.js";
import { fakeWorker } from "../support/fixtures.js";
import { findRequest } from "../support/stubServer.js";

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runCancelCommand", () => {
  it("取消单个苦工成功：路径、令牌都对，打印状态行，退出码 0", async () => {
    const worker = fakeWorker({ status: "cancelled" });
    harness = await createCommandHarness(() => ({ status: 200, body: { worker } }));

    const exitCode = await runCancelCommand([worker.id], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);

    const request = findRequest(harness.stub.requests, "POST", `/api/workers/${worker.id}/cancel`);
    expect(request.headers[TOKEN_HEADER]).toBe(HARNESS_TOKEN);
    expect(request.body).toBe("");
    expect(harness.deps.stdoutLines.some((line) => line.includes("已取消"))).toBe(true);
  });

  it("逐个取消：一个失败不影响另一个继续处理，整体退出码 1", async () => {
    const okId = "aaaaa1";
    const badId = "bbbbb2";
    harness = await createCommandHarness((request) => {
      if (request.path === `/api/workers/${okId}/cancel`) {
        return { status: 200, body: { worker: fakeWorker({ id: okId, status: "cancelled" }) } };
      }
      if (request.path === `/api/workers/${badId}/cancel`) {
        return { status: 404, body: { error: { code: "not_found", message: "苦工不存在" } } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runCancelCommand([okId, badId], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.failure);
    // 两个编号都发出了取消请求：第二个失败不会中断第一个之后的处理。
    expect(
      harness.stub.requests.some((request) => request.path === `/api/workers/${okId}/cancel`),
    ).toBe(true);
    expect(
      harness.stub.requests.some((request) => request.path === `/api/workers/${badId}/cancel`),
    ).toBe(true);
    expect(
      harness.deps.stdoutLines.some((line) => line.includes(okId) && line.includes("已取消")),
    ).toBe(true);
    expect(
      harness.deps.stdoutLines.some((line) => line.includes(badId) && line.includes("取消失败")),
    ).toBe(true);
  });

  it("--json 输出每个编号的处理结果数组", async () => {
    const worker = fakeWorker({ status: "cancelled" });
    harness = await createCommandHarness(() => ({ status: 200, body: { worker } }));
    const exitCode = await runCancelCommand([worker.id, "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    const parsed = JSON.parse(harness.deps.stdoutLines.join("\n"));
    expect(parsed).toEqual([{ id: worker.id, ok: true, worker }]);
  });

  it("没有给编号时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: {} }));
    await expect(runCancelCommand([], harness.deps)).rejects.toThrow(CliUsageError);
  });
});
