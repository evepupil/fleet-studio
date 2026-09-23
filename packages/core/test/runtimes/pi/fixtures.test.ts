/**
 * 用真实抓到的 pi --mode json 样本逐行喂 reducer，检查整段流最终的进展。
 * 样本来源：.scratch/samples/pi/README.md（s01~s05、s08 是调研抓的失败/重试路径，
 * real-success-tools.stdout.jsonl 是本次任务在 %TEMP%\fleet-pi-lane\ 下实测抓到的真实成功流）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TimelineDraft } from "../../../src/domain/timeline.js";
import { createPiReducer, PI_MAX_CONSECUTIVE_FAILURES } from "../../../src/runtimes/pi/reducer.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/pi");
const FALLBACK_AT = "1999-01-01T00:00:00.000Z";

function readFixtureLines(name: string): string[] {
  return readFileSync(join(FIXTURES_DIR, name), "utf8").split(/\r?\n/);
}

/** 把一份或多份夹具（可以是不同 stream）逐行喂给同一个 reducer，返回全部草稿和最终进展。 */
function replay(files: { name: string; stream?: "stdout" | "stderr" }[]) {
  const reducer = createPiReducer();
  const drafts: TimelineDraft[] = [];
  for (const file of files) {
    for (const line of readFixtureLines(file.name)) {
      drafts.push(...reducer.push(line, file.stream ?? "stdout", FALLBACK_AT));
    }
  }
  return { drafts, progress: reducer.progress() };
}

describe("真实样本：real-success-tools（本次任务实测抓到的真实成功流）", () => {
  it("完整走完一次工具调用再收尾：结局已完成，回报原文正确，用量正确累加", () => {
    const { drafts, progress } = replay([{ name: "real-success-tools.stdout.jsonl" }]);

    expect(drafts.map((draft) => draft.kind)).toEqual([
      "thinking",
      "tool_call",
      "tool_result",
      "text",
    ]);
    expect(progress).toMatchObject({
      phase: "ended",
      outcome: { status: "completed" },
      sessionRef: "fleet-lane-probe",
      model: "mcgrox/deepseek-v4.1-flash",
      finalText: "完成",
      activity: "bash · echo fleet-ok",
    });
    expect(progress.usage).toEqual({
      inputTokens: 1264,
      outputTokens: 61,
      cacheReadTokens: 764,
      cacheWriteTokens: 0,
      totalTokens: 2089,
      costUsd: 0,
    });
  });
});

describe("真实样本：s01/s02/s03（mcgrox 网关故障期间抓到的连接错误重试，进程被超时杀掉，流没有走完）", () => {
  it("s01：两轮连接错误后流被截断，结局还没定，阶段是 retrying", () => {
    const { drafts, progress } = replay([{ name: "s01-text.stdout.jsonl" }]);
    expect(drafts.map((draft) => draft.kind)).toEqual(["error", "retry", "error", "retry"]);
    expect(progress).toMatchObject({
      phase: "retrying",
      outcome: null,
      sessionRef: "01a0cd68-8540-72a5-84ac-fc320118c991",
      model: "mcgrox/deepseek-v4.1-flash",
      retry: { attempt: 2, max: PI_MAX_CONSECUTIVE_FAILURES, message: "Connection error." },
    });
  });

  it("s02：会话编号来自事件流自己的 session 行，一轮连接错误后被截断", () => {
    const { drafts, progress } = replay([{ name: "s02-tools.stdout.jsonl" }]);
    expect(drafts.map((draft) => draft.kind)).toEqual(["error", "retry"]);
    expect(progress).toMatchObject({
      phase: "retrying",
      outcome: null,
      sessionRef: "scout-final1",
      retry: { attempt: 1, max: PI_MAX_CONSECUTIVE_FAILURES, message: "Connection error." },
    });
  });

  it("s03：续接同一个 session-id，流里没有系统消息也能正常工作；三轮连接错误后被截断", () => {
    const { drafts, progress } = replay([{ name: "s03-resume.stdout.jsonl" }]);
    expect(drafts.map((draft) => draft.kind)).toEqual([
      "error",
      "retry",
      "error",
      "retry",
      "error",
      "retry",
    ]);
    expect(progress).toMatchObject({
      phase: "retrying",
      outcome: null,
      sessionRef: "scout-final1",
      retry: { attempt: 3, max: PI_MAX_CONSECUTIVE_FAILURES, message: "Connection error." },
    });
    // retry 事件的 attempt 依次是 1、2、3（我们自己的连续失败计数，不是 pi 每轮的 delayMs 对应关系）。
    const retryDrafts = drafts.filter((draft) => draft.kind === "retry");
    expect(retryDrafts.map((draft) => (draft.kind === "retry" ? draft.attempt : null))).toEqual([
      1, 2, 3,
    ]);
    expect(retryDrafts.map((draft) => (draft.kind === "retry" ? draft.delayMs : null))).toEqual([
      2000, 4000, 8000,
    ]);
  });
});

