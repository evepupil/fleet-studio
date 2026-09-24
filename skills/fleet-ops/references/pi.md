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

## 推理档位

- 七档：`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`。
- 全局默认在 `~/.pi/agent/settings.json` 的 `defaultThinkingLevel`，已从 `medium` 改成 `max`：当前苦工模型在低档位下判断力明显不够。
- fleet 派活时 `--thinking <档位>` 覆盖这一次；配置里 `defaults.thinking` 可以统一覆盖。

## 联网工具

pi 自带 read / bash / edit / write 四个工具，没有联网。装 `pi-web-access` 补上四个：`web_search`（搜索）、`fetch_content`（抓网页）、`get_search_content`、`source_check`。

```bash
pi install npm:pi-web-access
```

- 不用密钥，默认走 Exa MCP，也支持 DuckDuckGo；顺带能提取 PDF 文字、克隆 GitHub 仓库、取 YouTube 字幕。
- 代价：这四个工具的定义会进每个会话的上下文。所以 fleet 的角色配置按需裁掉：只有侦察能搜索，评审连抓网页都禁掉。

## 通道容量实测（mcgrox 的 deepseek-v4.1-flash）

| 卡在哪 | 实测数字 |
|---|---|
| 通道 | 裸接口 20 路全过，40 路 92%；吞吐约 3.7 请求/秒 |
| 本机内存 | 每路约 110 MB；10 路峰值 1.16 GB，20 路峰值 1.17 GB |
| 本机 CPU | 10 路累计 17.5 CPU 秒，20 路 18.3 CPU 秒 |

内存和 CPU 远不是瓶颈，天花板是通道吞吐。要更大规模就再接一条独立配额的通道，开成另一个池。

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
- **有些模型返回 200 但从不发工具调用**，苦工场景直接废掉。
- **402** 是模型要付费；**503** 是网关没有这个模型的凭证；长时间无响应通常是模型别名指向了挂掉的后端。碰上就换模型，别原地重试。

## 手动跑一次（只用来测通道）

fleet 起不来时，主会话按 fleet-dispatch 第二节改用本家子代理，不要自己拼后台作业批量派 pi。要确认通道本身好不好，跑一条最小任务即可：

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
pi -p --provider mcgrox --model deepseek-v4.1-flash --no-session --exclude-tools "write,edit" "列出当前目录的文件名"
```
