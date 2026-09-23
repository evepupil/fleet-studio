import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProject } from "../src/project.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "fleet-cli-project-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveProject", () => {
  it("从工作目录往上找到第一个含 .git 的目录", async () => {
    const repo = join(root, "repo");
    const nested = join(repo, "sub", "nested");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });

    const result = resolveProject({
      projectFlag: undefined,
      cwdFlag: undefined,
      env: {},
      cwd: nested,
    });
    expect(result.projectPath).toBe(resolve(repo));
    expect(result.cwd).toBe(resolve(nested));
  });

  it("往上都找不到 .git 时用工作目录本身", async () => {
    const noGitDir = join(root, "no-git");
    await mkdir(noGitDir, { recursive: true });

    const result = resolveProject({
      projectFlag: undefined,
      cwdFlag: undefined,
      env: {},
      cwd: noGitDir,
    });
    expect(result.projectPath).toBe(resolve(noGitDir));
  });

  it("环境变量 FLEET_PROJECT 优先于 .git 探测", async () => {
    const repo = join(root, "repo2");
    await mkdir(join(repo, ".git"), { recursive: true });
    const envProject = join(root, "env-project");
    await mkdir(envProject, { recursive: true });

    const result = resolveProject({
      projectFlag: undefined,
      cwdFlag: undefined,
      env: { FLEET_PROJECT: envProject },
      cwd: repo,
    });
    expect(result.projectPath).toBe(resolve(envProject));
  });

  it("--project 优先于环境变量和 .git 探测", async () => {
    const repo = join(root, "repo3");
    await mkdir(join(repo, ".git"), { recursive: true });
    const flagProject = join(root, "flag-project");
    await mkdir(flagProject, { recursive: true });

    const result = resolveProject({
      projectFlag: flagProject,
      cwdFlag: undefined,
      env: { FLEET_PROJECT: join(root, "env-project-unused") },
      cwd: repo,
    });
    expect(result.projectPath).toBe(resolve(flagProject));
  });

  it("--cwd 改变工作目录，.git 探测基于新的工作目录", async () => {
    const repoA = join(root, "repoA");
    const repoB = join(root, "repoB");
    await mkdir(join(repoA, ".git"), { recursive: true });
    await mkdir(join(repoB, ".git"), { recursive: true });

    const result = resolveProject({ projectFlag: undefined, cwdFlag: repoB, env: {}, cwd: repoA });
    expect(result.cwd).toBe(resolve(repoB));
    expect(result.projectPath).toBe(resolve(repoB));
  });
});
