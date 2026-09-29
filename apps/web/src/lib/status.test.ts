import { RUN_STATUSES } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { RETRY_ICON_CLASS, STATUS_META } from "./status";

describe("STATUS_META", () => {
  it("覆盖全部五种状态", () => {
    for (const status of RUN_STATUSES) {
      expect(STATUS_META[status]).toBeDefined();
    }
  });

  it("中文词和图标颜色一一对应", () => {
    expect(STATUS_META).toEqual({
      queued: { label: "排队中", iconClass: "text-status-queued" },
      running: { label: "工作中", iconClass: "text-status-running" },
      completed: { label: "已完成", iconClass: "text-status-done" },
      failed: { label: "失败", iconClass: "text-status-failed" },
      cancelled: { label: "已取消", iconClass: "text-status-cancelled" },
    });
  });

  it("重试中用警告色", () => {
    expect(RETRY_ICON_CLASS).toBe("text-status-warning");
  });
});
