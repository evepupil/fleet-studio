import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TimelineDraft, TimelineKind } from "@fleet/core";
import type { Logger } from "../app/types.js";

/**
 * runs/<运行编号>/timeline.jsonl 的读写：每行一个 TimelineDraft 的 JSON。
 * 这个文件只由我们自己写，不是外部输入，所以校验比 store/rowMappers.ts 对数据库行的校验更轻——
 * 只确认「像」一个草稿（kind 是认得的种类、at 是字符串），坏掉的单行跳过而不是让整份时间线报错。
 */

const TIMELINE_KINDS: readonly TimelineKind[] = [
  "run_start",
  "text",
  "thinking",
  "tool_call",
  "tool_result",
  "retry",
  "error",
  "output",
  "run_end",
];

interface DraftShape {
  kind?: unknown;
  at?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * TIMELINE_KINDS 声明成 `readonly TimelineKind[]`，先接一次更宽的 `readonly string[]` 形状
 * 才能用一般字符串去 includes——这是结构兼容的普通赋值（收窄方向相反，加宽总是安全的），不是强转。
 */
const TIMELINE_KIND_LIST: readonly string[] = TIMELINE_KINDS;

/** 结构上「像」一个 TimelineDraft：kind 是认得的种类、at 是字符串。其余字段交给写入方保证。 */
function looksLikeDraft(value: Record<string, unknown>): value is TimelineDraft {
  const shape: DraftShape = value;
  const kind = shape.kind;
  return (
    typeof kind === "string" && TIMELINE_KIND_LIST.includes(kind) && typeof shape.at === "string"
  );
}

function parseDraftLine(line: string, filePath: string, logger: Logger): TimelineDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    logger.warn(`时间线草稿文件里有一行不是合法 JSON，跳过：${filePath}`);
    return null;
  }
  if (!isRecord(parsed) || !looksLikeDraft(parsed)) {
    logger.warn(`时间线草稿文件里有一行形状不对，跳过：${filePath}`);
    return null;
  }
  return parsed;
}

/**
 * 文件不存在返回 null（调用方据此决定要不要从原始输出重新解析）；
 * 文件存在（哪怕内容为空）返回数组；存在但内容损坏的行会被跳过并记警告。
 */
export async function readTimelineDrafts(
  filePath: string,
  logger: Logger,
): Promise<TimelineDraft[] | null> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const drafts: TimelineDraft[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    const draft = parseDraftLine(line, filePath, logger);
    if (draft !== null) {
      drafts.push(draft);
    }
  }
  return drafts;
}

/** 增量追加：跟踪中的运行每次产出新草稿就调一次。 */
export async function appendTimelineDrafts(
  filePath: string,
  drafts: readonly TimelineDraft[],
): Promise<void> {
  if (drafts.length === 0) {
    return;
  }
  await mkdir(dirname(filePath), { recursive: true });
  const text = `${drafts.map((draft) => JSON.stringify(draft)).join("\n")}\n`;
  await appendFile(filePath, text, "utf8");
}

/** 整份重写：服务重启接管一个运行时，用重新解析出的完整草稿列表替换掉旧文件。 */
export async function writeTimelineDrafts(
  filePath: string,
  drafts: readonly TimelineDraft[],
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const text =
    drafts.length === 0 ? "" : `${drafts.map((draft) => JSON.stringify(draft)).join("\n")}\n`;
  await writeFile(filePath, text, "utf8");
}
