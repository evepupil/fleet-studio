/**
 * 苦工编号、运行编号、pi 会话编号的生成与解析。
 * 编号只在内存和文件名里流转，不做 IO，纯字符串运算。
 */

/** 苦工编号字母表：去掉容易看错的 i、l、o、0、1，方便主会话手敲。 */
export const WORKER_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 苦工编号里字母表字符的个数，固定 5 位。 */
const WORKER_ID_SUFFIX_LENGTH = 5;

/** 严格匹配 "w" + 5 个字母表字符；字母表本身不含正则特殊字符，可以直接拼进字符类。 */
const WORKER_ID_PATTERN = new RegExp(`^w[${WORKER_ID_ALPHABET}]{${WORKER_ID_SUFFIX_LENGTH}}$`);

/**
 * 生成一个苦工编号：`w` + 5 个取自字母表的字符。
 * random 默认 `Math.random`，返回 [0,1)；测试时可以注入固定序列让结果可预测。
 */
export function createWorkerId(random: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < WORKER_ID_SUFFIX_LENGTH; i++) {
    const index = Math.floor(random() * WORKER_ID_ALPHABET.length);
    suffix += WORKER_ID_ALPHABET.charAt(index);
  }
  return `w${suffix}`;
}

/** 严格匹配苦工编号格式：w 开头 + 5 个字母表字符，不多不少。 */
export function isWorkerId(value: string): boolean {
  return WORKER_ID_PATTERN.test(value);
}

/** 运行编号 = 苦工编号 + 序号，例如 w7k2mq.2。 */
export function runIdOf(workerId: string, seq: number): string {
  return `${workerId}.${seq}`;
}

/**
 * 反解运行编号。格式不对（没有恰好一个点号、苦工编号部分为空）
 * 或序号不是正整数（0、负数、小数、非数字）都返回 null。
 */
export function parseRunId(runId: string): { workerId: string; seq: number } | null {
  const parts = runId.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [workerId, seqText] = parts;
  if (workerId === undefined || seqText === undefined || workerId.length === 0) {
    return null;
  }
  if (!/^[1-9]\d*$/.test(seqText)) {
    return null;
  }
  return { workerId, seq: Number(seqText) };
}

/** pi 的会话编号固定为 fleet-<苦工编号>，续接时复用同一个会话。 */
export function piSessionIdOf(workerId: string): string {
  return `fleet-${workerId}`;
}
