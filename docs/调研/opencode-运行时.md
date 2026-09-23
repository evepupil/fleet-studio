# opencode 运行时调研

调研目的：给「苦工闸门服务」守护进程确定怎么拉起 opencode、怎么读懂它的输出、怎么判断成功失败、怎么续接会话、怎么取消。

调研环境：Windows 11，opencode 全局安装版本 `1.18.4`（npm 全局包 `opencode-ai`），模型用 `mcgrox/deepseek-v4.1-flash`（配置在 `C:\Users\zhoutao\.config\opencode\opencode.json`，本报告不引用其中任何密钥）。源码引用的是 GitHub 上 `anomalyco/opencode`（`sst/opencode` 这个仓库名已经指向同一个仓库，实际组织是 anomalyco，默认分支 `dev`，是比本机装的 1.18.4 更新的开发分支——本报告以「本机实测」为准，源码只用来解释实测现象背后的机制，两者对不上的地方会专门标注）。

样本命名说明：调研过程中发现另一个并发跑在同一台机器上、任务不相关的 agent 也往 `.scratch/samples/opencode/` 这个目录写过文件，文件名恰好撞了（`02-tools`、`03-resume`、`03-resume-a`、`04-bad-model`）。已逐个核对现存文件，把能确认是对方写的、或内容对不上本报告叙述的全部删除，`02-tools` 这个被覆盖过的样本重新抓了一份存成 `s02-tools`（`s` 前缀表示"事故后重抓"）。下文所有样本引用都已经对齐到清理后的文件名，细节见 `.scratch/samples/opencode/README.md`。

---

## 1. 可执行入口：外壳最终启动的是什么

结论：三个外壳文件（`opencode.cmd`、`opencode.ps1`、无后缀的 `opencode`）内容不同但指向同一个目标——都是先定位自己所在目录，再直接调用同目录下 `node_modules\opencode-ai\bin\opencode.exe`，把命令行参数原样转发。没有「JS 启动器再拉原生二进制」这一层，`opencode.exe` 本身就是终点。

- `C:\Users\zhoutao\AppData\Roaming\npm\opencode.cmd`（第 9 行）：
  ```
  "%dp0%\node_modules\opencode-ai\bin\opencode.exe"   %*
  ```
- `C:\Users\zhoutao\AppData\Roaming\npm\opencode.ps1`（第 12/14 行）：`& "$basedir/node_modules/opencode-ai/bin/opencode.exe" $args`
- `C:\Users\zhoutao\AppData\Roaming\npm\opencode`（无后缀，POSIX sh，第 12 行）：`exec "$basedir/node_modules/opencode-ai/bin/opencode.exe" "$@"`

绝对路径（本机）：
```
C:\Users\zhoutao\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe
```

这个 exe 本身不是"又一层 JS 脚本"，而是用 **Bun 编译成的单文件可执行程序**（把 JS 代码和 Bun 运行时一起打包成了一个 173MB 的 PE 文件）。证据：
- `file` 识别为 `PE32+ executable for MS Windows 6.00 (console), x86-64`。
- Windows 文件版本信息：`FileDescription: Bun`，`InternalName: bun`，`OriginalFilename: bun.exe`，`ProductName: Bun`，版本 `1.3.14`。
- 大小 173,875,080 字节（约 166 MB），远超普通 JS 脚本，符合"整个运行时打包进单个 exe"的体积特征。

包信息印证这个结构——`node_modules\opencode-ai\package.json` 的 `bin` 字段：
```json
"bin": { "opencode": "./bin/opencode.exe" }
```
npm 安装时就是照着这个字段生成上面三个外壳文件的，只要这个字段不变，未来升级版本后 exe 的相对路径也不会变。

### 守护进程的推荐写法：不经过 cmd.exe/PowerShell 直接拉起

直接 spawn 这个 `.exe`，不要 spawn 那三个外壳文件（`.cmd`/`.ps1` 都需要解释器，Node 的 `child_process.spawn` 在 Windows 上对 `.cmd` 默认会隐式借用 `cmd.exe`，这正是要绕开的东西；无后缀的 `opencode` 是 POSIX shell 脚本，Windows 原生 Node 也跑不了）：

```js
const { spawn } = require('node:child_process')
const child = spawn(resolvedExePath, argv, {
  cwd: workDir,
  stdio: ['ignore', 'pipe', 'pipe'], // 见第 6 节「已知坑」：stdin 必须显式关闭
  windowsHide: true,
})
```

### 自动探测 exe 路径的方法

两种思路，建议都实现、互为兜底：

