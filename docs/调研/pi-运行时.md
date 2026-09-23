# pi 运行时调研报告

调研时间：2026-09-23。目标：为「苦工闸门服务」（[roadmap](../roadmap.md) M1）把 pi 这一侧的事实查清，不改业务代码。pi 版本 `@earendil-works/pi-coding-agent@0.87.0`，安装在
`C:\Users\zhoutao\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent\`。

方法说明：pi 的 `dist/bundle/cli.js` 只是个 5 行的 loader，真正的逻辑在
`dist/bundle/chunks/chunk-4DKZACXI.js`（4,316,858 字节、esbuild 压缩后仅 1568 行，每行几千到几万字符）。这种文件用 `Read` 按行号读basically 读不出东西，所以本次调研写了一个一次性小脚本（临时目录 `%TEMP%\fleet-scout-pi\grepctx.mjs`，未提交、结束前已删除），按正则在整个文件里定位关键字并打印命中位置附近的原文片段，用于下面所有「源码：chunk-4DKZACXI.js」类引用。因为文件没有实际意义上的行号，引用格式统一写成「chunk-4DKZACXI.js，函数/变量名」，可以直接用同样的方式在文件里搜到。

---

## 1. 可执行入口

全局外壳三件套都指向同一个 JS 文件：

- `C:\Users\zhoutao\AppData\Roaming\npm\pi.cmd` 第 17 行：
  `"%_prog%"  "%dp0%\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js" %*`
- `pi.ps1` 第 14/16/22/24 行、`pi`（posix sh）第 13/15 行：逻辑相同，都是「有没有和外壳同目录的 `node.exe`，有就用它，没有就用 PATH 上的 `node`」。
- npm 目录本身没有内置 `node.exe`（`ls C:\Users\zhoutao\AppData\Roaming\npm\node.exe` 返回 exit 2），所以三个外壳实际都会走 PATH 上的 `node` —— 本机是 `C:\Program Files\nodejs\node.exe`（v24.18.0）。
- 包的 `package.json`（同目录）里 `"bin": {"pi": "dist/bundle/cli.js"}`，`"version": "0.87.0"`，和外壳里写的路径完全对得上。

`cli.js` 只有 5 行，`import` 了 `cli-runtime.js` 再调用它；`cli-runtime.js` 第 3 行才 `import` 真正的大 chunk 并在第 3 行末尾调用 `main(process.argv.slice(2))`。所以守护进程要 spawn 的真正入口是：

```
C:\Users\zhoutao\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js
```

**推荐写法**（Node 侧，不经过 cmd.exe）：

```js
const { spawn } = require("node:child_process");
spawn(process.execPath, [cliJsPath, ...args], {
  cwd: workerCwd,
  stdio: ["ignore", "pipe", "pipe"],   // 原因见第 6 节
  env: process.env,                    // 记得把 MCGROX_API_KEY 带进来，见第 7 节
});
```

**自动探测方法**（不要硬编码上面这条路径，装机位置/版本会变）：

```js
const { execSync } = require("node:child_process");
const path = require("node:path");
const npmRoot = execSync("npm root -g").toString().trim();
const pkgJson = require(path.join(npmRoot, "@earendil-works/pi-coding-agent/package.json"));
const cliJsPath = path.join(npmRoot, "@earendil-works/pi-coding-agent", pkgJson.bin.pi);
```

这比「解析 .cmd 外壳文本」更可靠——`npm root -g` + 包自己 `package.json` 的 `bin` 字段是 npm 生态的标准约定，`.cmd` 外壳的具体写法（有没有 `node.exe` 短路分支、变量名）是 npm 版本相关的实现细节，换个 npm 版本可能就变了。

---

## 2. 多行参数传递实测

在 `%TEMP%\fleet-scout-pi\` 下写了一个和 pi.cmd **结构逐字相同**的替身 `shim.cmd`（同样的 `@ECHO off / :find_dp0 / IF EXIST node.exe ... ELSE ... / endLocal & ... & "%_prog%" "%dp0%\argv-echo.mjs" %*` 模板，这是 npm cmd-shim 的标准模板，pi.cmd 本身就是这个模板生成的），配一个只打印 `JSON.stringify(process.argv)` 的 `argv-echo.mjs`。测试字符串包含换行、双引号、中文：
`第一行 first line\n第二行 with "quoted text" and 中文字符\n第三行 done`。

三种情况实测结果：

| 情况 | 收到的内容 | 结论 |
|---|---|---|
| (a) PowerShell 7 `& .\shim.cmd -p $多行字符串` | 只收到 `"第一行 first line"`，第一个换行之后**全部丢失** | 经过 .cmd/cmd.exe 就会在第一个换行处截断 |
| (b) Node `spawn(node.exe, [脚本, "-p", 多行字符串], {shell:false})` | 完整收到三行、双引号、中文，一字不差 | **安全**，argv 里换行/引号/中文都不会被破坏 |
| (c) Node `spawn(shim.cmd路径, ["-p", 多行字符串], {shell:true})` | 只收到 `"第一行"`、`"first"`、`"line"` 三个独立元素，换行后内容丢失，连空格都被拆开 | 经过 shell:true（Windows 上等于走 cmd.exe）比 (a) 更惨，连同一行内的空格都保不住 |

结论：**任何经过 cmd.exe / .cmd 外壳的路径，在 Windows 上都会把多行 prompt 截断在第一个换行处**，这不是 pi 的问题，是 cmd.exe 命令行解析的天然限制。pi 自己的全局外壳 `pi.cmd` 就是一个 .cmd 文件，所以「守护进程直接 spawn `"pi"` 或 `"pi.cmd"`」这条路径本身就不安全——必须像第 1 节那样直接 spawn `node.exe` + `cli.js`，完全跳过外壳，才能保证多行 prompt 不被截断。这也是本节实测反过来印证第 1 节推荐写法「必须」而不是「最好」的原因。

**文件/stdin 读取提示词**：`pi --help` 列出 `pi [options] [--] [@files...] [messages...]`。源码 `chunk-4DKZACXI.js` 的 `processFileArguments` 函数：`@file` 会被整个读入，包成 `<file name="绝对路径"> 文件原文 </file>` 文本块，直接拼进最终提示词字符串里（图片文件例外，会作为图片附件）；`buildInitialMessage` 函数把 stdin 内容、`@file` 文本、第一个位置参数用**空字符串**拼接成 `initialMessage`（没有自动加换行分隔）。stdin 方面：`readPipedStdin` 函数只要 `!process.stdin.isTTY` 就会读到 EOF 为止；`resolveAppMode`/主流程里 `appMode!=="rpc"` 时**总会**调用它（细节见第 6 节，这直接关系到会不会卡住）。

---

## 3. `--mode json` 事件流结构

事件由 `runPrintMode` 函数（`chunk-4DKZACXI.js`）统一转成一行 JSON 写到 **stdout**：`unsubscribe=session.subscribe(event=>{mode==="json"&&writeRawStdout(JSON.stringify(toJsonEvent(event))+"\n")})`。`writeRawStdout` 最终调用的是 `process.stdout.write`（rpc 模式下会被 `takeOverStdout` 接管，但同样是 stdout）。

### 3.1 事件类型一览（源码 `_emit(...)` 调用点逐个核对）

| 事件 type | 何时发出 | 关键字段 |
|---|---|---|
| `session` | 整次进程启动时，如果这个 session 已有历史（`sessionManager.getHeader()` 找到 fileEntries 里 `type==="session"` 的那条），在其它任何事件之前单独写一行 | `version`,`id`,`timestamp`,`cwd`（新建 session 时不写这行——实测新建 session 也会写，内容和后续持久化文件第一行一致，见 s09 号样本） |
| `agent_start` | 每次调用 agent 主循环开始（首次调用、以及每次 auto-retry 重开一轮） | 无额外字段 |
| `turn_start` | 每个 turn 开始 | 无额外字段（TUI 内部有 `turnIndex`，但 JSON 输出没有转发这个包装） |
| `message_start` | 一条新消息开始（system/user/assistant 起流式/toolResult 都会有） | `message`（此时消息内容通常还是空壳） |
| `message_update` | assistant 消息流式增量到达时（见 3.2） | 见下 |
| `message_end` | 一条消息结束 | `message`（这条是**完整最终消息**） |
| `turn_end` | 一个 turn 结束 | `message`（最后一条 assistant 消息）,`toolResults` |
| `agent_end` | 一整轮 agent 循环结束 | `messages`（本轮涉及的消息数组）,`willRetry`（布尔，见第 4 节） |
| `agent_settled` | 一次 `-p`/`--mode json` 调用的agent 彻底安定（不会再自动继续）时发出，我们实测到的成功/失败样本末尾都有这行 | 无额外字段 |
| `auto_retry_start` | 判定为可重试错误、准备第 N 次重试前 | `attempt`,`maxAttempts`(固定 3),`delayMs`,`errorMessage` |
| `auto_retry_end` | 重试结束（成功或最终放弃这一次 continue）| `success`,`attempt`,`finalError`? |
| `tool_execution_start` | 每个工具调用真正开始执行前 | `toolCallId`,`toolName`,`args` |
| `tool_execution_update` | 工具执行中产生部分输出时（比如 bash 流式输出）| `toolCallId`,`toolName`,`args`,`partialResult` |
| `tool_execution_end` | 工具执行结束 | `toolCallId`,`toolName`,`result`,`isError` |
| `compaction_start`/`compaction_end` | 手动或自动压缩上下文时 | `reason`(`manual`/`overflow`/`threshold`),`result`,`aborted`,`willRetry`,`errorMessage`? |
| `entry_appended` | 底层 session 树追加了一个节点，包括失败重试产生的 `context_edit`（把失败的那条消息标记为 `replacement:null`，相当于打了个删除标记再重来）| `entry` |

> 说明：静态搜索还命中过一个 `EVENT_TYPES` 数组（`run_start/retry_scheduled/entry_added/lane_created...`），那是依赖库 `@earendil-works/chord` 内部通用队列框架的事件名，和上面这张表是两套完全不同的东西，**不会**出现在 `--mode json` 的 stdout 里，调研时特别核实过调用路径以免混淆。

### 3.2 `message_update` 的真实结构 —— 不是「累积消息」

`toJsonEvent`/`toJsonAssistantMessageEvent` 两个函数（`chunk-4DKZACXI.js`）明确写了转换规则：

```js
function toJsonEvent(event){
  if (event.type !== "message_update") return event;
  return { type:"message_update", usage: event.message.usage,
           assistantMessageEvent: toJsonAssistantMessageEvent(event.assistantMessageEvent) };
}
```

也就是说 **`message_update` 在 JSON 输出里根本不带完整消息**，只有 `type`、当前 `usage`、和一个「增量事件」`assistantMessageEvent`。`assistantMessageEvent.type` 是下面这些之一（源码 `streamWithDeltas`/`streamAssistantResponse` 里的 switch case）：

`text_start` / `text_delta`(`delta`字段) / `text_end` / `thinking_start` / `thinking_delta` / `thinking_end` / `toolcall_start`(会带上 `id`,`toolName`) / `toolcall_delta` / `toolcall_end`。每个事件原本还带一个 `partial`（当前累积到的整条消息快照），但 `toJsonAssistantMessageEvent` 会把 `partial` 字段专门剥掉再序列化——**所以流式增量在 JSON 流里只有「这一小块变化」，没有整条消息反复重复**，这对日志体积是好事：一次普通回复大概是「每个文本/思考块一次 `_start`，中间若干次 `_delta`，一次 `_end`」，工具调用还会再多一轮 `toolcall_start/delta/end`。具体一次回复会拆成多少行没能实测到（见文末 GAPS），但结构上不会出现「message 本体被整段反复打印」的膨胀。

### 3.3 工具调用与工具结果

assistant 消息里的工具调用是 `content` 数组里的一项：`{"type":"toolCall","id":"call_xxx","name":"bash","arguments":{...}}`（真实样本，见 `s09-success-extract.session.jsonl`）。工具**结果**不是塞进 assistant 消息里，是单独一条新消息（`createToolResultMessage`/`createToolResultMessage2`，`chunk-4DKZACXI.js`）：

```json
{"role":"toolResult","toolCallId":"call_xxx","toolName":"bash",
 "content":[{"type":"text","text":"HELLO-FLEET\n"}],
 "details":{}, "isError":false, "timestamp":...}
