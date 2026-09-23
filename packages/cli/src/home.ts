import { homedir } from "node:os";
import { resolve } from "node:path";
import { readEnv } from "./env.js";

/** 没有任何指定时的数据目录名，落在用户主目录下。 */
const DEFAULT_HOME_DIR_NAME = ".fleet-studio";

/**
 * 数据目录优先级：--home > 环境变量 FLEET_HOME > ~/.fleet-studio。
 * 统一转成绝对路径，避免相对路径在切换工作目录后指向别的地方。
 */
export function resolveHome(homeFlag: string | undefined, env: NodeJS.ProcessEnv): string {
  const raw = homeFlag ?? readEnv(env, "FLEET_HOME") ?? resolve(homedir(), DEFAULT_HOME_DIR_NAME);
  return resolve(raw);
}
