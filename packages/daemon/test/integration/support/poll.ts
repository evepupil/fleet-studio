/**
 * 轮询直到条件成立或超时。集成测试全程按需轮询（或用 /api/wait 挂起等待），
 * 不用固定的长时间 sleep 赌时序（任务书写法要求）。
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`等了 ${timeoutMs}ms 条件还没成立`);
    }
    await sleep(intervalMs);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
