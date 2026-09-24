#!/usr/bin/env node
/**
 * 把仓库 roles/ 下的角色提示词同步到苦工运行时的目录
 * （接入层模块设计 docs/模块设计/接入层-skill与苦工提示词.md）。只用 Node 内置模块，不依赖任何第三方包。
 *
 * fleet 派 pi 苦工时直接读仓库里的提示词（配置写成 builtin:roles/<角色>.md），不靠这里同步。
 * 这里同步的两处给别的用法：
 * - opencode：实现、侦察、评审三个角色走 opencode 自己的 agent（带「不许改文件」这类权限），
 *   agent 文件必须放在 opencode 的配置目录里。用 roles/opencode-agents.json 里的开头声明
 *   加 roles/<角色>.md 的正文拼成 agent 文件，文件里带一行标记。
 * - pi：~/.pi/agent/roles/<角色>.md 是不经过 fleet、直接启动 pi 时读的角色文件（例如 Codex 里
 *   旧的 pi-fleet）。原样复制仓库提示词；因为内容和仓库完全一样，靠「内容一致」认出是本脚本写的，
 *   不往提示词里加标记。
 *
 * 目标位置已有同名文件、又不是本脚本写的，先挪进 <数据目录>/role-backup/<时间>/<opencode|pi>/ 再写。
 * 只处理仓库里有的角色，目录里其他文件一概不动。
 *
 * 用法：
 *   node scripts/install-roles.mjs              同步两处
 *   node scripts/install-roles.mjs --check      只报告和仓库是否一致，不一致时退出码 1
 *   node scripts/install-roles.mjs --uninstall  删掉本脚本写的文件，挪回最近一次备份
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const ROLES_DIR = join(REPO_ROOT, "roles");
const SPEC_FILE = join(ROLES_DIR, "opencode-agents.json");

/** 写进每个 opencode agent 文件开头声明里的标记：认出「这是本脚本生成的」，才允许覆盖和删除。 */
const MARKER = "fleet-studio install-roles";

/** 备份放在 fleet 的数据目录下，和 fleet 命令一样认 FLEET_HOME。 */
function backupRoot() {
  return join(process.env.FLEET_HOME ?? join(homedir(), ".fleet-studio"), "role-backup");
}

function normalize(text) {
  return text.replaceAll("\r\n", "\n");
}