```

这条消息照样走一次 `message_start`+`message_end`（`emitToolResultMessage` 函数）。`isError:true` 的例子（真实样本，删除已删除文件时 `ls` 报错）：`content` 是错误文本，`details:{}`。

### 3.4 usage / cost / stopReason

真实样本里的 `usage` 形状：`{"input":221,"output":50,"cacheRead":919,"cacheWrite":0,"reasoning":7,"totalTokens":1190,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}`（mcgrox 渠道成本全 0，是 provider 配置里 `cost` 字段本来就写的 0，见第 7 节引用的 `mcgrox-provider.ts`）。

`stopReason` 实测到的取值：`"stop"`（正常结束）、`"toolUse"`（要调用工具，源码里对应的 provider 原始值 `rawStopReason:"tool_calls"` 会一并保留）、`"error"`（失败，见第 4 节）。另外从静态源码确认还存在 `"pending"`（流式过程中的中间态）、`"aborted"`（被取消）、以及上下文超限相关的判断路径（`isContextOverflow`）。`errorMessage` 字段只在 `stopReason==="error"` 时出现，内容可能是 pi 自己拼的（如 `formatNoApiKeyFoundMessage`）也可能是直接转发上游 HTTP 错误体（如 `"404: {\"message\":\"Model ... not supported...\"}"`，见样本 s04）。

---

## 4. 结果判定

**核心结论：不能只看退出码，`--mode json` 下几乎所有情况退出码都是 0。**

`runPrintMode` 函数里 `exitCode` 变量默认是 `0`，只有 `mode==="text"` 分支才会把它设成 1；`mode==="json"` 分支走到底也不会碰这个变量,只有外层 `catch(error){ return console.error(...), 1 }` 抓到**没被内部吞掉**的异常时才会返回 1。所以判定必须看事件流本身：

- **成功**：最后几个事件是 `turn_end`(`stopReason:"stop"`) → `agent_end`(`willRetry:false`) → `agent_settled`，退出码 0。
- **失败但 exit 0**：assistant 消息 `stopReason:"error"`，`agent_end.willRetry` 视是否还会重试而定，最终 `agent_end(willRetry:false)` → `agent_settled`，退出码仍然是 **0**（`s04-bad-model` 样本实测：模型名不存在，上游 404，从头到尾没有异常向外抛出，进程干净退出 0）。这意味着守护进程**必须解析事件流里最后一条 assistant 消息的 `stopReason`**，不能只信 exit code。
- **缺 API key**：实测（样本 `s05-no-key`，子进程环境里去掉 `MCGROX_API_KEY`）—— stdout 只有一行 `session` header；纯文本 `No API key found for mcgrox.` 连同登录提示打在 **stderr**；**退出码是 1，不是 0**。这纠正了调研前「退出码为 0」的猜测：源码路径是 `Session.prompt()` 开头 `if(!hasConfiguredAuth) throw new Error(formatNoApiKeyFoundMessage(provider))`（`chunk-4DKZACXI.js`），这个异常没被内部吞掉，一路抛到 `runPrintMode` 最外层 `catch`，走的是「异常」路径而不是「一条 error 消息」路径，所以退出码是 1、消息在 stderr、且是这唯一一种「exit 非 0」的失败形态。
- **通道连接错误**：实测（样本 `s01/s02/s03/s06`）确认 `auto_retry_start` 会连续出现 3 次，`delayMs` 依次是 2000/4000/8000，和调研前的猜测一致。**但和猜测不一致的地方**：3 次重试耗尽后，pi **不会**放弃退出，而是直接开始新一轮 `agent_start`/`turn_start`，重新走一遍「请求失败 → 3 次重试」的循环——样本 `s06-connection-retry-storm` 实测连续 6 分钟出现了 **21 轮** 这种循环才被我们手工杀掉，进程自己完全没有要退出的迹象。**这是本次调研最重要的运维结论**：只要上游连接持续报错，pi 在非交互模式下会一直重试下去，不会自然超时退出。
- **进程被杀**：这是我们自己用 `SIGTERM`/`SIGKILL` 杀的（样本 `s06`、`s07`），Node `child_process` 报告 `code:null, signal:'SIGTERM'`；stdout 文件停在最后一条完整写出的 JSON 行，没有专门的「被杀」事件、也没有截断的半行 JSON（`writeRawStdout` 是排队写入，被杀时机刚好卡在两次 write 之间,所以我们看到的都是完整行）。

---

## 5. 会话控制

会话文件存在 `~/.pi/agent/sessions/<按 cwd 编码的目录>/<ISO时间戳>_<session-id>.jsonl`。目录编码公式（`getDefaultSessionDirPath` 函数，`chunk-4DKZACXI.js`）：

```js
safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`
```

