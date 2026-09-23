import { describe, expect, it } from "vitest";
import { createPiReducer } from "../../../src/runtimes/pi/reducer.js";
import { DEFAULT_AT, feedLines } from "./factories.js";

describe("pi reducer：健壮性（非 JSON / 坏 JSON / 空行）", () => {
  it("空行（包括纯空白）不产出事件，什么状态都不改", () => {
    const reducer = createPiReducer();
    const before = reducer.progress();
    const drafts = feedLines(reducer, ["", "   ", "\t"]);
    expect(drafts).toEqual([]);
    expect(reducer.progress()).toEqual(before);
  });

  it("不是 JSON 的一行：产出 output 事件，stream 照传，并计入 plainOutputTail", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, ["No API key found for mcgrox."], "stderr", DEFAULT_AT);
    expect(drafts).toEqual([
      { kind: "output", at: DEFAULT_AT, stream: "stderr", text: "No API key found for mcgrox." },
    ]);
    expect(reducer.progress().plainOutputTail).toBe("No API key found for mcgrox.");
  });

  it("pi 新建会话的提示行整行忽略：不产出事件，状态跟没收到这行一样（D7）", () => {
    const reducer = createPiReducer();
    const before = reducer.progress();
    const noticeLine =
      "Warning: No project session found with id 'fleet-w12345'; creating a new session with that id.";
    const drafts = feedLines(reducer, [noticeLine], "stderr", DEFAULT_AT);
    expect(drafts).toEqual([]);
    expect(reducer.progress()).toEqual(before);
    expect(reducer.progress().plainOutputTail).toBeNull();
  });

  it("新建会话提示行首尾带空白也能识别；和一条真正的错误提示一起出现时，plainOutputTail 只含真正的错误（D7）", () => {
    const reducer = createPiReducer();
    const noticeLine =
      "  Warning: No project session found with id 'fleet-w12345'; creating a new session with that id.  ";
    const drafts = feedLines(
      reducer,
      [noticeLine, "Real error: something actually broke"],
      "stderr",
      DEFAULT_AT,
    );
    expect(drafts).toEqual([
      {
        kind: "output",
        at: DEFAULT_AT,
        stream: "stderr",
        text: "Real error: something actually broke",
      },
    ]);
    expect(reducer.progress().plainOutputTail).toBe("Real error: something actually broke");
  });

  it("是合法 JSON 但不是「带字符串 type 字段的对象」：同样按 output 处理", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, ['{"foo":1}', "[1,2,3]", "42"], "stdout", DEFAULT_AT);
    expect(drafts.map((draft) => draft.kind)).toEqual(["output", "output", "output"]);
    expect(reducer.progress().plainOutputTail).toContain("42");
  });

  it("plainOutputTail 只保留最后 5 行非 JSON 输出", () => {
    const reducer = createPiReducer();
    feedLines(reducer, ["行1", "行2", "行3", "行4", "行5", "行6", "行7"]);
    expect(reducer.progress().plainOutputTail).toBe("行3\n行4\n行5\n行6\n行7");
  });

  it("识别出的事件类型不会污染 plainOutputTail", () => {
    const reducer = createPiReducer();
    feedLines(reducer, ["纯文本"]);
    feedLines(reducer, [JSON.stringify({ type: "agent_start" })]);
    expect(reducer.progress().plainOutputTail).toBe("纯文本");
  });
});