1. **首选：解析外壳文件**（对未来 opencode-ai 重构 bin 目录结构也稳）——读 `%APPDATA%\npm\opencode.cmd`（或 `opencode` 无后缀版本）的文本内容，用正则提取其中的 `node_modules\opencode-ai\bin\opencode.exe` 相对路径片段，拼上外壳文件自身所在目录。这个文件很小，读取和解析都是纯文本操作，不需要执行它。
2. **兜底：约定路径探测**——按 npm 全局默认安装位置拼接 `<npm 全局 bin 目录>\node_modules\opencode-ai\bin\opencode.exe`，用 `fs.existsSync` 校验。Windows 上 npm 全局 bin 目录默认是 `%APPDATA%\npm`（即 `process.env.APPDATA + '\\npm'`），除非用户改过 `npm config get prefix`。

两种方法都不需要在守护进程的"每次任务"路径上跑 cmd.exe / PowerShell / npm 命令——只在启动时解析一次并缓存结果。

---

## 2. `opencode run --format json` 事件流结构

来源：本机 `opencode run --help` 输出 + GitHub 源码 `packages/opencode/src/cli/cmd/run.ts`（`anomalyco/opencode` dev 分支）+ 本机实测样本（见 `.scratch/samples/opencode/`）。

### 2.1 总体形态：逐行 JSON（ndjson），不是一次性大对象

每一行是一个独立的 JSON 对象，代表一个事件；行与行用换行分隔（line-delimited JSON）。这是源码里唯一负责写 stdout 的函数决定的（`run.ts` 第 678~691 行，函数名 `emit`）：

```ts
function emit(type: string, data: Record<string, unknown>) {
  if (args.format === "json") {
    process.stdout.write(
      JSON.stringify({ type, timestamp: Date.now(), sessionID, ...data }) + EOL,
    )
    return true
  }
  return false
}
```

也就是说**每一行都必然带 `type`、`timestamp`（毫秒时间戳）、`sessionID` 三个顶层字段**，不需要在事件类型之间猜——`sessionID` 从第一行开始就在，直接拿第一行的 `sessionID` 就能后续用 `--session <id>` 续接，不用额外调用别的命令。

实测样本佐证（`.scratch/samples/opencode/01b-diag.stdout.jsonl`，纯文本回复"已收到"）：
```json
{"type":"step_start","timestamp":1790152078649,"sessionID":"ses_f32a0453dffeUxM35Vg6WbMKUF","part":{"id":"prt_...","messageID":"msg_...","sessionID":"ses_...","type":"step-start"}}
{"type":"text","timestamp":1790152078832,"sessionID":"ses_...","part":{"id":"prt_...","messageID":"msg_...","sessionID":"ses_...","type":"text","text":"已收到","time":{"start":1790152078641,"end":1790152078786}}}
{"type":"step_finish","timestamp":1790152078834,"sessionID":"ses_...","part":{"id":"prt_...","reason":"stop","messageID":"msg_...","sessionID":"ses_...","type":"step-finish","tokens":{"total":15524,"input":523,"output":3,"reasoning":0,"cache":{"write":0,"read":14998}},"cost":0}}
```

### 2.2 事件类型清单

源码里 `emit` 只在这几个地方被调用（`run.ts` 第 725/746/750/754/767/789 行），所以 `--format json` 输出只可能出现下面这几种 `type`，没有别的：

| type | 触发条件（源码位置） | `part`/`error` 里的关键字段 |
| --- | --- | --- |
| `step_start` | 一步生成开始（`part.type==="step-start"`，run.ts:745-747） | `part.id`、`part.messageID`、`part.sessionID` |
| `text` | 一段文本**已经生成完毕**（`part.type==="text" && part.time?.end` 有值，run.ts:753-754；只有结束的文本块才发，不是逐 token 的增量流） | `part.text`（完整文本）、`part.time.start/end` |
| `reasoning` | 推理/思考内容结束，**且必须加了 `--thinking`**（run.ts:766-767，没加 `--thinking` 这段内容不会出现在 JSON 流里，连 stderr 都不会有） | `part.text`、`part.time.start/end` |
| `tool_use` | 一次工具调用**结束**（成功或失败都发，`part.state.status` 是 `completed` 或 `error`，run.ts:724-725；工具"进行中"的中间状态不发） | `part.tool`（工具名）、`part.state.status`、`part.state.input`/`part.state.output`（或 `part.state.error`） |
| `step_finish` | 一步生成结束（`part.type==="step-finish"`，run.ts:749-750） | `part.reason`（`"stop"` 正常结束 / `"unknown"` 上游流中途报错但可续跑）、`part.tokens`（见 2.3）、`part.cost` |
| `error` | 会话级致命错误（`session.error` 事件，run.ts:781-789；或首次 `session.prompt`/`session.command` 请求直接被拒绝，run.ts:855/872） | `error`（原样转发的错误对象，通常含 `name`，可能有 `data.message`） |