即把绝对路径里所有 `/`、`\`、`:` 都换成 `-`（不合并连续的），再包一层 `--` 前后缀。例如 cwd `C:\Users\zhoutao\AppData\Local\Temp\fleet-scout-pi` 编码后是
`--C--Users-zhoutao-AppData-Local-Temp-fleet-scout-pi--`，和本机 `~/.pi/agent/sessions/` 下实际看到的目录名逐字符对上。**结论：session 天然按 cwd 隔离**，同一个 `--session-id` 换个 cwd 就是另一个 session（`SessionManager.findById` 函数确实是先定位到这个按 cwd 算出来的目录再去里面找 id）。`--session-dir <dir>` 和环境变量 `PI_CODING_AGENT_SESSION_DIR` 都是用来**整体替换**这个自动定位逻辑，优先级是 `--session-dir` > 环境变量 > `settings.json` 里配置的 > 上面的默认公式（`chunk-4DKZACXI.js` 里 `sessionDir=(parsed.sessionDir?...)??(envSessionDir?...)?? startupSettingsManager.getSessionDir()`）。

`--session-id <id>` 精确匹配、不存在就新建（`createSessionManager`/`validateSessionIdFlags` 函数），**不允许**和 `--session`/`--continue`/`--resume` 混用。真实用过的 id 不要求是 UUID，纯字符串也行（本机 `~/.pi/agent/sessions/` 下已经有大量 `lane-E2-audit`、`wA2` 这类自定义 id，说明这个项目里已经在这么用了）。

**续接实测**（样本 `s03-resume`，对同一个 `--session-id` 第二次调用追加新指令）：stdout 事件流里**只有这次新增的 user message**，完全没有把 s02 号调用的历史消息重放一遍——`session.subscribe` 只推送「从这次进程启动之后新发生」的事件，历史消息只是在内部被读进 `session.state.messages` 当上下文用，不会重新经过事件总线。**结论：续接时 json 流不会重放历史，只有新消息**（但历史仍然会被当作上下文发给模型,真实样本里能看到 `cacheRead` 命中之前对话内容）。

`--name <name>` 的显示名**不在** `session` header 那一行里，是单独追加一条 entry（真实样本 `scout-b2` session 文件第 2 行）：

```json
{"type":"session_info","id":"...","parentId":null,"timestamp":"...","name":"scout-b"}
```

补充一个和续接强相关、但任务描述里没直接问到、却直接影响「会不会卡住」的点：`--session <path|id>` （不是 `--session-id`）如果匹配到**另一个项目 cwd** 下的 session，会走 `promptConfirm("Fork this session into current directory?")`——这个函数是真的 `readline.question`，在非交互模式下一样会挂起等 stdin 输入 y/N（`chunk-4DKZACXI.js` 的 `createSessionManager`/`promptConfirm` 函数）。**结论：续接必须只用 `--session-id`，绝不能用裸的 `--session`**，否则一旦模糊匹配跨了项目就会卡死等交互确认。

持久化的 session 文件格式和实时 `--mode json` 输出的事件格式**不是一回事**：文件里每轮对话是一条 `{"type":"message","id":..,"parentId":..,"message":{...最终消息...}}`，用 `id`/`parentId` 连成树（支持 fork/导航），没有 `message_start`/`message_update`/`message_end` 这种事件包装，也不存的流式增量（对比 `s09-success-extract.session.jsonl` 和 `s01/s02/s03` 号样本能看得很清楚)。

---

## 6. 适合苦工的参数

`pi --help` 完整输出已经拿到（未额外抓文件，直接在报告里摘录关键结论），几个和「会不会卡住」直接相关的静态确认：

- **`--system-prompt`/`--append-system-prompt` 都支持文件或文本二选一**：`resolvePromptInput(input, description)` 函数（`chunk-4DKZACXI.js`）——`existsSync(input)` 成立就当文件路径读内容（`stripBom` 去 BOM），不成立就当纯文本用。`--append-system-prompt` 可以传多次，多段之间用 `\n` 拼接。
- **`--exclude-tools` / `--tools`** 都是逗号分隔的工具名，直接对应 parseArgs 里的 `excludeTools`/`tools`，语义就是黑名单/白名单，没有特殊坑。
- **`--thinking <level>`** 合法值 `off/minimal/low/medium/high/xhigh/max`（`VALID_THINKING_LEVELS` 常量），非法值只是打一条 warning 诊断、不会中断进程。
- **`--no-context-files`** 关掉 AGENTS.md/CLAUDE.md 自动发现，`--offline`（等价环境变量 `PI_OFFLINE=1`）关掉启动时的联网操作（比如检查更新）。
- **`--approve`/`--no-approve`** 管的是「信任项目本地资源（本地扩展/配置)」，不是工具执行确认。静态确认：判断要不要弹确认框时用的是 `hasUI: appMode==="interactive"`（`chunk-4DKZACXI.js` 的 trust 解析调用点），也就是设计上非交互模式不会开交互提示；但没能构造一个「确实需要信任确认」的项目目录去动态验证这条路径，稳妥起见守护进程应该显式传 `--no-approve`（苦工工作目录一般不需要信任本地扩展），把这个变量钉死,不依赖默认值。
- **`-p`/`--mode json` 下真正会卡住等输入的两个已验证坑**：
  1. **stdin 不给 EOF 会永久卡住**——`readPipedStdin` 函数只要 `!process.stdin.isTTY` 就会一直等 `end` 事件；`resolveAppMode`/主流程里只要 `parsed.mode!=="rpc"` 就总会调用它（哪怕已经给了 `--mode json -p "文本"`）。实测：`stdio:['pipe',...]` 且不写入/不关闭，15 秒超时到了还没退出，被 SIGTERM 强杀（样本 `s07-stdin-hang-pipe`）；同样的调用换成 `stdio:['ignore',...]`，几秒内正常退出 exit 0（样本 `s08-stdin-ignore-ok`）。**结论：spawn 时 stdin 必须显式设成 `'ignore'`**，留成默认的 `'pipe'` 而不去关闭它，苦工进程会永久挂起。
  2. **裸 `--session` 跨项目模糊匹配会触发 `promptConfirm` 交互确认**（见第 5 节），必须只用 `--session-id`。
- `-p`/`--print` 只会**自动**吞掉紧跟在它后面、且不以 `-`/`@` 开头的**一个**参数当消息（`parseArgs` 函数里 `arg==="--print"` 分支的逻辑）；后面如果还有别的位置参数，会被当成**各自独立的后续 turn**依次 `session.prompt()`，不是拼进同一条消息——如果苦工的完整指令要作为「一条」消息，必须整段作为**一个** argv 元素传（这也是第 2 节强调 argv 完整性的原因）。

---

## 7. 环境变量：MCGROX_API_KEY

`C:\Users\zhoutao\.pi\agent\extensions\mcgrox-provider.ts` 第 11 行：`apiKey: "$MCGROX_API_KEY"`，确认渠道扩展读的就是环境变量 `MCGROX_API_KEY`（模板字符串里 `$NAME` 是 pi 扩展 API 的约定写法，运行时会替换成 `process.env.NAME`）。

用 `reg query HKCU\Environment /v MCGROX_API_KEY`（通过 PowerShell `Get-ItemProperty` 间接查，只判断有没有取到值，没有打印/落盘具体值）确认：**该变量在当前用户级注册表里存在**。同时发现一个操作细节：本次调研用的 PowerShell 工具会话本身在没有显式设置的情况下，`$env:MCGROX_API_KEY` 已经是非空——说明这个会话进程本身是在注册表写入之后才起来的,继承到了。但这不能一概而论：**任何在注册表写入之前就已经在跑的常驻进程（比如守护进程本身,如果它是开机自启动或者长期驻留的）都不会自动看到新写入的用户级环境变量**，必须重启该进程，或者像本次调研一样在 spawn 子进程前显式 `Get-ItemProperty HKCU:\Environment MCGROX_API_KEY` 读出来塞进 `env` 再传给子进程。

---

## 8. 真实样本

样本目录：`C:\code\fleet-studio\.scratch\samples\pi\`，逐个文件说明见该目录下的 `README.md`。这里只说抓取过程中的意外情况：

**mcgrox 网关当天不稳定**：`--provider mcgrox --model deepseek-v4.1-flash` 的补全请求在整个调研窗口期内几乎全部返回 `"Connection error."`（基础 `curl https://www.mcgrox.top/v1/models` 能通，返回 401，说明域名/TLS/路由都没问题，但真正的补全调用几乎全部失败），所以 (a)(b)(c) 三个「正常」样本大多数尝试抓到的是失败重试路径而不是干净的成功回复。按任务里预案的做法：一是保留了这些失败/重试样本本身（价值不小，见第 4 节的核心结论就是从这些样本里读出来的），二是从本机已有的 session 文件里补了一段真实成功的完整对话（样本 `s09-success-extract.session.jsonl`，来自本次调研自己在 `scout-b2` 这个 session 里跑出来的一次真实成功续接，不是别的项目的历史数据）。

