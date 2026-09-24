# pi 运行时

fleet 默认的苦工运行时。调研原文在 `C:\code\fleet-studio\docs\调研\pi-运行时.md`，fleet 怎么拼参数见仓库 `docs/模块设计/核心层-运行时适配.md`。

## 装配与自检

```bash
pi --version
pi -p --provider mcgrox --model deepseek-v4.1-flash --no-session "say ok"
```

第二条跑不通，按顺序查：通道扩展文件 `~/.pi/agent/extensions/mcgrox-provider.ts` 在不在；用户级环境变量 `MCGROX_API_KEY` 读不读得到（改过环境变量后，之前打开的终端读不到新值）；最后用 `curl` 直接打网关，确认网关本身通不通。

fleet 拉起 pi 时会自动补上用户级环境变量，所以终端里读不到密钥时，fleet 派出去的苦工照样可能正常。

## 通道

- 通道靠扩展注册，扩展文件放在 `~/.pi/agent/extensions/`。
- **地址必须带 `/v1`**：写成 `https://xxx.com` 而不是 `https://xxx.com/v1`，整条通道会静默变成「找不到」。改完地址一定实际跑一条验证。
- 上下文长度是扩展里估的，报超长就把任务拆细，或者调那个数字。
- 密钥存成用户级环境变量，扩展里写 `$变量名`。fleet 每次拉起苦工前重新读一遍，新设的变量不用重启服务。

| 通道 | 地址 | 扩展文件 | 密钥变量 | 登记的模型 |
|---|---|---|---|---|
| mcgrox | `https://www.mcgrox.top/v1` | `mcgrox-provider.ts` | `MCGROX_API_KEY` | deepseek-v4.1-flash |
| chaosyn（mini-cpa 网关） | `https://mini-cpa.chaosyn.com/v1` | `chaosyn-provider.ts` | `CHAOSYN_API_KEY` | GLM-5.3-Flash、Grok 4.6 |
| snow（朋友自建：vLLM 外面套 new-api 网关） | `https://snow.fcsaidt.de/v1` | `snow-provider.ts` | `SNOW_API_KEY` | qwen3.8-27b |

chaosyn 网关上的 Grok 4.7 和 Grok 4.7 Fast 没登记（2026-09-24 实测）：两个都会丢掉调用方的系统提示词，模型只认网关塞进去的「Claude Code」身份；Grok 4.7 还把工具调用当成正文 JSON 吐出来，十几次里只成功 1 次。Grok 4.6 两项都正常。

snow 是朋友自己机器上的服务，别人也在用，别拿它长时间满载跑大批活。2026-09-24 接入时实测：系统提示词能送到（系统和开发者两种身份都行），工具调用和多轮回传正常；服务端上下文上限 256K，扩展里按 128K 登记；推理档位只认一部分，要翻译（见下一节）。另外两个小现象：不给工具时模型会把工具调用写成正文（苦工总带着工具，不受影响）；本机用 curl 打它要加 `--ssl-no-revoke`，否则证书吊销检查连不上会直接报错（pi 不受影响）。

## 推理档位

- 七档：`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`。
- 全局默认在 `~/.pi/agent/settings.json` 的 `defaultThinkingLevel`，已从 `medium` 改成 `max`：当前苦工模型在低档位下判断力明显不够。
- fleet 派活时 `--thinking <档位>` 覆盖这一次；配置里 `defaults.thinking` 可以统一覆盖。
- **有的服务只认一部分档位，发了不认的直接 400。** 例如 snow 只认 `low` / `medium` / `xhigh` / `none`。模型没写档位对照表时，pi 只放出 `off` 到 `high` 五档，`max` 会被压成 `high` 发出去，撞上这种服务苦工第一个请求就失败。接新模型时拿各档位实打一次（`reasoning_effort` 参数），不认的在扩展的模型里写 `thinkingLevelMap` 逐档翻译：值写服务认的档位名，写 `null` 表示不支持这一档，`off` 对应关思考时发的值。写法照抄 `snow-provider.ts`。

## 联网工具

pi 自带 read / bash / edit / write 四个工具，没有联网。装 `pi-web-access` 补上四个：`web_search`（搜索）、`fetch_content`（抓网页）、`get_search_content`、`source_check`。

```bash
pi install npm:pi-web-access
```

- 不用密钥，默认走 Exa MCP，也支持 DuckDuckGo；顺带能提取 PDF 文字、克隆 GitHub 仓库、取 YouTube 字幕。
- 代价：这四个工具的定义会进每个会话的上下文。所以 fleet 的角色配置按需裁掉：只有侦察和收集能搜索，评审连抓网页都禁掉。
- **插件靠 `~/.pi/agent/settings.json` 里的 `packages` 一项启用。** 改这个文件（例如调推理档位）只改对应字段，别整份重写：2026-09-22 就因为整份重写丢了这一项，此后所有苦工都没有联网工具，侦察只能拿命令行硬抓网页，一直没人发现。`pi list` 列不出 `npm:pi-web-access` 就是丢了，重新 `pi install` 即可。