function readText(path) {
  try {
    return normalize(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readRepoRole(id) {
  return normalize(readFileSync(join(ROLES_DIR, `${id}.md`), "utf8"));
}

/** 仓库里的角色：roles/ 下的 .md 文件。 */
function repoRoleIds() {
  return readdirSync(ROLES_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length))
    .sort();
}

/** 字符串一律写成 JSON 字符串：它同时是合法的 YAML 双引号写法，中文和标点都不用操心转义。 */
function yamlScalar(value) {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/** 拼出一个 agent 文件：开头声明（公共字段 + 本角色的说明和权限）+ 仓库里这个角色的提示词正文。 */
function renderAgent(id, shared, agent) {
  const lines = [
    "---",
    `# ${MARKER}：由仓库 roles/${id}.md 生成，改提示词请改仓库再运行 node scripts/install-roles.mjs`,
    `description: ${yamlScalar(agent.description)}`,
  ];
  for (const [key, value] of Object.entries(shared)) {
    lines.push(`${key}: ${yamlScalar(value)}`);
  }
  const permissions = Object.entries(agent.permission ?? {});
  if (permissions.length > 0) {
    lines.push("permission:");
    for (const [tool, rule] of permissions) {
      lines.push(`  ${tool}: ${yamlScalar(rule)}`);
    }
  }
  lines.push("---", "");
  return `${lines.join("\n")}\n${readRepoRole(id).trimEnd()}\n`;
}

/**
 * 两处目标，各自说清：目录在哪、要写哪些文件（文件名 → 内容）、怎么认出「是本脚本写的」。
 * opencode 目录和 opencode 一样认 XDG_CONFIG_HOME；pi 目录固定在用户目录下。
 */
function targets() {
  const spec = JSON.parse(readFileSync(SPEC_FILE, "utf8"));
  const opencodeFiles = Object.entries(spec.agents).map(([id, agent]) => ({
    name: `${id}.md`,
    content: renderAgent(id, spec.shared, agent),
  }));
  const piFiles = repoRoleIds().map((id) => ({ name: `${id}.md`, content: readRepoRole(id) }));
  return [
    {
      kind: "opencode",
      dir: join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode", "agents"),
      files: opencodeFiles,
      isOwned: (installed) => installed.includes(MARKER),
    },
    {
      kind: "pi",
      dir: join(homedir(), ".pi", "agent", "roles"),
      files: piFiles,
      isOwned: (installed, expected) => installed === expected,
    },
  ];
}

function moveFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

function install(target, stamp) {
  mkdirSync(target.dir, { recursive: true });
  const backedUp = [];
  for (const file of target.files) {
    const path = join(target.dir, file.name);
    const installed = readText(path);
    if (installed !== null && !target.isOwned(installed, file.content)) {
      const backupPath = join(backupRoot(), stamp, target.kind, file.name);
      moveFile(path, backupPath);
      backedUp.push(`${file.name} → ${backupPath}`);
    }
    writeFileSync(path, file.content, "utf8");
  }
  console.log(
    `[${target.kind}] 已同步到 ${target.dir}：${target.files.map((file) => file.name).join("、")}`,
  );
  if (backedUp.length > 0) {
    console.log(`[${target.kind}] 原来的文件已挪进备份，--uninstall 可挪回：`);
    for (const line of backedUp) {
      console.log(`  ${line}`);
    }
  }
}

/** 最近一次、并且含这一处目标的备份目录；没有就返回 null。时间戳按字典序排就是时间顺序。 */
function latestBackup(kind) {
  const root = backupRoot();
  if (!existsSync(root)) {
    return null;
  }
  const stamps = readdirSync(root)
    .filter((stamp) => existsSync(join(root, stamp, kind)))
    .sort();
  const latest = stamps.at(-1);
  return latest === undefined ? null : join(root, latest, kind);
}

function uninstall(target) {
  const removed = [];
  for (const file of target.files) {
    const path = join(target.dir, file.name);
    const installed = readText(path);
    if (installed !== null && target.isOwned(installed, file.content)) {
      unlinkSync(path);
      removed.push(file.name);
    }
  }

  const restored = [];
  const backup = latestBackup(target.kind);
  if (backup !== null) {
    for (const name of readdirSync(backup)) {
      const path = join(target.dir, name);
      if (existsSync(path)) {
        continue;
      }
      moveFile(join(backup, name), path);
      restored.push(name);
    }
    for (const emptyDir of [backup, dirname(backup)]) {
      if (readdirSync(emptyDir).length === 0) {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    }
  }
  console.log(`[${target.kind}] 已删除：${removed.length > 0 ? removed.join("、") : "无"}`);
  console.log(`[${target.kind}] 已挪回：${restored.length > 0 ? restored.join("、") : "无"}`);
}

/** 逐个文件报告和仓库是否一致；全部一致返回 true。 */
function check(target) {
  let clean = true;
  for (const file of target.files) {
    const installed = readText(join(target.dir, file.name));
    let state = "一致";
    if (installed === null) {
      state = "未同步";
    } else if (!target.isOwned(installed, file.content)) {
      state = target.kind === "pi" ? "和仓库不一致" : "不是本脚本生成的";
    } else if (installed !== file.content) {
      state = "和仓库不一致";
    }
    if (state !== "一致") {
      clean = false;
    }
    console.log(`[${target.kind}] ${file.name}：${state}`);
  }
  return clean;
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      check: { type: "boolean", default: false },
      uninstall: { type: "boolean", default: false },
    },
  });

  // 同一次同步的两处共用一个时间戳，备份放在同一个目录里
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  let clean = true;
  for (const target of targets()) {
    if (values.check) {
      clean = check(target) && clean;
    } else if (values.uninstall) {
      uninstall(target);
    } else {
      install(target, stamp);
    }
  }
  if (values.check && !clean) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`同步苦工提示词失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