**意外发现：调研期间有另一个进程在并发探测同一个东西**。大概在本机时间 16:37–16:39 这几分钟里，`.scratch\samples\pi\` 下 `02-tools`/`03-resume`/`03-resume-a`/`04-bad-model` 这几个文件名被另一个进程也用同样的名字写入，内容和我们自己的输出发生了竞态污染（比如一度在 `04-bad-model.stdout.jsonl` 里混入了对方用假模型名 `definitely-not-a-real-model-xyz`、cwd 带 `-04-bad-model` 后缀、prompt 是 "hello" 的调用记录；`~/.pi/agent/sessions/` 下也确实多出了 `--...-fleet-scout-pi-02-tools--` 等几个不属于我们命令的 session 目录）。该并发进程已于 16:47 停止。处理方式：确认来源并记录后，把当时受污染、无法 100% 确认归属的原始文件全部删除；16:47 之后用新的 `--session-id scout-final1` 和统一的 `s` 文件名前缀重新抓取了一遍 `s02/s03/s04/s05`，本报告和 `README.md` 引用的都是重新抓取后的干净版本，目录里不再保留任何需要甄别归属的历史文件。这很可能是同一个项目下另一个并行 agent 在做几乎相同的调研（连虚构的假模型名风格都很像），值得让用户知道——如果不是故意并行分派的，这可能是一次意外的重复派活。

---

## 给守护进程的建议

**启动命令模板**：

```js
spawn(process.execPath, [cliJsPath,
  "--provider", "mcgrox", "--model", "deepseek-v4.1-flash",
  "--mode", "json",
  "--session-id", laneSessionId,       // 绝不用裸 --session
  "--thinking", "low",                  // 按苦工场景选,off 最省
  "--no-approve",                       // 显式钉死,不依赖默认
  "-p", fullInstructionAsOneArgvElement // 整段一个 argv 元素,不能拼多个
], {
  cwd: workerCwd,
  stdio: ["ignore", "pipe", "pipe"],    // stdin 必须 ignore,否则永久挂起
  env: { ...process.env, MCGROX_API_KEY: keyReadFromRegistryAtStartup },
});
```

**结果判定规则**：不能只看 exit code。逐行解析 stdout 的 JSON：
1. 记录每条 `message_end`/`turn_end` 里最新的 `stopReason`；
2. 看到 `agent_settled` 就认为这次调用「结束」（不管成功失败）；
3. 结束时最后的 assistant `stopReason==="stop"` → 成功；`"error"` → 失败,`errorMessage` 就是失败原因；
4. exit code 只用来判断两种「事件流之外」的情况：非 0 基本等于「缺 key / 参数错误」之类在拿到模型响应之前就中止的情况（stderr 会有人类可读的一行文本）；进程被我们自己按超时杀掉时 code 是 `null`、`signal` 是 `SIGTERM`。

**续接方式**：固定用 `--session-id <稳定的苦工/任务标识>`，同一个 cwd 下用同一个 id 就能续接；续接那次的 stdout 只有新增内容，别指望从里面重放出历史。

**已知坑**（按重要性排序）：
1. **上游连接错误时 pi 会无限重试,自己不会放弃**——实测连续 6 分钟、21 轮 agent 重启还在继续。守护进程必须自己有硬超时,超时就 `SIGTERM`/`SIGKILL`,不能假设 pi 会自然结束。
2. **stdin 留成默认 pipe 而不关闭 = 永久挂起**——必须 `stdio:['ignore',...]`。
3. **绝不能用裸 `--session`**（模糊匹配到别的项目会弹 y/N 确认,非交互模式一样会卡住）,只用 `--session-id`。
4. **多行/带引号/带中文的 prompt 绝不能经过 pi.cmd 或任何 shell:true 路径**——必须直接 spawn `node.exe` + `cli.js`,argv 数组里整段一个元素。
5. `--mode json` 下 exit code 几乎总是 0,包括模型名写错、上游 404 这类「失败」——业务上的成功/失败判定必须落在事件流的 `stopReason`,不能信 exit code。
6. `MCGROX_API_KEY` 这类用户级环境变量对「已经在跑的常驻进程」不生效,守护进程自己重启前手动设置的环境变量不会被继承,必须在每次 spawn 子进程前显式从注册表读一遍再塞进子进程 env。

**没查清的（GAPS，已如实列在报告里,不重复编造)**：一次完整流式成功回复里 `message_update` 精确会有多少行、体积占比多大,因为 mcgrox 网关当天故障没能实测到干净的流式成功样本,只从源码确认了结构（本身就很精简,不会整段重复);`--approve`/`--no-approve` 在真的遇到「需要信任确认的项目」时是否 100% 不阻塞,只做了静态代码路径确认（`hasUI` 门槛）,没能动态构造场景验证;判断「连接错误」是否可重试的完整规则(`isRetryableAssistantError`)只看到了调用点,没有展开函数本体。
