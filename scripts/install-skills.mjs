#!/usr/bin/env node
/**
 * 把仓库 skills/ 下的 fleet 系列 skill 装进宿主的 skill 目录
 * （接入层模块设计 docs/模块设计/接入层-fleet系列skill.md）。只用 Node 内置模块，不依赖任何第三方包。
 *
 * 安装做两件事：
 * 1. 被 fleet 系列取代的旧全局 skill（RETIRED_SKILLS）挪进 <数据目录>/skill-backup/<时间>/<宿主>/，
 *    免得新旧两套抢着被加载；卸载时挪回来。
 * 2. 把 skills/<名字>/ 整个复制到宿主的 skill 目录，并在里面放一个标记文件。
 *    目标位置已有同名目录、又没有这个标记（用户自己的 skill），就报错退出，一个文件都不动。
 *
 * 用法：
 *   node scripts/install-skills.mjs                  装到 Claude Code
 *   node scripts/install-skills.mjs --target codex   装到 Codex；all 表示两边都装
 *   node scripts/install-skills.mjs --check          只报告装上的和仓库里差在哪，有差异时退出码 1
 *   node scripts/install-skills.mjs --uninstall      删掉本脚本装的 skill，挪回最近一次备份的旧 skill
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SKILLS_SOURCE_DIR = join(REPO_ROOT, "skills");

/** 放进每个装好的 skill 目录：认出「这是本脚本装的」，才允许覆盖和删除。 */
const MARKER_FILE = ".fleet-studio-skill.json";

/** 被 fleet 系列取代的旧全局 skill。auto-delegate 只在 Codex 那边有。 */
const RETIRED_SKILLS = ["pi-fleet", "oc-fleet", "fleet-build", "ui-build", "auto-delegate"];

/** 两个宿主的 skill 目录，环境变量沿用宿主自己的约定。 */
function hostSkillDirs() {
  return {
    claude: join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "skills"),
    codex: join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills"),
  };
}

/** 备份放在 fleet 的数据目录下，和 fleet 命令一样认 FLEET_HOME。 */
function backupRoot() {
  return join(process.env.FLEET_HOME ?? join(homedir(), ".fleet-studio"), "skill-backup");
}

/** 仓库里的 skill：skills/ 下带 SKILL.md 的目录。 */
function sourceSkills() {
  return readdirSync(SKILLS_SOURCE_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(SKILLS_SOURCE_DIR, entry.name, "SKILL.md")),
    )
    .map((entry) => entry.name)
    .sort();
}

function isOwnedByThisScript(dir) {
  return existsSync(join(dir, MARKER_FILE));
}

