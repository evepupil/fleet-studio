import { describe, expect, it } from "vitest";
import type { TaskFilterState } from "@/state/taskFilterStore";
import {
  activeFilterChips,
  chipResetPatch,
  hasActiveFilters,
  TASK_SORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  taskStatusLabel,
  toTasksQuery,
} from "./taskFilters";

const filters: TaskFilterState = {
  status: "all",
  range: { kind: "all" },
  q: "",
  sort: "createdAt",
  order: "desc",
};

describe("toTasksQuery", () => {
  it("applies API defaults, trims search, and passes page cursors", () => {
    expect(toTasksQuery({ ...filters, q: "  build  " }, "next")).toEqual({
      range: "all",
      status: "all",
      q: "build",
      sort: "createdAt",
      order: "desc",
      cursor: "next",
      limit: 50,
    });
  });

  it("includes optional filters and local date bounds", () => {
    expect(
      toTasksQuery({
        ...filters,
        project: "alpha",
        pool: "pool-a",
        role: "builder",
        channel: "anthropic",
        model: "claude-sonnet",
        range: { kind: "custom", from: "2026-09-01", to: "2026-09-10" },
      }),
    ).toMatchObject({
      project: "alpha",
      pool: "pool-a",
      role: "builder",
      channel: "anthropic",
      model: "claude-sonnet",
      from: "2026-09-01",
    });
  });
});

describe("选项表", () => {
  it("状态八项，第一项是默认的全部", () => {
    expect(TASK_STATUS_OPTIONS.map((option) => option.label)).toEqual([
      "全部",
      "进行中",
      "排队中",
      "工作中",
      "重试中",
      "已完成",
      "失败",
      "已取消",
    ]);
    expect(taskStatusLabel("retrying")).toBe("重试中");
  });

  it("排序三项：开始时间、用量、耗时", () => {
    expect(TASK_SORT_OPTIONS.map((option) => option.label)).toEqual(["开始时间", "用量", "耗时"]);
  });
});

describe("activeFilterChips", () => {
  const lookups = {
    projects: new Map([["alpha", "Alpha Project"]]),
    roles: new Map([["reviewer", "评审"]]),
    channels: new Map([["anthropic", "Anthropic"]]),
  };
  const busyFilters: TaskFilterState = {
    ...filters,
    status: "failed",
    project: "alpha",
    pool: "dsf",
    role: "reviewer",
    channel: "anthropic",
    model: "claude-sonnet",
    range: { kind: "7d" },
    q: "  timeout ",
  };

  it("列表视图：状态在最前，其余按项目、池、角色、渠道、模型；时间和搜索不做成小标签", () => {
    expect(activeFilterChips(busyFilters, lookups, "list")).toEqual([
      { key: "status", label: "状态：失败" },
      { key: "project", label: "项目：Alpha Project" },
      { key: "pool", label: "池：dsf" },
      { key: "role", label: "角色：评审" },
      { key: "channel", label: "渠道：Anthropic" },
      { key: "model", label: "模型：claude-sonnet" },
    ]);
  });

  it("看板视图不显示状态", () => {
    expect(activeFilterChips(busyFilters, lookups, "board").map((chip) => chip.key)).toEqual([
      "project",
      "pool",
      "role",
      "channel",
      "model",
    ]);
  });

  it("默认条件下没有小标签", () => {
    expect(activeFilterChips(filters, lookups, "list")).toEqual([]);
  });

  it("去掉小标签时写回默认值", () => {
    expect(chipResetPatch("status")).toEqual({ status: "all" });
    expect(chipResetPatch("project")).toEqual({ project: undefined });
    expect(chipResetPatch("model")).toEqual({ model: undefined });
  });
});

describe("hasActiveFilters", () => {
  it("看板只看项目、池、角色、渠道、模型和标题", () => {
    expect(hasActiveFilters(filters, "board")).toBe(false);
    expect(hasActiveFilters({ ...filters, status: "failed", range: { kind: "7d" } }, "board")).toBe(
      false,
    );
    expect(hasActiveFilters({ ...filters, q: "x" }, "board")).toBe(true);
    expect(hasActiveFilters({ ...filters, pool: "dsf" }, "board")).toBe(true);
  });

  it("列表另外看状态和时间范围，排序不算", () => {
    expect(hasActiveFilters({ ...filters, status: "failed" }, "list")).toBe(true);
    expect(hasActiveFilters({ ...filters, range: { kind: "today" } }, "list")).toBe(true);
    expect(hasActiveFilters({ ...filters, sort: "tokens", order: "asc" }, "list")).toBe(false);
  });
});
