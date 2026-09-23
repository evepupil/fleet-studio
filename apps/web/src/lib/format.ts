/**
 * 时长、时间、token 数、费用、路径的显示格式化。全部是纯函数，方便单测锁定边界行为。
 */

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** 时长转中文：45秒 / 3分12秒 / 1时05分。负数按 0 处理。 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}秒`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return `${totalMinutes}分${pad2(seconds)}秒`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}时${pad2(minutes)}分`;
}

/** 短格式时长：10 秒以内保留一位小数，其余同 formatDuration。给经常很短的耗时场景（工具调用）用。 */
export function formatShortDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    return `${(clamped / 1000).toFixed(1)}秒`;
  }
  return formatDuration(clamped);
}

/** 时钟：和 now 同一天只显示时分秒，跨天补上月日；全部按本地时区取值。 */
export function formatClock(iso: string, nowMs: number): string {
  const date = new Date(iso);
  const now = new Date(nowMs);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const TOKEN_THOUSAND = 1000;
const TOKEN_MILLION = 1_000_000;

/** 一位小数并去掉多余的 .0：4.2 → "4.2"，1.0 → "1"。 */
function trimOneDecimal(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/** token 数：千位以下原样，千位用 K，百万位用 M。 */
export function formatTokens(n: number): string {
  if (n < TOKEN_THOUSAND) {
    return `${n}`;
  }
  if (n < TOKEN_MILLION) {
    return `${trimOneDecimal(n / TOKEN_THOUSAND)}K`;
  }
  return `${trimOneDecimal(n / TOKEN_MILLION)}M`;
}

/** 费用：没有费用（null 或 0）不显示；不到 1 分钱写 <$0.01。 */
export function formatCost(usd: number | null): string | null {
  if (usd === null || usd === 0) {
    return null;
  }
  if (usd < 0.01) {
    return "<$0.01";
  }
  return `$${usd.toFixed(2)}`;
}

/** 超长文本从中间省略，保留开头和结尾；结果长度恰好是 max。 */
export function middleEllipsis(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  if (max <= 1) {
    return "…".slice(0, Math.max(0, max));
  }
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** 已耗时长：起点为空时无法计算；终点为空按 now 算实时耗时。 */
export function elapsedMs(from: string | null, to: string | null, nowMs: number): number | null {
  if (from === null) {
    return null;
  }
  const start = Date.parse(from);
  const end = to === null ? nowMs : Date.parse(to);
  return end - start;
}
