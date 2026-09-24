#!/usr/bin/env node
/**
 * 用仓库 roles/ 下的角色提示词生成 opencode 的 agent 文件
 * （接入层模块设计 docs/模块设计/接入层-skill与苦工提示词.md）。只用 Node 内置模块，不依赖任何第三方包。
 *
 * fleet 派 pi 苦工时直接读仓库里的提示词（配置写成 builtin:roles/<角色>.md），不需要安装；
 * opencode 的实现、侦察、评审三个角色走 opencode 自己的 agent（带「不许改文件」这类权限），
 * agent 文件必须放在 opencode 的配置目录里。本脚本把 roles/opencode-agents.json 里的开头声明
 * 和 roles/<角色>.md 的正文拼成 agent 文件写过去，两个运行时用的就是同一份提示词。
 *
 * 目标位置已有同名文件、又不是本脚本生成的（没有标记），先挪进 <数据目录>/role-backup/<时间>/ 再写。
 *
 * 用法：
 *   node scripts/install-roles.mjs              生成并写入
 *   node scripts/install-roles.mjs --check      只报告和仓库是否一致，不一致时退出码 1
 *   node scripts/install-roles.mjs --uninstall  删掉本脚本生成的文件，挪回最近一次备份
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

/** 写进每个生成文件开头声明里的标记：认出「这是本脚本生成的」，才允许覆盖和删除。 */
const MARKER = "fleet-studio install-roles";

/** opencode 的 agent 目录，和 opencode 一样认 XDG_CONFIG_HOME。 */
function agentsDir() {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode", "agents");
}

/** 备份放在 fleet 的数据目录下，和 fleet 命令一样认 FLEET_HOME。 */
function backupRoot() {
  return join(process.env.FLEET_HOME ?? join(homedir(), ".fleet-studio"), "role-backup");
}

function loadSpec() {
  return JSON.parse(readFileSync(SPEC_FILE, "utf8"));
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
  const body = readFileSync(join(ROLES_DIR, `${id}.md`), "utf8")
    .replaceAll("\r\n", "\n")
    .trimEnd();
  return `${lines.join("\n")}\n${body}\n`;
}

function renderAll() {
  const spec = loadSpec();
  return Object.entries(spec.agents).map(([id, agent]) => ({
    id,
    content: renderAgent(id, spec.shared, agent),
  }));
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function isOwnedByThisScript(path) {
  return readText(path)?.includes(MARKER) ?? false;
}

function moveFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

function install(stamp) {
  const dir = agentsDir();
  mkdirSync(dir, { recursive: true });
  const written = [];
  const backedUp = [];
  for (const { id, content } of renderAll()) {
    const path = join(dir, `${id}.md`);
    if (existsSync(path) && !isOwnedByThisScript(path)) {
      const backupPath = join(backupRoot(), stamp, "opencode", `${id}.md`);
      moveFile(path, backupPath);
      backedUp.push(`${id}.md → ${backupPath}`);
    }
    writeFileSync(path, content, "utf8");
    written.push(`${id}.md`);
  }
  console.log(`[opencode] 已生成到 ${dir}：${written.join("、")}`);
  if (backedUp.length > 0) {
    console.log("[opencode] 原来的 agent 文件已挪进备份，--uninstall 可挪回：");
    for (const line of backedUp) {
      console.log(`  ${line}`);
    }
  }
}

/** 最近一次、并且含 opencode 的备份目录；没有就返回 null。时间戳按字典序排就是时间顺序。 */
function latestBackup() {
  const root = backupRoot();
  if (!existsSync(root)) {
    return null;
  }
  const stamps = readdirSync(root)
    .filter((stamp) => existsSync(join(root, stamp, "opencode")))
    .sort();
  const latest = stamps.at(-1);
  return latest === undefined ? null : join(root, latest, "opencode");
}

function uninstall() {
  const dir = agentsDir();
  const removed = [];
  for (const { id } of renderAll()) {
    const path = join(dir, `${id}.md`);
    if (existsSync(path) && isOwnedByThisScript(path)) {
      unlinkSync(path);
      removed.push(`${id}.md`);
    }
  }

  const restored = [];
  const backup = latestBackup();
  if (backup !== null) {
    for (const name of readdirSync(backup)) {
      const path = join(dir, name);
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
  console.log(`[opencode] 已删除：${removed.length > 0 ? removed.join("、") : "无"}`);
  console.log(`[opencode] 已挪回：${restored.length > 0 ? restored.join("、") : "无"}`);
}

/** 逐个 agent 报告装上的和仓库生成的是否一致；全部一致返回 true。 */
function check() {
  const dir = agentsDir();
  let clean = true;
  for (const { id, content } of renderAll()) {
    const installed = readText(join(dir, `${id}.md`));
    let state = "一致";
    if (installed === null) {
      state = "未生成";
    } else if (!installed.includes(MARKER)) {
      state = "不是本脚本生成的";
    } else if (installed.replaceAll("\r\n", "\n") !== content) {
      state = "和仓库不一致";
    }
    if (state !== "一致") {
      clean = false;
    }
    console.log(`[opencode] ${id}.md：${state}`);
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
  if (values.check) {
    if (!check()) {
      process.exitCode = 1;
    }
  } else if (values.uninstall) {
    uninstall();
  } else {
    install(new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"));
  }
}

try {
  main();
} catch (error) {
  console.error(
    `生成 opencode agent 失败：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
