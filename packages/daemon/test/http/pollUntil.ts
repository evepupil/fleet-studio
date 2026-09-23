/**
 * 轮询等待某个条件成立，用于测试里“客户端断开之后服务端才异步处理完”这类场景，
 * 避免用固定的 sleep 时长导致测试时快时慢。
 */
export async function pollUntil(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 10,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("等待条件成立超时");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