**没有**专门的"运行结束"事件类型。判断一次 run 结束不能等某个特定 type，只能靠"进程退出"这个信号（见第 6 节）。

一次多轮工具调用的完整样本（实测，`.scratch/samples/opencode/s02-tools.stdout.jsonl`，见文件本身）按时间顺序是 `step_start → text/tool_use(多次穿插) → step_finish → step_start → text → step_finish → ...`，`step_start`/`step_finish` 成对出现，中间夹文本和工具事件，一次 run 可能有多对。

### 2.3 会话 id、token 用量、费用在哪

- **会话 id**：`sessionID`，每一行顶层都有，第一行就能拿到。
- **token 用量和费用**：在 `step_finish` 事件的 `part.tokens` 和 `part.cost`，**按"这一步"统计，不是整个会话的累计值**——一次 run 若有多个 step（比如工具调用触发的多轮生成），要把所有 `step_finish.part.tokens` 逐项加起来才是这次 run 的总用量。字段形状：
  ```json
  "tokens": { "total": 15524, "input": 523, "output": 3, "reasoning": 0, "cache": { "write": 0, "read": 14998 } }
  ```
  `cost` 是数字（美元），本机样本里始终是 `0`——因为 `opencode.json` 里 `mcgrox` 这个 provider 的模型定义只写了 `limit`（context/output 上限），没写 `cost` 数组，opencode 没有单价信息可算,所以恒为 0；换一个在 `models.dev` 目录里有报价的 provider，这里应该会出现非零值。
  - 如果守护进程需要"整个会话"维度的累计用量/费用（不是单次 run），源码里 `packages/core/src/session/info.ts` 显示会话表本身也存了累计的 `cost`、`tokens_input/output/reasoning/cache_read/cache_write` 字段，可以通过 `opencode export <sessionID>` 或本地 HTTP API（`--attach` 模式下的 `session.get`）拿到,不需要自己在守护进程里从头累加。
- **工具调用**：`tool_use` 事件的 `part.tool` 是工具名（比如 `bash`、`write`、`read`），`part.state.status` 是 `completed` 或 `error`，具体输入输出字段在 `part.state` 下（不同工具字段略有差异，实测样本里能看到 `write`/`read` 工具的实际形状,见 `.scratch/samples/opencode/s02-tools.stdout.jsonl`）。
- **最终文本**：所有 `text` 事件的 `part.text` 按出现顺序拼接（多个 `text` 事件对应多个"文本块",比如工具调用前后各有一段）。
- **出错事件**：`error` 事件,`error` 字段是原样转发的错误对象。要注意:上游流中途抖动导致的"可恢复"错误（比如换了个 provider 响应格式异常）会被识别成 `step_finish.part.reason === "unknown"`,**不会**产生 `error` 事件,run 会自动继续、最终仍可能正常结束;只有请求级/会话级的致命错误才会产生真正的 `error` 事件。
- **怎么判断整次运行结束**：没有专门事件,靠进程退出（stdout 流 EOF + 退出码),见第 6 节。

### 2.4 成功/失败时的退出码

来源：`run.ts` 里所有 `process.exit(1)` / `process.exitCode = 1` 调用点。

- **退出码 0**：正常路径下 Node/Bun 默认退出码就是 0,源码里没有专门"成功就 exit(0)"的调用——只要没触发任何失败分支就是 0。
- **退出码 1**，三种触发路径:
  1. 请求级别直接被拒绝——`session.prompt(...)`/`session.command(...)` 调用本身返回 `result.error`（run.ts:871-874、854-857）,比如模型名不存在。这种情况**不会进入事件循环**,JSON 流里只会有唯一一行 `error` 事件,没有 `step_start`。
  2. 事件循环订阅到 `session.error`（真正的会话级致命错误,不是可恢复的"unknown"收尾）,循环结束后统一在 `finish()` 里把 `exitCode` 设成 1（run.ts:841-842）——哪怕这次 run 前面已经正常吐出了一些文本,只要期间出现过一次这种致命错误,最终退出码也是 1。
  3. 事件循环本身抛异常（`loop(...)` 的 Promise reject,run.ts:835-838),打到 stderr（不是 JSON 事件),退出码 1。
  - 命令行参数本身不合法（比如 `--fork` 没配 `--continue`/`--session`）会在真正开始跑之前就 `process.exit(1)`,这种情况下不会创建任何会话,也不会产生任何 stdout。

