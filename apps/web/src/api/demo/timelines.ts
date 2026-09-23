import type { TimelineDraft } from "@fleet/core";
import { minutesAgo } from "./records";

/**
 * 演示用的时间线草稿，按运行编号给出。没有列出的运行只有开始、结束两条分隔。
 * 内容照 pi 真实事件流的形状编写：工具调用后跟结果、失败时先报错再重试。
 */

function text(minutes: number, value: string): TimelineDraft {
  return { kind: "text", at: minutesAgo(minutes), text: value };
}

function thinking(minutes: number, value: string): TimelineDraft {
  return { kind: "thinking", at: minutesAgo(minutes), text: value };
}

function call(minutes: number, callId: string, tool: string, summary: string, detail: string | null): TimelineDraft {
  return { kind: "tool_call", at: minutesAgo(minutes), callId, tool, summary, detail };
}

function result(minutes: number, callId: string, tool: string, ok: boolean, preview: string): TimelineDraft {
  return { kind: "tool_result", at: minutesAgo(minutes), callId, tool, ok, preview, truncated: false };
}

function failure(minutes: number, message: string): TimelineDraft {
  return { kind: "error", at: minutesAgo(minutes), message };
}

function retry(minutes: number, attempt: number, delayMs: number): TimelineDraft {
  return { kind: "retry", at: minutesAgo(minutes), attempt, max: 8, delayMs, message: "Connection error." };
}

function stderr(minutes: number, value: string): TimelineDraft {
  return { kind: "output", at: minutesAgo(minutes), stream: "stderr", text: value };
}

const REVIEW_RUN1: TimelineDraft[] = [
  text(16.0, "先读改动涉及的核心文件，再跑一遍核心层测试。"),
  call(15.8, "c1", "read", "packages/core/src/scheduling/dispatchOrder.ts", '{\n  "path": "packages/core/src/scheduling/dispatchOrder.ts"\n}'),
  result(15.8, "c1", "read", true, "import type { DispatchOrder, PoolLimit, QueuedEntry, RunningEntry } from \"./types.js\";\n\n/**\n * 排队时间的排序权重：解析不出来的时间不丢弃条目……"),
  call(15.5, "c2", "read", "packages/core/src/lifecycle/outcome.ts", '{\n  "path": "packages/core/src/lifecycle/outcome.ts"\n}'),
  result(15.5, "c2", "read", true, "export function resolveRunOutcome(input: OutcomeInput): ResolvedOutcome {\n  const { progress, exit, killedBy, timeoutMs } = input;"),
  call(15.1, "c3", "bash", "pnpm exec vitest run packages/core", '{\n  "command": "pnpm exec vitest run packages/core"\n}'),
  result(14.7, "c3", "bash", true, " Test Files  33 passed (33)\n      Tests  347 passed (347)\n   Duration  2.98s"),
  failure(14.2, "Connection error."),
  retry(14.2, 1, 2000),
  thinking(13.9, "dispatchOrder 在两个项目占用相同时比较队首排队时间，再比较项目键，规则和规格一致。接下来看路径归一化的边角：UNC 路径缺 share 段的情况。"),
  call(13.6, "c4", "read", "packages/core/src/projects/path.ts", '{\n  "path": "packages/core/src/projects/path.ts"\n}'),
  result(13.6, "c4", "read", true, "function resolveDotSegments(segments: string[], rootDepth: number): string[] {\n  const result = segments.slice(0, rootDepth);"),
  call(13.2, "c5", "bash", "node -e \"console.log(normalize('\\\\\\\\server\\\\'))\"", '{\n  "command": "node -e \\"console.log(normalize(\'\\\\\\\\\\\\\\\\server\\\\\\\\\'))\\""\n}'),
  result(13.0, "c5", "bash", false, "ReferenceError: normalize is not defined\n    at [eval]:1:13"),
  stderr(12.9, "Warning: Invalid thinking level \"maximum\", using default"),
  call(12.5, "c6", "bash", "node probe-unc.mjs", '{\n  "command": "node probe-unc.mjs"\n}'),
  result(12.1, "c6", "bash", true, "\\\\server\\   => \\\\server\\\n\\\\server    => \\\\server"),
  text(
    9.2,
    "VERDICT: fail\nISSUES:\n[P2] packages/core/src/projects/path.ts:21 — UNC 路径缺 share 段时末尾分隔符没去掉 — 输入 \\\\server\\ 得到 \\\\server\\，与 \\\\server 不一致",
  ),
];

