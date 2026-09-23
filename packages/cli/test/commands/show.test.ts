import { afterEach, describe, expect, it } from "vitest";
import { FleetApiError } from "../../src/client.js";
import { runShowCommand } from "../../src/commands/show.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import { type CommandHarness, createCommandHarness } from "../support/commandHarness.js";
import { fakeDetail, fakeRun, fakeWorker } from "../support/fixtures.js";
import { findRequest } from "../support/stubServer.js";

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runShowCommand", () => {
  it("打印标题、状态、目录、角色、运行时模型、每次运行、用量、最新回报", async () => {
    const worker = fakeWorker({ status: "completed" });
    const detail = fakeDetail(worker, [
      fakeRun({
        seq: 1,
        report: { sections: [{ key: "SUMMARY", text: "做完了" }], verdict: "pass" },
      }),
    ]);
    harness = await createCommandHarness(() => ({ status: 200, body: detail }));

    const exitCode = await runShowCommand([worker.id], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);

    const request = findRequest(harness.stub.requests, "GET", `/api/workers/${worker.id}`);
    expect(request.headers["x-fleet-token"]).toBeUndefined();

    const output = harness.deps.stdoutLines.join("\n");
    expect(output).toContain(`标题：${worker.title}`);
    expect(output).toContain("状态：已完成");
    expect(output).toContain(`项目目录：${detail.projectPath}`);
    expect(output).toContain(`工作目录：${worker.cwd}`);
    expect(output).toContain("角色：实现");
    expect(output).toContain("运行时与模型：pi ·");
    expect(output).toContain("第1次运行");
    expect(output).toContain("用量与费用：");
    expect(output).toContain("【SUMMARY】");
    expect(output).toContain("做完了");
  });

  it("失败时在状态下一行打印原因（缺陷 8）", async () => {
    const worker = fakeWorker({
      status: "failed",
      failReason: "timeout",
      errorMessage: "运行超过 5 分钟被结束",
    });
    const detail = fakeDetail(worker, [
      fakeRun({ status: "failed", report: null, finalText: null }),
    ]);
    harness = await createCommandHarness(() => ({ status: 200, body: detail }));

    await runShowCommand([worker.id], harness.deps);
    const lines = harness.deps.stdoutLines;
    const statusIndex = lines.findIndex((line) => line.startsWith("状态："));
    expect(lines[statusIndex + 1]).toBe("原因：运行超时：运行超过 5 分钟被结束");
  });

  it("已取消且没有失败原因时，原因这一行只写说明", async () => {
    const worker = fakeWorker({ status: "cancelled", failReason: null, errorMessage: "用户取消" });
    const detail = fakeDetail(worker, [
      fakeRun({ status: "cancelled", report: null, finalText: null }),
    ]);
    harness = await createCommandHarness(() => ({ status: 200, body: detail }));

    await runShowCommand([worker.id], harness.deps);
    const lines = harness.deps.stdoutLines;
    const statusIndex = lines.findIndex((line) => line.startsWith("状态："));
    expect(lines[statusIndex + 1]).toBe("原因：用户取消");
  });

  it("正常完成时不打印原因这一行", async () => {
    const worker = fakeWorker({ status: "completed" });
    const detail = fakeDetail(worker);
    harness = await createCommandHarness(() => ({ status: 200, body: detail }));

    await runShowCommand([worker.id], harness.deps);
    expect(harness.deps.stdoutLines.some((line) => line.startsWith("原因："))).toBe(false);
  });

  it("没有回报（还在跑、或失败没留下回报）时最新回报统一写占位文字（缺陷 8）", async () => {
    const runningWorker = fakeWorker({ status: "running" });
    const detail = fakeDetail(runningWorker, [
      fakeRun({ status: "running", report: null, finalText: null }),
    ]);
    harness = await createCommandHarness(() => ({ status: 200, body: detail }));

    await runShowCommand([runningWorker.id], harness.deps);
    const lines = harness.deps.stdoutLines;
    const reportIndex = lines.indexOf("最新回报：");
    expect(lines[reportIndex + 1]).toBe("（暂无回报）");
  });

  it("--json 原样输出接口返回的 WorkerDetail", async () => {
    const worker = fakeWorker();
    const detail = fakeDetail(worker);
    harness = await createCommandHarness(() => ({ status: 200, body: detail }));
    const exitCode = await runShowCommand([worker.id, "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual(detail);
  });

  it("苦工不存在时接口返回 404，命令抛出 FleetApiError", async () => {
    harness = await createCommandHarness(() => ({
      status: 404,
      body: { error: { code: "not_found", message: "苦工不存在" } },
    }));
    await expect(runShowCommand(["nope"], harness.deps)).rejects.toBeInstanceOf(FleetApiError);
  });

  it("没有给编号时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: {} }));
    await expect(runShowCommand([], harness.deps)).rejects.toThrow(CliUsageError);
  });
});