/** 同一个盘上直接改名；跨盘改名会报 EXDEV，就复制后删除。 */
function moveDir(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

/** 目录空了就删掉，备份目录挪空之后不留空壳。 */
function removeIfEmpty(dir) {
  if (existsSync(dir) && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 目录下全部文件的相对路径（统一成正斜杠），不含标记文件。 */
function listFiles(dir) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((rel) => rel.replaceAll("\\", "/"))
    .filter((rel) => rel !== MARKER_FILE && statSync(join(dir, rel)).isFile())
    .sort();
}

/** 装好的 skill 和仓库里的逐个文件比，返回差异说明；完全一致时返回空数组。 */
function diffSkill(sourceDir, installedDir) {
  const sourceFiles = listFiles(sourceDir);
  const installedFiles = listFiles(installedDir);
  const problems = [];
  for (const rel of sourceFiles) {
    if (!installedFiles.includes(rel)) {
      problems.push(`缺文件 ${rel}`);
    } else if (!readFileSync(join(sourceDir, rel)).equals(readFileSync(join(installedDir, rel)))) {
      problems.push(`内容不同 ${rel}`);
    }
  }
  for (const rel of installedFiles) {
    if (!sourceFiles.includes(rel)) {
      problems.push(`多出文件 ${rel}`);
    }
  }
  return problems;
}

function install(host, targetDir, stamp) {
  const skills = sourceSkills();
  const conflicts = skills
    .map((name) => join(targetDir, name))
    .filter((dir) => existsSync(dir) && !isOwnedByThisScript(dir));
  if (conflicts.length > 0) {
    console.error(`[${host}] 以下目录已存在且不是本脚本装的，未做任何修改：`);
    for (const dir of conflicts) {
      console.error(`  ${dir}`);
    }
    process.exitCode = 1;
    return;
  }

  mkdirSync(targetDir, { recursive: true });
  const retired = [];
  for (const name of RETIRED_SKILLS) {
    const dir = join(targetDir, name);
    if (!existsSync(dir)) {
      continue;
    }
    const backupDir = join(backupRoot(), stamp, host, name);
    moveDir(dir, backupDir);
    retired.push(`${name} → ${backupDir}`);
  }

  const installedAt = new Date().toISOString();
  for (const name of skills) {
    const dir = join(targetDir, name);
    rmSync(dir, { recursive: true, force: true });
    cpSync(join(SKILLS_SOURCE_DIR, name), dir, { recursive: true });
    const marker = { source: join(SKILLS_SOURCE_DIR, name), installedAt };
    writeFileSync(join(dir, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  }

  console.log(`[${host}] 已装到 ${targetDir}：${skills.join("、")}`);
  if (retired.length > 0) {
    console.log(`[${host}] 旧 skill 已挪进备份，--uninstall 可挪回：`);
    for (const line of retired) {
      console.log(`  ${line}`);
    }
  }
  console.log(`[${host}] 新开的会话会加载新 skill。`);
}

/** 最近一次、并且含这个宿主的备份目录；没有就返回 null。时间戳按字典序排就是时间顺序。 */
function latestBackup(host) {
  const root = backupRoot();
  if (!existsSync(root)) {
    return null;
  }
  const stamps = readdirSync(root)
    .filter((stamp) => existsSync(join(root, stamp, host)))
    .sort();
  const latest = stamps.at(-1);
  return latest === undefined ? null : join(root, latest, host);
}

function uninstall(host, targetDir) {
  const removed = [];
  for (const name of sourceSkills()) {
    const dir = join(targetDir, name);
    if (existsSync(dir) && isOwnedByThisScript(dir)) {
      rmSync(dir, { recursive: true, force: true });
      removed.push(name);
    }
  }

  const restored = [];
  const skipped = [];
  const backup = latestBackup(host);
  if (backup !== null) {
    for (const name of readdirSync(backup)) {
      const dir = join(targetDir, name);
      if (existsSync(dir)) {
        skipped.push(name);
        continue;
      }
      moveDir(join(backup, name), dir);
      restored.push(name);
    }
    removeIfEmpty(backup);
    removeIfEmpty(dirname(backup));
  }

  console.log(
    `[${host}] 已删除：${removed.length > 0 ? removed.join("、") : "无（没有本脚本装的 skill）"}`,
  );
  console.log(`[${host}] 已挪回旧 skill：${restored.length > 0 ? restored.join("、") : "无"}`);
  if (skipped.length > 0) {
    console.log(`[${host}] 目标位置已有同名目录，没挪回，仍留在备份里：${skipped.join("、")}`);
  }
}

/** 逐个 skill 报告装上的和仓库里是否一致；全部一致返回 true。 */
function check(host, targetDir) {
  let clean = true;
  for (const name of sourceSkills()) {
    const dir = join(targetDir, name);
    if (!existsSync(dir)) {
      console.log(`[${host}] ${name}：未安装`);
      clean = false;
      continue;
    }
    if (!isOwnedByThisScript(dir)) {
      console.log(`[${host}] ${name}：同名目录不是本脚本装的`);
      clean = false;
      continue;
    }
    const problems = diffSkill(join(SKILLS_SOURCE_DIR, name), dir);
    if (problems.length === 0) {
      console.log(`[${host}] ${name}：一致`);
      continue;
    }
    clean = false;
    console.log(`[${host}] ${name}：和仓库不一致`);
    for (const problem of problems) {
      console.log(`  ${problem}`);
    }
  }
  for (const name of RETIRED_SKILLS) {
    if (existsSync(join(targetDir, name))) {
      console.log(`[${host}] 旧 skill 还在：${name}`);
      clean = false;
    }
  }
  return clean;
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      target: { type: "string", default: "claude" },
      check: { type: "boolean", default: false },
      uninstall: { type: "boolean", default: false },
    },
  });

  const dirs = hostSkillDirs();
  const hosts = values.target === "all" ? ["claude", "codex"] : [values.target];
  for (const host of hosts) {
    if (!Object.hasOwn(dirs, host)) {
      throw new Error(`--target 只能是 claude、codex 或 all，收到：${host}`);
    }
  }

  // 同一次安装的几个宿主共用一个时间戳，备份放在同一个目录里
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  let clean = true;
  for (const host of hosts) {
    if (values.check) {
      clean = check(host, dirs[host]) && clean;
    } else if (values.uninstall) {
      uninstall(host, dirs[host]);
    } else {
      install(host, dirs[host], stamp);
    }
  }
  if (values.check && !clean) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`安装 skill 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
