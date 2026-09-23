/**
 * 轮询直到条件成立或超时。引擎内部大量操作是「触发后不等」的 fire-and-forget
 * （例如 dispatcher 用 setImmediate 合并放行请求、launcher 不等启动完成），
 * 测试用真实的短间隔轮询等结果落地，比死记多少个 setImmediate/微任务节拍更稳。
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(options.message ?? `等了 ${timeoutMs}ms 条件还没成立`);
    }
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
