/**
 * 命令对输出的全部依赖都收在这一个接口里，而不是直接调用 console 或 process.stdout。
 * 为什么：测试要在不真正打印到终端的情况下断言输出内容；用接口注入比劫持全局 console 更干净。
 */
export interface CliIo {
  stdout(line: string): void;
  stderr(line: string): void;
}

/** 真实运行时用的实现：一行一个换行，交给 process 的标准流。 */
export function createProcessIo(): CliIo {
  return {
    stdout(line: string): void {
      process.stdout.write(`${line}\n`);
    },
    stderr(line: string): void {
      process.stderr.write(`${line}\n`);
    },
  };
}
