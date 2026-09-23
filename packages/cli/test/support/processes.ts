/**
 * 测试里真的拉起过 fake-daemon.mjs 这类假服务进程时，用它收尾杀掉，不留后台进程。
 * ensureDaemon 生产语义上是故意让被拉起的服务和命令行进程脱钩（detached + unref），
 * 测试里如果不主动杀掉，这些进程会一直占着端口挂在后台。
 */
export function killIfAlive(pid: number): void {
  try {
    process.kill(pid);
  } catch {
    // 已经自己退出，或者这个号已经被系统收回，都不算测试失败。
  }
}