---

## 3. 参数

来源：本机 `opencode run --help` 实测输出 + `run.ts` 里的 `.option(...)` 定义（第 143-262 行）。

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `--dir <path>` | 指定运行目录 | 源码里是真的 `process.chdir(...)`（run.ts:339),不是只传给子进程一个"working directory"参数那么简单——它会切换**这个 opencode 进程自己的** cwd。相对路径基于调用时的 `process.cwd()` 解析。 |
| `--agent <name>` | 选择使用哪个 agent | 找不到对应名字、或该 agent 是 `mode: subagent`（不能当主 agent 用）,只会打一条警告然后**回退到默认 agent**,不会报错退出（run.ts:602-618）。默认 agent 是内置的 `build`（有完整工具权限）。 |
| `-m, --model provider/model` | 指定模型 | 格式固定 `provider/model`,用 `/` 切一次,后面部分整体当 modelID（支持 modelID 本身含 `/` 的情况,`pick()` 函数用 `split("/")` 后 `rest.join("/")`,run.ts:31-38)。 |
| `--variant <name>` | 模型变体/推理强度（如 `high`/`max`/`minimal`） | provider 相关,不是所有模型都支持;本机用的 `mcgrox/deepseek-v4.1-flash` 配置里没有声明 variant,未做专门验证。 |
| `--title <text>` | 会话标题 | 不传:如果是新建会话,opencode 会**额外起一次隐藏的小模型调用**（内置 `title` agent）自动生成标题——见第 6 节「已知坑」,这次额外调用本身也可能因为上游不稳定重试、失败（失败不影响主流程,只是标题保持"New session - <时间戳>"这种默认值）。传空字符串 `--title ""` 等价于"截断 prompt 前 50 字当标题"。**建议守护进程总是显式传 `--title`**,免掉这次额外调用。 |
| `--auto` | 自动批准"未被明确拒绝"的权限请求 | 见第 6 节,详细行为在 3.1。有两个隐藏别名效果完全一样：`--yolo`、`--dangerously-skip-permissions`（run.ts:274,三个只要有一个为真就等价于 `--auto`)。 |
| `--format json` | 逐行 JSON 输出 | 见第 2 节。 |
| `--session <id>` / `-s` | 续接指定会话 | 见第 4 节。 |
| `--continue` / `-c` | 续接"最近一个顶层会话" | 找的是 `session.list()` 里第一个 `parentID` 为空的会话（run.ts:492),会跳过子 agent 创建的子会话。 |
| `--fork` | 续接前先分叉 | 必须搭配 `--continue` 或 `--session`,分叉出一个新会话 id,原会话不受影响（run.ts:425-428）。 |
| `--print-logs` / `--log-level` | 把内部日志打到 stderr | 排查问题很有用,`--log-level DEBUG` 能看到每一步在做什么、重试了几次(见第 6 节样本)。**不是 JSON 事件**,是单独一行文本日志格式,守护进程正常解析 JSON 流时不需要开,调试时才开。 |

### 3.1 关键问题：非交互 run 会不会因为权限确认卡住等输入

**不会卡住,不管加不加 `--auto`。** 这是本次调研最重要的结论之一,来源是 `run.ts` 第 801-821 行的权限事件处理逻辑,原文:

```ts
if (event.type === "permission.asked") {
  const permission = event.properties
  if (!sessions.has(permission.sessionID)) continue

  if (auto) {
    await client.permission.reply({ requestID: permission.id, reply: "once" })
  } else {
    UI.println(..., `permission requested: ${permission.permission} (${permission.patterns.join(", ")}); auto-rejecting`)
    await client.permission.reply({ requestID: permission.id, reply: "reject" })
  }
}
```

`opencode run` 自己订阅权限请求事件并**总是**立刻回复——加了 `--auto` 就自动批准（`reply: "once"`),没加就自动拒绝（`reply: "reject"`),两种情况都不会去等真人在终端上按键。区别只是：**不加 `--auto`,模型想做的高权限操作（写文件、跑 bash 等)会被拒绝**,拒绝信息会写一行到 stderr（`permission requested: xxx; auto-rejecting`,这行不是 JSON,不会出现在 `--format json` 的 stdout 里),然后 run 照常继续/结束,退出码不受影响（除非模型因为拿不到工具结果又触发了别的错误)。

