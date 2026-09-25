/** 仅在 Fleet 的后台 Node 苦工内预载：覆盖运行时及扩展发起子命令时漏设的窗口选项。 */
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

function hiddenOptions(args: readonly unknown[], acceptsArgs: boolean): unknown[] {
  const next = [...args];
  const index =
    acceptsArgs && (Array.isArray(next[1]) || (next[1] == null && next.length > 2)) ? 2 : 1;
  const options = next[index];
  if (typeof options === "function") {
    next.splice(index, 0, { windowsHide: true });
  } else if (options == null || (typeof options === "object" && !Array.isArray(options))) {
    next[index] = { ...options, windowsHide: true };
  }
  // 非法的选项类型交给 Node 原样报错，避免把调用错误悄悄变成成功。
  return next;
}

function hiddenCommand<Command extends (...args: never[]) => unknown>(
  command: Command,
  acceptsArgs: boolean,
): Command {
  // Node 将 promisify.custom 定义为不可配置属性；用独立的函数外壳，避免代理读取限制。
  const wrapper = command.bind(undefined) as Command;
  return new Proxy(wrapper, {
    apply(_target, receiver: unknown, args: unknown[]) {
      return Reflect.apply(command, receiver, hiddenOptions(args, acceptsArgs));
    },
    get(_target, property, receiver): unknown {
      const value: unknown = Reflect.get(command, property, receiver);
      // exec/execFile 的自定义 Promise 版本会直接调用原函数，也要传入窗口选项；
      // 仍使用 Node 原实现，保留返回 Promise 上的 child、stdout/stderr 和异常信息。
      if (property === promisify.custom && typeof value === "function") {
        return new Proxy(value, {
          apply(original, context: unknown, args: unknown[]) {
            return Reflect.apply(original, context, hiddenOptions(args, acceptsArgs));
          },
        });
      }
      return value;
    },
  });
}

if (process.platform === "win32") {
  childProcess.spawn = hiddenCommand(childProcess.spawn, true);
  childProcess.spawnSync = hiddenCommand(childProcess.spawnSync, true);
  childProcess.execFile = hiddenCommand(childProcess.execFile, true);
  childProcess.execFileSync = hiddenCommand(childProcess.execFileSync, true);
  childProcess.exec = hiddenCommand(childProcess.exec, false);
  childProcess.execSync = hiddenCommand(childProcess.execSync, false);
  childProcess.fork = hiddenCommand(childProcess.fork, true);
  // 同时覆盖 ESM 的具名导入和 CommonJS require，运行时与扩展使用任一种方式都生效。
  syncBuiltinESMExports();
}
