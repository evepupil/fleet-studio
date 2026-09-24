import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT_CODE } from "../src/errors.js";
import { runFleetCli } from "../src/main.js";
import { createFakeDeps } from "./support/deps.js";

/**
 * fleet 系列 skill（仓库 skills/ 目录）是主会话学用 fleet 命令的说明书，见接入层模块设计。
 * 这组测试守两件事：skill 里写到的子命令、选项和动作，命令行真的认；skill 之间互相点名的，仓库里真的有。
 * 改了命令参数却忘了改 skill，这里会失败并指出是哪个文件的哪一句。
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKILLS_DIR = join(REPO_ROOT, "skills");

/** 围栏代码块，允许缩进（列表项里的代码块）。 */
const FENCED_BLOCK = /^[ \t]*```[^\n]*\n([\s\S]*?)^[ \t]*```/gm;
const INLINE_CODE = /`([^`\n]+)`/g;
/** 代码里的 fleet 调用：fleet 后面隔着空白跟一个小写单词；fleet-studio、fleet-dispatch 这类名字不算。 */
const FLEET_CALL = /(?:^|[\s(;&|$])fleet\s+([a-z][a-z-]*)([^;&|\n]*)/g;
/** 命令里的选项：前面是空白或行首。 */
const OPTION = /(?:^|\s)(--[a-z][a-z-]*)/g;
/** 帮助文字里的选项：前面可能紧挨着中文标点（例如「、--prompt-file」），所以不要求前面有空白。 */
const HELP_OPTION = /(--[a-z][a-z-]*)/g;
/** 正文里点名的 fleet 系列 skill。 */
const SKILL_MENTION = /\bfleet-[a-z][a-z-]*[a-z]\b/g;
/** 带动作词的子命令：动作词必须出现在它的用法行里。 */
const COMMANDS_WITH_ACTION = new Set(["pool", "daemon"]);

interface MarkdownFile {
  /** 相对仓库根目录，报错时给人看 */
  readonly path: string;
  readonly text: string;
}

interface FleetCall {
  readonly file: string;
  readonly subcommand: string;
  readonly args: string;
}

function listMarkdownFiles(): MarkdownFile[] {
  return readdirSync(SKILLS_DIR, { recursive: true, encoding: "utf8" })
    .filter((rel) => rel.endsWith(".md"))
    .map((rel) => {
      const full = join(SKILLS_DIR, rel);
      return {
        path: relative(REPO_ROOT, full).replaceAll("\\", "/"),
        text: readFileSync(full, "utf8"),
      };
    });
}

function listSkillNames(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** markdown 里的代码：围栏代码块按行拆开，行内代码一段算一个。 */
function codeSnippets(text: string): string[] {
  const snippets: string[] = [];
  for (const match of text.matchAll(FENCED_BLOCK)) {
    snippets.push(...(match[1] ?? "").split("\n"));
  }
  for (const match of text.replace(FENCED_BLOCK, "").matchAll(INLINE_CODE)) {
    snippets.push(match[1] ?? "");
  }
  return snippets;
}

function collectFleetCalls(files: readonly MarkdownFile[]): FleetCall[] {
  const calls: FleetCall[] = [];
  for (const file of files) {
    for (const snippet of codeSnippets(file.text)) {
      for (const match of snippet.matchAll(FLEET_CALL)) {
        calls.push({ file: file.path, subcommand: match[1] ?? "", args: match[2] ?? "" });
      }
    }
  }
  return calls;
}

function describeCall(call: FleetCall): string {
  return `${call.file}：fleet ${call.subcommand}${call.args}`;
}

/** 跑一次命令行（不连服务），要求成功，返回标准输出。 */
async function runForOutput(argv: readonly string[]): Promise<string> {
  const deps = createFakeDeps();
  const exitCode = await runFleetCli(argv, deps);
  expect(exitCode, `fleet ${argv.join(" ")} 应当成功`).toBe(EXIT_CODE.ok);
  return deps.stdoutLines.join("\n");
}

/** 总帮助里的子命令表：每行两个空格缩进，子命令名后面跟说明。 */
function parseSubcommands(globalHelp: string): Set<string> {
  return new Set([...globalHelp.matchAll(/^ {2}([a-z]+)\s{2,}/gm)].map((match) => match[1] ?? ""));
}

function optionsIn(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? "");
}

const markdownFiles = listMarkdownFiles();
const skillNames = listSkillNames();
const calls = collectFleetCalls(markdownFiles);

describe("fleet 系列 skill 的声明", () => {
  it("每份 skill 都有 SKILL.md，开头声明了和目录同名的 name，并写了 description", () => {
    const problems: string[] = [];
    for (const name of skillNames) {
      const skillFile = markdownFiles.find((file) => file.path === `skills/${name}/SKILL.md`);
      if (skillFile === undefined) {
        problems.push(`${name}：缺 SKILL.md`);
        continue;
      }
      const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillFile.text)?.[1];
      if (header === undefined) {
        problems.push(`${name}：SKILL.md 开头没有用 --- 包起来的声明`);
        continue;
      }
      if (!new RegExp(`^name: ${name}\\s*$`, "m").test(header)) {
        problems.push(`${name}：name 和目录名不一致`);
      }
      if (!/^description: \S/m.test(header)) {
        problems.push(`${name}：缺 description`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("正文里点名的 fleet 系列 skill 都在仓库里", () => {
    const problems: string[] = [];
    for (const file of markdownFiles) {
      for (const match of file.text.matchAll(SKILL_MENTION)) {
        const name = match[0];
        if (name !== "fleet-studio" && !skillNames.includes(name)) {
          problems.push(`${file.path}：${name}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("fleet 系列 skill 与命令行一致", () => {
  it("能从 skill 里找到足够多的 fleet 命令用例（确认提取规则本身没失效）", () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it("写到的子命令都存在", async () => {
    const known = parseSubcommands(await runForOutput(["--help"]));
    expect(known.has("run")).toBe(true);
    const problems = calls.filter((call) => !known.has(call.subcommand)).map(describeCall);
    expect(problems).toEqual([]);
  });

  it("写到的选项都出现在对应子命令的 --help 里", async () => {
    const known = parseSubcommands(await runForOutput(["--help"]));
    const helpBySubcommand = new Map<string, string>();
    for (const subcommand of known) {
      helpBySubcommand.set(subcommand, await runForOutput([subcommand, "--help"]));
    }
    const problems: string[] = [];
    for (const call of calls) {
      const help = helpBySubcommand.get(call.subcommand);
      if (help === undefined) {
        continue; // 子命令不存在的情况由上一条测试报告
      }
      const accepted = new Set([...optionsIn(help, HELP_OPTION), "--help"]);
      for (const option of optionsIn(call.args, OPTION)) {
        if (!accepted.has(option)) {
          problems.push(`${describeCall(call)}（不认识 ${option}）`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("pool、daemon 后面跟的动作词都写在它们的用法行里", async () => {
    const problems: string[] = [];
    for (const call of calls.filter((item) => COMMANDS_WITH_ACTION.has(item.subcommand))) {
      const action = call.args.trim().split(/\s+/)[0] ?? "";
      if (!/^[a-z]+$/.test(action)) {
        continue; // 只写了子命令名、或者后面直接跟选项，没有动作词可查
      }
      const usageLine = (await runForOutput([call.subcommand, "--help"])).split("\n")[0] ?? "";
      if (!usageLine.includes(action)) {
        problems.push(`${describeCall(call)}（不认识动作 ${action}）`);
      }
    }
    expect(problems).toEqual([]);
  });
});