另外单独存在一类权限（`question`、`plan_enter`、`plan_exit`——对应模型想反问用户、或想进入/退出"计划模式"),在非交互 run 下从一开始就在权限规则表里被硬编码拒绝（run.ts:430-448,`pattern: "*", action: "deny"`),跟 `--auto` 无关,这三种权限不管加不加 `--auto` 都是拒绝。

补充一点实测发现的细节：一次请求是否真的会走到"问权限"这一步,还取决于当前 agent 自己的权限规则（`~/.config/opencode/agents/*.md` 里的 permission 字段,或者 opencode.json 全局 permission 字段)。本机默认 build agent 的规则表第一条就是"允许全部"（本机长期交互中攒出来的宽松规则),所以本机用默认 agent 测试时,bash/write/read 全部直接放行,连"问"这一步都不会触发——不是 `--auto` 起的作用,是规则表本身就已经允许了。真要看到"没 `--auto` 就自动拒绝"这条路径,需要用一个明确把某权限设成 ask 的 agent,比如用户自己配置的 scout.md（`permission.bash: "ask"`),实测见样本 05。

---

## 4. 续接：`--session <id>` 会不会重放历史

结论：**不会重放,只有新事件。** 续接同一个 `--session <id>`（不带 `--fork`）是往同一个会话 id 里追加一条新消息,不是"重新播放"整个历史给你看。

来源：`run.ts` 第 456-490 行 `session()` 函数——传了 `--session <id>` 且没有 `--fork` 时,直接 `sdk.session.get({sessionID})` 确认存在,然后原样返回**同一个 id**（不创建新会话,也不复制)。之后 `execute()` 里订阅事件流用的是 `client.event.subscribe()`（run.ts:834),这是一个"从现在开始往后"的订阅,不是"从会话创建之初"的回放——历史消息在续接前就已经发生过、已经被订阅者错过了,不会重新推送。所以续接这次进程的 `--format json` 输出里,只会有**这一次追加指令**产生的新事件（新的 `step_start`/`text`/`tool_use`/`step_finish`……),不会看到上一轮的对话内容。

如果需要拿到完整历史（比如守护进程要在看板上展示这个会话从头到尾的对话),得靠 `opencode export <sessionID>` 或者 `--attach` 模式下调 SDK 的 `session.messages` 之类接口,而不是从 `run --format json` 的输出里拼。

`--continue`（不带 `--session`)是"接着最近一个顶层会话"往下续（`session.list()` 里第一个 `parentID` 为空的),同样不重放历史。`--fork` 一旦加上,无论搭配 `--continue` 还是 `--session`,都是先分叉出一个**新**会话 id 再往新 id 里写,原会话完全不受影响。

（实测样本 `03-continue`,用一次真实创建/读取 `hello.txt` 的会话 id 追加一句"刚创建的文件叫什么名字",输出里确实只有这一句追问对应的新事件——`{"type":"text",...,"text":"hello.txt"}`——没有重放前面创建/读取文件的历史事件,而且模型答对了文件名,说明会话上下文在服务端确实保留着,只是没有通过这次 `--format json` 的 stdout 重放出来。印证上述结论。这个样本对应的"母"会话（当时的 `02-tools` 原始抓包)后来被另一个并发跑在同一目录下的 agent 用同名文件覆盖掉了,原始 JSON 没保住,细节见样本 README 的"事故说明";`03-continue` 本身内容经过逐字核对确认干净,继续采信。曾尝试给重新抓取的 `s02-tools` 配一个对应的续接样本,但连续遇到第 6.2 节说的上游连接抖动,多次耗时数分钟未完成而放弃,不影响本节结论——`03-continue` 已经是独立、可信的证据。)

---

## 5. 进程结构

来源：GitHub 源码 `packages/core/src/tool/bash.ts`、`packages/core/src/shell.ts`,本机实测进程树（`.scratch/samples/opencode/06-*`)。

### 5.1 一次 `opencode run` 本身只是一个进程

`run.ts` 第 907-961 行:非 `--attach` 场景下,SDK 客户端的 `fetch` 直接指向 `Server.Default().app.fetch(...)`——这是**进程内函数调用**,不是发真实网络请求,更不是拉一个独立的 `opencode serve` 子进程。也就是说,不带 `--attach` 的 `opencode run` 就是**一个 OS 进程**,没有"每路再起一个常驻子进程"这种结构。

"每路会多起一个子进程"这个说法在**工具调用**这一层是真的,但只在真正调用 shell 类工具的那一刻短暂存在,不是常驻:

- `packages/core/src/tool/bash.ts` 第 158-164 行,`bash` 工具每次调用都会真的 spawn 一个 shell 子进程去执行命令:
  ```ts
  const command = ChildProcess.make(input.command, [], {
    cwd: target.canonical,
    shell,
    stdin: "ignore",
    detached: process.platform !== "win32",
    forceKillAfter: Duration.seconds(3),
  })
  ```
- 用哪个 shell 是探测出来的（`packages/core/src/shell.ts`)：优先级 `pwsh` → `powershell` → git-bash → `COMSPEC`/`cmd.exe`。**本机因为装了 PowerShell 7,实际探测结果是 `pwsh.exe`**,不是 cmd.exe——本机 DEBUG 日志实测：
  ```
  message="shell tool using shell" shell="C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\pwsh.EXE"
  ```
  模型自己也感知到了这一点,实测里它主动执行的是 PowerShell 语法的 `Get-Location`,不是 POSIX 的 `pwd`。
- `detached: process.platform !== "win32"` 说明:**Windows 上这个 shell 子进程不是 detached 的**,它是 opencode.exe 的正常子进程（POSIX 上才会 detach 成独立进程组,因为 POSIX 下 opencode 是靠"杀整个进程组"来做取消的,Windows 不用这个机制)。这对守护进程是好消息——正常父子关系意味着 `taskkill /T /F` 能顺着这层父子关系找到它。
- 每次 `bash` 工具调用默认超时 2 分钟（`DEFAULT_TIMEOUT_MS = 2 * 60 * 1000`),模型可以自己声明更长,上限 10 分钟（`MAX_TIMEOUT_MS`)。超时由 opencode 自己的 `AppProcess` 包一层"先温柔、3 秒后强杀"（`forceKillAfter: Duration.seconds(3)`)。
- 如果 opencode.json 里配了**本地/stdio 类型**的 MCP 服务器（跟本机唯一配的 `cloudmind` 不同,那是 `type: "remote"`,走 HTTP,不会有本地子进程),那种 MCP 服务器会在 opencode 启动时被拉起、常驻整个进程生命周期,是另一种"会多起子进程"的来源,但跟本次调研环境无关,只做提醒。

### 5.2 实测进程树 + `taskkill /T /F /PID` 能否杀干净

样本 `06-cancel`：让模型用 bash 工具执行一个明确会跑十几到几十秒的 PowerShell 睡眠命令,中途从外部对根 PID 发 `taskkill /T /F /PID <root>`,一共做了 4 轮尝试。

**确认的部分（4/4 次一致)**：`taskkill /T /F /PID <opencode 根进程>` 每次都成功、干净地终止了根进程,`Get-Process` 立刻查不到,没有报错。取消这个动作本身是可靠的。

**没能直接肉眼确认的部分**：4 轮尝试里,有 3 轮卡在第 6 节说的上游连接抖动上,进程在拿到第一个 LLM 响应之前就被我等到超时杀掉了,根本没跑到调用 bash 工具那一步,自然也谈不上观察子进程。只有 1 轮（`--log-level DEBUG` 打开时)在 stderr 里等到了 `shell tool using shell` 这行日志,证明确实已经在派发 bash 调用了;但那一轮里,无论用 `Get-CimInstance Win32_Process -Filter "ParentProcessId=<root>"` 按父进程 id 查,还是用 `Get-CimInstance Win32_Process | Where-Object ParentProcessId -eq <root>` 整表过滤查,连续多次轮询都没查到任何子进程——即使按流程推算子进程这时应该正在睡眠、活得好好的。同一轮里 `taskkill /T /F` 之后再看,系统上也没有残留的 `pwsh.exe`。

这个"查不到子进程"更像是本次调研所在的沙箱化 agent 执行环境本身对进程树可见性的限制（这层环境自己的 TEMP 路径也带着一层 `codeg-acp` 包装,像是运行在某种受限或虚拟化的进程命名空间里),而不是 `taskkill /T` 机制失效的证据——因为:
- 源码层面,`detached: process.platform !== "win32"` 已经说明 Windows 上这个子进程是正常（非 detached）父子关系,这正是 `taskkill /T` 能够沿着进程树杀下去所依赖的机制。
- 4 次尝试里根进程的 taskkill 本身从没失败过,side-channel 观察不到子进程,并不代表子进程不存在或杀不掉,更可能是我这次没能在正确的窗口期用正确的方式捕捉到它。

