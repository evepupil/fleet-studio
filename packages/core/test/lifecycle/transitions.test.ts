import { describe, expect, it } from "vitest";
import { isFleetError } from "../../src/domain/errors.js";
import { STATUS_LABELS } from "../../src/domain/labels.js";
import { RUN_STATUSES, type RunStatus } from "../../src/domain/status.js";
import { assertTransition, canTransition } from "../../src/lifecycle/index.js";

/** 规格里唯一允许的 6 条流转。 */
const ALLOWED_PAIRS: ReadonlyArray<readonly [RunStatus, RunStatus]> = [
  ["queued", "running"],
  ["queued", "cancelled"],
  ["queued", "failed"],
  ["running", "completed"],
  ["running", "failed"],
  ["running", "cancelled"],
];

function pairKey(from: RunStatus, to: RunStatus): string {
  return `${from}->${to}`;
}

const allowedKeys = new Set(ALLOWED_PAIRS.map(([from, to]) => pairKey(from, to)));

describe("canTransition / assertTransition：5×5 穷举", () => {
  it(`允许的组合恰好是这 6 条：${ALLOWED_PAIRS.map(([f, t]) => pairKey(f, t)).join("、")}`, () => {
    expect(allowedKeys.size).toBe(6);
  });

  for (const from of RUN_STATUSES) {
    for (const to of RUN_STATUSES) {
      const shouldAllow = allowedKeys.has(pairKey(from, to));
      const label = `${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`;

      if (shouldAllow) {
        it(`允许：${label}`, () => {
          expect(canTransition(from, to)).toBe(true);
          expect(() => assertTransition(from, to)).not.toThrow();
        });
      } else {
        it(`不允许（含原地不动）：${label}`, () => {
          expect(canTransition(from, to)).toBe(false);
          expect(() => assertTransition(from, to)).toThrow(
            `不能从「${STATUS_LABELS[from]}」变为「${STATUS_LABELS[to]}」`,
          );
        });
      }
    }
  }

  it("不允许时抛出的是 FleetError，错误码是 illegal_transition", () => {
    try {
      assertTransition("completed", "running");
      throw new Error("assertTransition 应该抛异常");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("illegal_transition");
        expect(error.message).toBe("不能从「已完成」变为「工作中」");
      }
    }
  });
});
