import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHome } from "../src/home.js";

describe("resolveHome", () => {
  it("优先用 --home", () => {
    const result = resolveHome("/explicit/home", { FLEET_HOME: "/env/home" });
    expect(result).toBe(resolve("/explicit/home"));
  });

  it("没有 --home 时用环境变量 FLEET_HOME", () => {
    const result = resolveHome(undefined, { FLEET_HOME: "/env/home" });
    expect(result).toBe(resolve("/env/home"));
  });

  it("都没有时落到 ~/.fleet-studio", () => {
    const result = resolveHome(undefined, {});
    expect(result).toBe(resolve(homedir(), ".fleet-studio"));
  });
});
