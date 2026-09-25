import { describe, expect, it } from "vitest";
import type { TaskFilterState } from "@/state/taskFilterStore";
import { activeFilterChips, toTasksQuery } from "./taskFilters";

const filters: TaskFilterState = {
  status: "active",
  range: { kind: "all" },
  q: "",
  sort: "createdAt",
  order: "desc",
};

describe("toTasksQuery", () => {
  it("applies API defaults, trims search, and passes page cursors", () => {
    expect(toTasksQuery({ ...filters, q: "  build  " }, "next")).toEqual({
      range: "all",
      status: "active",
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

describe("activeFilterChips", () => {
  it("uses lookup labels and reports non-default filters", () => {
    expect(
      activeFilterChips(
        {
          ...filters,
          project: "alpha",
          channel: "anthropic",
          model: "claude-sonnet",
          status: "failed",
          q: "  timeout ",
        },
        {
          projects: new Map([["alpha", "Alpha Project"]]),
          channels: new Map([["anthropic", "Anthropic"]]),
          models: new Map([["claude-sonnet", "Claude Sonnet"]]),
        },
      ),
    ).toEqual([
      { key: "status", label: "失败" },
      { key: "project", label: "Alpha Project" },
      { key: "channel", label: "渠道：Anthropic" },
      { key: "model", label: "模型：Claude Sonnet" },
      { key: "query", label: "timeout" },
    ]);
  });
});
