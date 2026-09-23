import { type FleetConfig, fleetConfigSchema } from "./schema.js";

/** 配置解析结果：成功给出补齐默认值后的配置，失败给出可读的问题列表。 */
export type ConfigParseResult = { ok: true; config: FleetConfig } | { ok: false; issues: string[] };

/** 把校验问题格式化成 "<路径>: <消息>"；路径用点号连接，根路径写成 "(根)"。 */
function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "(根)" : path.join(".");
}

/** 用 zod 校验并补齐默认值。input 是还没确认结构的任意值（例如刚 JSON.parse 出来的内容）。 */
export function parseConfig(input: unknown): ConfigParseResult {
  const result = fleetConfigSchema.safeParse(input);
  if (result.success) {
    return { ok: true, config: result.data };
  }
  const issues = result.error.issues.map(
    (issue) => `${formatIssuePath(issue.path)}: ${issue.message}`,
  );
  return { ok: false, issues };
}

/** 先解析 JSON 文本，再交给 parseConfig 校验；JSON 语法本身出错时单独报一条问题。 */
export function parseConfigText(text: string): ConfigParseResult {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, issues: [`配置文件不是合法的 JSON：${message}`] };
  }
  return parseConfig(input);
}
