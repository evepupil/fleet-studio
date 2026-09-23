import { describe, expect, it } from "vitest";
import { summarizeToolCall } from "../../../src/runtimes/opencode/summarize.js";

describe("summarizeToolCall", () => {
  it("按优先级取第一个存在的字符串字段当摘要", () => {
    expect(summarizeToolCall({ path: "a.ts", command: "ls" }).summary).toBe("a.ts");
    expect(summarizeToolCall({ command: "pnpm test" }).summary).toBe("pnpm test");
    expect(summarizeToolCall({ url: "https://example.com" }).summary).toBe("https://example.com");
  });

  it("优先字段的值不是字符串时跳过，继续找下一个优先字段", () => {
    expect(summarizeToolCall({ filePath: 123, path: "b.ts" }).summary).toBe("b.ts");
  });

  it("没有任何优先字段时，把整个参数对象压成一行 JSON", () => {
    expect(summarizeToolCall({ foo: "bar" }).summary).toBe('{"foo":"bar"}');
  });

  it("空对象时摘要是空对象的 JSON，详情是 null", () => {
    const result = summarizeToolCall({});
    expect(result.summary).toBe("{}");
    expect(result.detail).toBeNull();
  });

  it("非空对象的详情是两空格缩进的格式化 JSON", () => {
    const result = summarizeToolCall({ filePath: "a.txt", content: "ok" });
    expect(result.detail).toBe('{\n  "filePath": "a.txt",\n  "content": "ok"\n}');
  });

  it("摘要按 160 字符截断并压成一行（多余空白合并）", () => {
    const longCommand = `echo ${"x".repeat(200)}`;
    const result = summarizeToolCall({ command: longCommand });
    expect(result.summary.length).toBe(160);
    expect(result.summary.endsWith("…")).toBe(true);
  });
});
