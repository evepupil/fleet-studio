import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readEnv } from "./env.js";

export interface ProjectResolution {
  readonly projectPath: string;
  readonly cwd: string;
}

export interface ProjectResolutionInput {
  readonly projectFlag: string | undefined;
  readonly cwdFlag: string | undefined;
  readonly env: NodeJS.ProcessEnv;
  /** 调用方传入当前工作目录（通常是 process.cwd()），方便测试用固定值代替。 */
  readonly cwd: string;
}

/** 从 startDir 往上找第一个含 .git 的目录（文件或目录都算：git worktree 用的是文件）。 */
function findGitRoot(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(resolve(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * 推断苦工归属的项目目录（规格 3.3）：
 * cwd = --cwd > 传入的当前工作目录；
 * project = --project > 环境变量 FLEET_PROJECT > 从 cwd 往上找到的第一个 .git 所在目录 > cwd 本身。
 * 两者都转成绝对路径；服务端负责再做一次归一化，这里不重复那份逻辑。
 */
export function resolveProject(input: ProjectResolutionInput): ProjectResolution {
  const cwd = resolve(input.cwdFlag ?? input.cwd);
  const projectPath = resolve(
    input.projectFlag ?? readEnv(input.env, "FLEET_PROJECT") ?? findGitRoot(cwd) ?? cwd,
  );
  return { projectPath, cwd };
}
