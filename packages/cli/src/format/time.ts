function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 只要时:分:秒，不管日期；fleet log 的时间线逐条一行用这个。 */
export function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/**
 * 通用时间显示（规格 3.5）：本地时区 HH:mm:ss；不是今天的话前面加日期 MM-DD HH:mm。
 * now 由调用方传入（默认当前时间），测试要固定「今天」是哪天时可以注入。
 */
export function formatClock(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (isSameLocalDay(date, now)) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
