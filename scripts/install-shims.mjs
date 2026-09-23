#!/usr/bin/env node
/**
 * 把 `fleet` 命令外壳装进 npm 全局目录（技术设计文档 4.6 节；命令行层模块设计 3.2 节
 * 靠它找到 packages/cli/dist/main.js）。只用 Node 内置模块，不依赖任何第三方包。
 *
 * 三个外壳都直接调用 `node <仓库>/packages/cli/dist/main.js` 并原样转发全部参数：
 * - fleet.cmd：Windows cmd.exe 用，CRLF 换行，用 %* 转发参数。
 * - fleet.ps1：PowerShell 用，用 @args 转发参数并透传退出码。
 * - fleet：POSIX sh 用，用 exec + "$@" 转发参数（换掉当前进程，不额外包一层）。
 *
 * 目标文件已存在且不是本脚本生成的（内容里没有下面这个标记）就报错退出，不覆盖；
 * 是本脚本生成的就覆盖。--uninstall 只删除带标记的三个文件。
 */
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** 写进每个生成文件里的标记：判断"这是不是本脚本上次装的"，决定能不能覆盖/删除。 */
const MARKER = "fleet-studio install-shims";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

function cliEntryPath() {
  return join(REPO_ROOT, "packages", "cli", "dist", "main.js");
}

function cmdShimContent(entryPath) {
  return ["@echo off", `:: ${MARKER}`, `node "${entryPath}" %*`, ""].join("\r\n");
}

function ps1ShimContent(entryPath) {
  return [`# ${MARKER}`, `& node "${entryPath}" @args`, "exit $LASTEXITCODE", ""].join("\n");
}

function shShimContent(entryPath) {
  return ["#!/bin/sh", `# ${MARKER}`, `exec node "${entryPath}" "$@"`, ""].join("\n");
}

/** 三个外壳的文件名、内容和（仅 POSIX 外壳需要的）可执行权限。 */
function shimSpecs() {
  const entryPath = cliEntryPath();
  return [
    { name: "fleet.cmd", content: cmdShimContent(entryPath) },
    { name: "fleet.ps1", content: ps1ShimContent(entryPath) },
    { name: "fleet", content: shShimContent(entryPath), mode: 0o755 },
  ];
}

/** Windows 上 npm 是 .cmd 外壳；这是唯一允许经过 cmd.exe 的命令，字符串不含任何外部输入。 */
async function resolveNpmGlobalPrefix() {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync("cmd.exe", ["/d", "/s", "/c", "npm prefix -g"]);
    return stdout.trim();
  }
  const { stdout } = await execFileAsync("npm", ["prefix", "-g"]);
  return stdout.trim();
}

function readExistingContent(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** 目标文件不存在，或者存在但带着本脚本的标记，才允许写入/删除。 */
function isWritable(path) {
  const content = readExistingContent(path);
  return content === null || content.includes(MARKER);
}

function isOwnedByThisScript(path) {
  return readExistingContent(path)?.includes(MARKER) ?? false;
}

function install(targetDir) {
  mkdirSync(targetDir, { recursive: true });
  const specs = shimSpecs();

  const conflicts = specs
    .map((spec) => join(targetDir, spec.name))
    .filter((path) => !isWritable(path));
  if (conflicts.length > 0) {
    console.error("以下文件已存在且不是本脚本生成的，未做任何修改：");
    for (const path of conflicts) {
      console.error(`  ${path}`);
    }
    process.exitCode = 1;
    return;
  }

  const written = [];
  for (const spec of specs) {
    const path = join(targetDir, spec.name);
    writeFileSync(path, spec.content, "utf8");
    if (spec.mode !== undefined) {
      chmodSync(path, spec.mode); // 只有 POSIX 外壳需要可执行权限，Windows 上这个调用基本是空操作
    }
    written.push(path);
  }

  console.log("已写入：");
  for (const path of written) {
    console.log(`  ${path}`);
  }
}

function uninstall(targetDir) {
  const specs = shimSpecs();
  const removed = [];
  for (const spec of specs) {
    const path = join(targetDir, spec.name);
    if (!existsSync(path) || !isOwnedByThisScript(path)) {
      continue;
    }
    unlinkSync(path);
    removed.push(path);
  }

  if (removed.length === 0) {
    console.log("没有找到本脚本安装的外壳文件。");
    return;
  }
  console.log("已删除：");
  for (const path of removed) {
    console.log(`  ${path}`);
  }
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      uninstall: { type: "boolean", default: false },
      prefix: { type: "string" },
    },
  });

  const targetDir = values.prefix ?? (await resolveNpmGlobalPrefix());

  if (values.uninstall) {
    uninstall(targetDir);
  } else {
    install(targetDir);
  }
}

main().catch((error) => {
  console.error(`安装脚本失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