describe("真实样本：s04（一次可重试错误之后，真正的 404 错误自然收尾）", () => {
  it("agent_settled 到达后按最后一次错误判定 model_error", () => {
    const { drafts, progress } = replay([
      { name: "s04-bad-model.stdout.jsonl" },
      { name: "s04-bad-model.stderr.txt", stream: "stderr" },
    ]);
    // 最后一个 "output" 来自 stderr 那行 pi 自己打的 warning（不是 JSON），跟结局判定无关。
    expect(drafts.map((draft) => draft.kind)).toEqual(["error", "retry", "error", "output"]);
    expect(progress.phase).toBe("ended");
    const outcome = progress.outcome;
    expect(outcome?.status).toBe("failed");
    if (outcome?.status === "failed") {
      expect(outcome.reason).toBe("model_error");
      expect(outcome.message).toContain("model_not_found");
    }
    // stderr 那行 pi 自己打的 warning 不是 JSON，按 output 事件处理，不影响上面的判定。
    expect(progress.plainOutputTail).toContain("Using custom model id");
  });
});

describe("真实样本：s08（第一次请求就是不可重试的错误，没有任何 auto_retry）", () => {
  it("零次重试直接 agent_settled，同样判定 model_error", () => {
    const { drafts, progress } = replay([{ name: "s08-stdin-ignore-ok.stdout.jsonl" }]);
    expect(drafts.map((draft) => draft.kind)).toEqual(["error"]);
    expect(progress.phase).toBe("ended");
    expect(progress.outcome).toMatchObject({ status: "failed", reason: "model_error" });
  });
});

describe("真实样本：s05（缺 API key，stdout 只有一行 session，真正的失败信息在 stderr）", () => {
  it("agent_start 从没出现过，阶段停在 starting；stderr 的多行提示（含中间空行）被收进 plainOutputTail", () => {
    const { drafts, progress } = replay([
      { name: "s05-no-key.stdout.jsonl" },
      { name: "s05-no-key.stderr.txt", stream: "stderr" },
    ]);
    expect(progress.phase).toBe("starting");
    expect(progress.outcome).toBeNull();
    expect(progress.sessionRef).not.toBeNull();
    // 最后 5 行非空 stderr 文本，空行被跳过、不会在尾巴里留下空段落。
    expect(progress.plainOutputTail).toBe(
      [
        "No API key found for mcgrox.",
        "Use /login to log into a provider via OAuth or API key. See:",
        "  C:\\Users\\zhoutao\\AppData\\Roaming\\npm\\node_modules\\@earendil-works\\pi-coding-agent\\docs\\providers.md",
        "  C:\\Users\\zhoutao\\AppData\\Roaming\\npm\\node_modules\\@earendil-works\\pi-coding-agent\\docs\\models.md",
      ].join("\n"),
    );
    // stdout 的 session 行本身是识别出的事件，不产出 output 事件；plainOutputTail 完全来自 stderr。
    expect(drafts.every((draft) => draft.kind === "output" && draft.stream === "stderr")).toBe(
      true,
    );
  });
});