**结论对守护进程的意义**：`taskkill /T /F /PID <root>` 杀根进程这件事可以放心依赖,这是本次调研里唯一经过 4/4 次重复验证的动作;但"连带杀干净 bash 工具当时那一个 shell 子进程"这一步,本次没能在实测里直接、干净地拿到肉眼可见的证据,只有源码层面的强支持。**建议**：守护进程上线前,在真实（非本调研这种沙箱)环境里用 Process Explorer 或 `Get-CimInstance`/`Get-Process` 手动跑一次"长 bash 命令 + 取消"的验证,并且不管这一步验证结果如何,取消后都应该扫一遍有没有残留的 `pwsh.exe`/`cmd.exe`/`powershell.exe`作为兜底自愈(定期清理孤儿 shell 进程),而不是完全信任 `/T` 一定杀干净。

---

## 6. 已知坑

这一节是专门写给实现守护进程的人看的,每条都在本机踩过、有实测样本或源码支撑。

### 6.1 spawn 时 stdin 不显式关闭,可能在真正开始跑之前就卡住

来源：`run.ts` 第 416 行：
```ts
const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
```
只要 stdin 不是 TTY（守护进程 spawn 出来的子进程 stdin 必然不是 TTY),opencode 就会去**读完整个 stdin 直到 EOF**,当成"追加在命令行 prompt 后面的管道输入"。Node 的 `child_process.spawn` 默认给子进程一个开着但没人写、也没人关的 stdin 管道——如果守护进程照默认配置 spawn,这一步会一直等一个永远不会来的 EOF,**在会话创建、在第一次调用模型之前就卡死**,而且这时候进程不消耗 CPU、也没有任何 stdout/stderr 输出,表面看起来跟"网络在重试"完全无法区分,很容易误判成别的问题。

**必须做**：spawn 时显式把 stdin 设成 `'ignore'`（Node `stdio: ['ignore', 'pipe', 'pipe']`),或者传一个已经关闭/空的输入。本报告的实测样本能跑通,都是因为显式把 stdin 重定向到一个空文件;第一次没这么做的样本（`01-text`)就卡了 206 秒,最后是外部强杀的（见 `01-text.meta.txt`,`exitCode: 1`,`durationMs: 206264`)。

### 6.2 本机这个 mcgrox 网关本身不稳,opencode 的内部重试不能替代守护进程自己的超时预算

实测中,同一个"只回复两个字"级别的极小任务,多次运行耗时从 4 秒到 280 秒不等,差异全部来自上游 `AI_APICallError: Cannot connect to API: The socket connection was closed unexpectedly` 这类连接抖动,不是 opencode 本身的问题——`--print-logs --log-level DEBUG` 能看到它在内部自动重试（`AI_RetryError: Failed after 3 attempts`），重试等一等又能继续往下跑。这跟"opencode 会不会卡死"是两件事,但结果一样麻烦：**守护进程如果只在进程层面等,不设自己的墙钟超时,一个本该几秒完成的任务可能实际跑几分钟**,拖垮并发容量。

**建议**：守护进程自己按任务类型设一个硬超时（比如普通任务 2~3 分钟,允许跑长 bash 命令的任务更长),超时了直接 `taskkill /T /F` 掉,不要指望 opencode/上游 provider 的重试机制会在合理时间内收敛。

### 6.3 不传 `--title` 会多一次隐藏的小模型调用

新建会话时如果没给 `--title`,opencode 会额外起一次内置的 `title` agent 调用（本机 DEBUG 日志实测：`stream providerID=mcgrox modelID=deepseek-v4.1-flash ... small=true agent=title`)去自动生成标题,这次调用本身也要走一遍网络,遇到本机这种不稳定网关时同样会重试、变慢（实测里这次调用还失败过,`AI_RetryError: Failed after 3 attempts`,失败了也不影响主任务,只是标题保持默认的"New session - <时间戳>")。**守护进程应该总是显式传 `--title`**,把这次多余的调用省掉。

### 6.4 强制 kill 之后,stdout 里已经发生的事件可能没落盘

样本 `06-cancel` 的其中一轮：DEBUG 日志已经打到"shell tool using shell"（证明至少已经进了工具调度这一步),但强杀之后重定向出来的 stdout 文件是完全空的,一行 JSON 都没有——正常结束的样本（`01b-diag`、`s02-tools` 等)哪怕更早的事件,也都完整落盘。这说明**强杀和正常退出之间,stdout 是否已经刷到管道/文件不是同一回事**:被强杀的那次运行,内部可能已经真的做了不少事,但外部通过 stdout 观察到的记录可以是空的。**建议**：守护进程取消一个任务后,不要指望能从它的 stdout 里读到"跑到哪一步"的完整记录作为存档,该展示"已取消"就直接展示"已取消",不要试图从可能不完整的尾部输出去猜。

