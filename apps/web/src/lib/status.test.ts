import { RUN_STATUSES } from "@fleet/core";
import { CircleCheck, CircleSlash, CircleX, Clock3, Loader } from "lucide-react";
import { describe, expect, it } from "vitest";
import { STATUS_META } from "./status";

describe("STATUS_META", () => {
  it("覆盖全部五种状态", () => {
    for (const status of RUN_STATUSES) {
      expect(STATUS_META[status]).toBeDefined();
    }
  });

  it("中文词和图标一一对应", () => {
    expect(STATUS_META.queued).toEqual({
      label: "排队中",
      icon: Clock3,
      badgeClass: "text-status-queued",
    });
    expect(STATUS_META.running).toEqual({
      label: "工作中",
      icon: Loader,
      badgeClass: "text-status-running",
    });
    expect(STATUS_META.completed).toEqual({
      label: "已完成",
      icon: CircleCheck,
      badgeClass: "text-status-done",
    });
    expect(STATUS_META.failed).toEqual({
      label: "失败",
      icon: CircleX,
      badgeClass: "text-status-failed",
    });
    expect(STATUS_META.cancelled).toEqual({
      label: "已取消",
      icon: CircleSlash,
      badgeClass: "text-status-cancelled",
    });
  });
});
