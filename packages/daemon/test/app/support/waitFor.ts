/**
 * 轮询直到条件成立或超时。配置热更新要等 configStore 内部真实的一秒轮询，故意不用假
 * 定时器（假定时器需要在打开 store 之前就接管 setInterval，和内部同步文件调用混在一起
 * 容易弄乱调用顺序），改用短间隔轮询判断条件，成立就立刻返回，不用死等固定时长。
 */
export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`等了 ${timeoutMs}ms 条件还没成立`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
}