### 6.5 权限规则表是叠加的,不能只看 `--auto`

`--auto` 只决定"没有被规则表明确处理的权限请求"要不要自动放行;如果目标机器的 `~/.config/opencode/opencode.json` 或具体 agent 的 `permission` 字段已经写了 `allow`/`deny`,`--auto` 根本没有机会起作用（本机默认 `build` agent 就因为长期交互攒出了一条"允许全部"的规则,实测里 bash/write/read 全部直接通过,连"问"这一步都没触发)。**部署到新机器/新 agent 配置时,不能假设"加了 `--auto` 就等于什么都能做、不加就等于什么都做不了"**,实际行为取决于当时那台机器、那个 agent 的规则表叠加结果。

### 6.6 本地/stdio 类型的 MCP 服务器会常驻整个进程生命周期

本机 `opencode.json` 里唯一配置的 `cloudmind` 是 `type: "remote"`（走 HTTP,不会有本地子进程),所以本次调研没有直接观察到这一种。但源码和文档都表明,如果配置的是本地/stdio 类型的 MCP 服务器,opencode 会在启动时把它拉起来、常驻直到 opencode 自己退出——部署到会配置本地 MCP 服务器的环境时,这也是"一次 run 可能不止一个进程"的来源之一,取消时同样要靠 `taskkill /T /F` 覆盖到。

---

## 给守护进程的建议

**启动命令模板**（Node,不经过 cmd.exe/PowerShell)：
```js
const { spawn } = require('node:child_process')
const child = spawn(resolvedExePath, [
  'run', '--format', 'json', '--auto',
  '--dir', workDir,
  '-m', 'provider/model',
  '--title', taskTitle,        // 总是显式传,见 6.3
  ...(sessionID ? ['--session', sessionID] : []),  // 续接时带上,见第 4 节
  promptText,
], {
  cwd: workDir,
  stdio: ['ignore', 'pipe', 'pipe'],   // stdin 必须 ignore,见 6.1
  windowsHide: true,
})
```
- `resolvedExePath` 用第 1 节的方法解析并缓存,不要每次任务都重新探测。
- 逐行解析 `child.stdout`（按 `\n` split),每行 `JSON.parse`,按第 2 节的 `type` 分派;`sessionID` 从第一行拿。
- 用 `child.stderr` 只做诊断日志留存,不参与"是否成功"的判断（除非开了 `--print-logs`,否则正常情况下这里基本没东西;唯一常规内容是不加 `--auto` 时的 permission-reject 提示行)。

**结果判定规则**：
- 唯一权威信号是**进程退出**（`close`/`exit` 事件 + 退出码),不要等某个特定 JSON 事件类型当"结束"标志（没有这种事件,见 2.2/2.4）。
- 退出码 `0` 且期间没出现过 `type: "error"` 事件 → 判定成功。
- 退出码非 `0`,或者期间出现过至少一次 `type: "error"` 事件 → 判定失败,`error` 事件的 `error.data.message`（如果有)可以直接展示给人看。
- `step_finish.part.reason === "unknown"` 只是"上游抖了一下但恢复了",不算失败,不要单独拿这个当失败信号。
- token 用量/费用：把这次运行所有 `step_finish.part.tokens` 按字段（`input`/`output`/`reasoning`/`cache.read`/`cache.write`)累加,`cost` 同理累加;不要只看最后一条 `step_finish`。

**续接方式**：记住第一行事件的 `sessionID`,下次用 `opencode run --session <id> --auto "<追加指令>"` 续接。续接这次的 `--format json` 输出只有新事件,没有历史;如果看板需要展示完整历史,用 `opencode export <sessionID>` 单独取,不要依赖 run 的实时输出拼历史。

**取消方式**：直接 `taskkill /T /F /PID <opencode 根进程 PID>`。这个动作本身可靠(本次 4/4 次验证);但按 5.2 节的说明,建议再加一道兜底——取消后扫一遍系统里有没有残留的 `pwsh.exe`/`powershell.exe`/`cmd.exe`（尤其是命令行里带着这次任务特征的),定期清理,不要百分百信任 `/T` 一定把所有孙进程都杀干净。

**已知坑清单**（详见第 6 节）：stdin 必须 `ignore`;要有自己的墙钟超时,不能依赖 opencode/上游的内部重试;总是传 `--title`;取消后的 stdout 不代表完整记录;权限行为取决于目标机器当时的规则表叠加结果,不能只看 `--auto`;本地 MCP 服务器会常驻额外进程。

---