## 通道容量实测

### mcgrox 的 deepseek-v4.1-flash（池 dsf，容量 20）

| 卡在哪 | 实测数字 |
|---|---|
| 通道 | 裸接口 20 路全过，40 路 92%；吞吐约 3.7 请求/秒 |
| 本机内存 | 每路约 110 MB；10 路峰值 1.16 GB，20 路峰值 1.17 GB |
| 本机 CPU | 10 路累计 17.5 CPU 秒，20 路 18.3 CPU 秒 |

内存和 CPU 远不是瓶颈，天花板是通道吞吐。要更大规模就再接一条独立配额的通道，开成另一个池。

### chaosyn 的 GLM-5.3-Flash（池 glmf，容量 7，2026-09-24）

| 压法 | 结果 |
|---|---|
| 同一时刻打出 4 / 6 / 8 / 9 个带工具的流式请求（9 个压了 3 次） | 全过 |
| 同一时刻 10 个，压了 4 次 | 2 次全过，2 次各被拒 1 个 |
| 同一时刻 11 个、12 个 | 都只放过 9 个，其余返回 429「账户已达到速率限制」（上游错误码 1302） |
| 8 路各自连续发，压 97 秒 | 193 个请求全过，约 2 请求/秒 |

并发上限按 9 算，打八折取 7。单个请求偏慢，一句话要 5～25 秒；经 fleet 派的一条只读侦察连调 25 次工具，2 分 43 秒干完，没有重试。

### snow 的 qwen3.8-27b（池 qwen27，容量 5，2026-09-24）

| 压法 | 结果 |
|---|---|
| 同一时刻打出 4 / 6 个带工具的流式请求（6 个压了 4 次） | 全过 |
| 同一时刻 8 个，压了 5 次 | 4 次全过，1 次掉 1 个 |
| 同一时刻 12 个，压了 3 次 | 2 次全过，1 次掉 2 个 |
| 同一时刻 16 个 | 掉 1 个，其余首字要等 8.5 秒 |
| 5 路各自连续发，压 122 秒 | 159 个请求全过，约 1.3 请求/秒，单个中位 3.5 秒 |

掉的都是网关立刻返回的 500「upstream error: do request failed」，也就是网关连不上朋友的后端，pi 会自己重试。并发上限按 6 算，打八折取 5。首字时间随朋友那边的负载在 1～9 秒之间波动。读上下文约每秒 4000 token（4.8 万 token 第一次要 12 秒），开头相同的再发只要 3 秒，有前缀缓存，苦工多轮对话不会越来越慢。经 fleet 派的只读侦察和写代码各一条，都在 1 分 12 秒左右干完，回报格式对，没有重试。

## 已知的坑

fleet 已经替你绕开的（手动跑 pi 时要自己注意）：

- **多行任务经过 cmd 外壳会在第一个换行处被截断。** pi 在 Windows 上是 `.cmd` 外壳，fleet 直接拉起它的入口，任务原样送达；长任务写成 `task.md` 用 `@文件` 传。
- **标准输入不关会永久卡住。** fleet 拉起时已关闭。
- **json 模式下失败也返回退出码 0。** fleet 从事件流里判定结局。
- **通道持续报错时 pi 会无限重试、自己不退出**，而且一次运行里会反复发出「本轮结束」事件。fleet 在连续 8 次请求失败时判失败并结束进程。
- **`--session` 按名字模糊匹配，跨项目会弹交互确认卡死。** fleet 用 `--session-id fleet-<苦工编号>`。
- **PowerShell 里工具限制不加引号会静默失效**：`--exclude-tools write,edit` 会被拆成数组，pi 只收到第一项。手动跑时要写成 `--exclude-tools "write,edit"`。

仍然要留意的：

- **思考模式的模型可能在多轮工具调用后掉线**，报「思考内容必须在思考模式下回传」。报错是概率性的，一次跑通不代表没问题；换模型后要重新压这个场景。真撞上了，退路是 `--thinking off`。
- **有些模型返回 200 但从不发工具调用**，苦工场景直接废掉。还有的网关把工具调用当成正文 JSON 吐出来，苦工第一轮就收场。
- **有的网关会吞掉调用方的系统提示词。** 角色规矩、回报格式、项目说明都靠系统提示词送进去，被吞了苦工照样干活，只是不守规矩。接新模型时在系统提示词里放一个暗号，让它复述，答不上来就别用。
- **402** 是模型要付费；**503** 是网关没有这个模型的凭证；长时间无响应通常是模型别名指向了挂掉的后端。碰上就换模型，别原地重试。

## 手动跑一次（只用来测通道）

fleet 起不来时，主会话按 fleet-dispatch 第二节改用本家子代理，不要自己拼后台作业批量派 pi。要确认通道本身好不好，跑一条最小任务即可：

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
pi -p --provider mcgrox --model deepseek-v4.1-flash --no-session --exclude-tools "write,edit" "列出当前目录的文件名"
```
