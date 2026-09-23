import { ZERO_USAGE } from "../../src/domain/usage.js";
import type { RunProgress } from "../../src/runtimes/types.js";

/**
 * resolveRunOutcome 测试专用的小工厂：RunProgress 字段很多，
 * 但每条规则真正关心的通常只有一两个字段，这里给个跑得通的默认值，测试里只覆盖需要的字段。
 */
export function createProgress(overrides: Partial<RunProgress> = {}): RunProgress {
  return {
    sessionRef: null,
    phase: "ended",
    outcome: null,
    retry: null,
    usage: ZERO_USAGE,
    activity: null,
    lastEventAt: null,
    finalText: null,
    plainOutputTail: null,
    model: null,
    eventCount: 0,
    ...overrides,
  };
}