const REVIEW_RUN2: TimelineDraft[] = [
  call(3.6, "d1", "read", "packages/core/src/projects/path.ts", '{\n  "path": "packages/core/src/projects/path.ts"\n}'),
  result(3.6, "d1", "read", true, "// UNC 根只有主机名时同样去掉末尾分隔符"),
  call(3.2, "d2", "bash", "pnpm exec vitest run packages/core/test/projects", '{\n  "command": "pnpm exec vitest run packages/core/test/projects"\n}'),
  result(2.7, "d2", "bash", true, " Test Files  2 passed (2)\n      Tests  21 passed (21)"),
  text(
    1.6,
    [
      "SUMMARY: 复查 UNC 路径归一化：缺 share 段时末尾分隔符已去掉，带 share 的路径行为不变。",
      "FILES:\n- packages/core/src/projects/path.ts（只读核对）\n- packages/core/test/projects/path.test.ts（只读核对）",
      "VERIFY: pnpm exec vitest run packages/core/test/projects，21 个测试全部通过",
      "VERDICT: pass",
      "ISSUES: 无",
    ].join("\n"),
  ),
];

const SCHEMA_RUN: TimelineDraft[] = [
  text(3.0, "先确认参数类型定义和现有校验入口，再补数值与区间两类的跨字段约束。"),
  call(2.8, "e1", "read", "packages/schema/src/types.ts", '{\n  "path": "packages/schema/src/types.ts"\n}'),
  result(2.8, "e1", "read", true, "export type ParamKind = \"number\" | \"range\" | \"enum\" | \"multi_enum\" | \"bool\" | \"text\";"),
  call(2.2, "e2", "edit", "packages/schema/src/validate.ts", '{\n  "path": "packages/schema/src/validate.ts",\n  "edits": 2\n}'),
  result(2.1, "e2", "edit", true, "Applied 2 edits"),
  thinking(1.4, "区间参数的下限不能大于上限；数值参数的 step 必须能整除范围，否则筛选档位会错位。"),
  call(0.7, "e3", "bash", "pnpm exec vitest run packages/schema", '{\n  "command": "pnpm exec vitest run packages/schema"\n}'),
];

const RETRY_RUN: TimelineDraft[] = [
  call(3.8, "f1", "read", "engine/internal/backend/fake/backend.go", '{\n  "path": "engine/internal/backend/fake/backend.go"\n}'),
  result(3.8, "f1", "read", true, "func (b *Backend) Submit(ctx context.Context, req SubmitRequest) (JobID, error) {"),
  failure(3.4, "Connection error."),
  retry(3.4, 1, 2000),
  failure(3.3, "Connection error."),
  retry(3.3, 2, 4000),
  failure(3.2, "Connection error."),
  retry(3.2, 3, 8000),
];

const RELAY_FAIL_RUN: TimelineDraft[] = [
  text(7.1, "先读中继服务的鉴权中间件。"),
  ...Array.from({ length: 8 }, (_, index): TimelineDraft[] => {
    const minutes = 6.8 - index * 0.35;
    const attempt = index + 1;
    return attempt < 8 ? [failure(minutes, "Connection error."), retry(minutes, attempt, 2000 * 2 ** (index % 3))] : [failure(minutes, "Connection error.")];
  }).flat(),
];

export const demoDrafts: Readonly<Record<string, readonly TimelineDraft[]>> = {
  "wr8v2k.1": REVIEW_RUN1,
  "wr8v2k.2": REVIEW_RUN2,
  "wk3m7p.1": SCHEMA_RUN,
  "wx2j3k.1": RETRY_RUN,
  "wu3y6z.1": RELAY_FAIL_RUN,
};
