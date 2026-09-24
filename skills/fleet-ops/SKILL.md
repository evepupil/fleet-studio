---
name: fleet-ops
description: 维护 fleet-studio 本身：看服务状态、加模型池、接新通道、改容量和超时、增删角色、配置 pi 和 opencode、排查通道出错和苦工启动失败。当用户说「加个池子」「接个新模型」「fleet 起不来」「苦工全失败了」「通道不通」「加个角色」时使用；主会话日常派活用 fleet-dispatch，用不到这份。Maintain fleet-studio itself: daemon, pools, channels, roles and worker runtimes.
---

# fleet-ops

fleet-studio 是本机常驻的苦工调度站，仓库在 `C:\code\fleet-studio`。这份讲怎么维护它：服务、池子、角色、苦工运行时、排障。派活本身看 `fleet-dispatch`。

## 一、东西都在哪

| 位置 | 内容 |
|---|---|
| `~/.fleet-studio/config.json` | 池子、角色、默认值、端口，改完自动生效 |
| `~/.fleet-studio/daemon.json` | 服务的进程号、端口和本机令牌，命令行靠它找到服务 |
| `~/.fleet-studio/daemon.log` | 服务日志 |
| `~/.fleet-studio/fleet.db` | 项目、苦工、运行三类记录 |
| `~/.fleet-studio/runs/<苦工编号>.<第几次运行>/` | 原始输出 `out.jsonl`、报错输出 `err.log`、解析好的时间线 `timeline.jsonl` |
| `C:\code\fleet-studio\roles\` | 全部角色的提示词，只在这里维护（配置里写成 `builtin:roles/<角色>.md`）；`opencode-agents.json` 是生成 opencode agent 用的开头声明 |
| `~/.config/opencode/agents/` | opencode 的实现、侦察、评审三个 agent，由 `node scripts/install-roles.mjs` 从仓库生成 |
| `C:\code\fleet-studio\skills\` | fleet 系列 skill 的源文件，由 `node scripts/install-skills.mjs` 装进宿主 |

环境变量 `FLEET_HOME` 可以把数据目录换到别处。

## 二、服务

```bash
fleet daemon status      # 进程号、端口、启动时间、数据目录、版本
fleet daemon restart     # 改了代码，或者服务卡住时
fleet daemon stop
fleet open               # 打开看板，默认 http://127.0.0.1:4870
```

- 任何 fleet 命令发现服务没起来都会自动拉起它，平时不用手动启动。
- 起不来先看 `daemon.log`。命令本身找不到（`where fleet` 没结果），到仓库里 `pnpm build` 后运行 `node scripts/install-shims.mjs`。
- 服务只监听本机；会改变状态的接口要带本机令牌，令牌只存在 `daemon.json` 里。
- 服务重启不丢排队；在跑的苦工进程还活着就接着跟踪，接管不了的判失败并写明原因。
- 结束的苦工默认保留 7 天（配置里的 `retentionDays`），到期后记录和输出文件一起清掉。

## 三、池子

一个池就是一条通道上的一个模型，所有项目共用这一份容量。

```bash
fleet pools                          # 各池占用、排队、最近 10 分钟的完成 / 失败 / 重试中
fleet pool set dsf --capacity 15     # 调容量，立即生效并写回配置
fleet pool set dsf --capacity 0      # 暂停放行，在跑的不打断
fleet pool set dsf --per-project 8   # 单个项目最多占 8 个；写 none 表示不限
```

加一个池：在 `config.json` 的 `pools` 里加一项，保存即生效。

```json
{
  "id": "strong",
  "label": "<显示名>",
  "capacity": 5,
  "perProjectCap": null,
  "runTimeoutMin": 60,
  "queueTimeoutMin": null,
  "runtimes": {
    "pi": { "provider": "<pi 里的通道名>", "model": "<模型名>" },
    "opencode": { "model": "<通道>/<模型名>" }
  }
}
```

- `id` 以小写字母开头，只用小写字母、数字和短横线，最长 32 个字符。`capacity` 取 0～500，0 表示暂停放行。
- `runtimes` 至少给一种。只给了 pi 的池，`--runtime opencode` 派不进去。opencode 还能多写一个 `variant` 调推理档位。
- `runTimeoutMin`、`queueTimeoutMin` 写 null 就沿用全局默认（`defaults` 里：运行 30 分钟，排队不限时）。默认池在 `defaults.pool`。
- **容量怎么定**：先按 20 路以内压一遍这条通道（压测数字见 `references/pi.md`），全过再往上加。加并发不会让活变快：通道吞吐是固定的，多开的只是排队。
- **配置写坏了**：服务继续用上一份有效配置，看板顶部会提示错在哪，`daemon.log` 里也有。

## 四、角色

`fleet roles` 列出全部角色。增删改角色只动 `config.json` 的 `roles`，不用改代码；提示词正文写成仓库 `roles/<角色>.md`：

```json
{
  "id": "doc-writer",
  "label": "文档",
  "description": "照任务书写或改文档",
  "pi": {
    "appendSystemPrompt": "builtin:roles/doc-writer.md",
    "excludeTools": ["web_search", "get_search_content", "source_check"]
  },
  "opencode": {}
}
```

- `appendSystemPrompt`：追加到苦工系统提示词后面的文件。`builtin:` 开头指 fleet-studio 仓库根目录，`~` 开头指用户目录。提示词一律放仓库，改完对下一次派活立即生效，不用重启服务。
- 每份提示词末尾都有同样的三条边界：不许再往下派活、不许提交代码、没人会回答它的提问。新写角色照抄这三条。
- `excludeTools` 列出禁用的工具，`tools` 列出只允许的工具。服务直接把参数交给进程，不经过命令行转义，限制一定生效。
- 只读角色至少禁掉 `write` 和 `edit`；不该联网的禁掉 `web_search`、`get_search_content`、`source_check`，连网页也不许抓就再加 `fetch_content`。
- `opencode.agent` 填 opencode 里同名的 agent；不填时，服务把提示词文件的内容拼在任务正文前面。要带权限（例如不许改文件）的角色才需要 agent：在 `roles/opencode-agents.json` 里加一项，再运行 `node scripts/install-roles.mjs` 生成。
- 提示词里要规定固定格式的回报（例如 `SUMMARY / FILES / VERIFY / SELF_REPORT / BLOCKED`，评审用 `VERDICT / ISSUES`），看板和 `fleet wait` 按段落拆开显示，通过和不通过会醒目标出。
- 验证角色的工具限制时，别问模型「你有哪些工具」，让它实际去用那个工具，看做不做得成。

## 五、苦工运行时

服务按池和角色的配置拼好参数，直接拉起苦工进程：不经过 PowerShell 或 cmd，关掉标准输入，补上用户级环境变量（例如通道密钥），输出写进 `runs/`。

| | pi（默认） | opencode |
|---|---|---|
| 资源 | 每路约 110 MB | 每路约 580 MB，CPU 约 9 倍 |
| 续接 | 服务用苦工编号给会话起名，天然对得上 | 第一次运行后从输出里取会话号 |
| 推理档位 | `--thinking` 生效；不指定时用 pi 的全局设置（已设为 max） | 不认 `--thinking`，用池配置里的 `variant` |
| 什么时候用 | 默认 | 用户点名、pi 装不上、要用 opencode 独有能力（内置 LSP、MCP） |

- 可执行文件自动探测；要指定就改 `config.json` 的 `runtimes.pi.command` 或 `runtimes.opencode.command`（写成数组：可执行文件加前置参数）。
- pi 碰到通道持续报错会无限重试、自己不退出。服务在连续 8 次请求失败（约 40 秒）时判「模型或通道出错」并结束进程。
- 单次运行超时（默认 30 分钟）一到，服务结束整棵进程树。

装配、通道和已知的坑：pi 看 `references/pi.md`，opencode 看 `references/opencode.md`。

## 六、排查

先看失败原因（`fleet show <编号>` 或看板），对照这张表：

| 失败原因 | 常见根子 | 怎么查 |
|---|---|---|
| 启动失败 | 找不到 pi / opencode；干活目录不存在 | `where pi`；`config.json` 的 `runtimes.*.command`；派活时 `--cwd` 的目录在不在 |
| 运行时报错 | 缺密钥、参数不对，常见表现是没有任何模型输出就结束 | 看 `runs/<编号>/err.log`；pi 查用户级环境变量 `MCGROX_API_KEY` 和通道扩展文件 |
| 模型或通道出错 | 通道挂了、模型要付费（402）、网关没这个模型的凭证（503）、地址少了 `/v1` | `fleet pools` 看是不是一片在失败；用 references 里的最小命令直接打一次通道 |
| 异常退出 | 苦工进程崩了 | `err.log`，以及 `out.jsonl` 最后几行 |
| 运行超时 | 活太大，或者模型一直没有返回 | `fleet log <编号> --tail 20` 看最后在干什么；几分钟没有任何输出，多半是通道不通 |
| 排队超时 | 池子一直是满的 | `fleet pools` 看谁占着 |
| 服务重启后接管不了 | 服务重启时苦工进程已经没了 | 让主会话 `fleet send` 接着干 |
| 所在的池已被删除 | 排队期间这个池被从配置里删了 | 换池重派 |

- **判定模型不可用之前先重试一次**：冷启动超时、凭证临时不可用，都会伪装成「这个模型坏了」。
- **有些模型回话正常但从不调用工具**，派出去等于空转。新模型先派一条小任务试过，再批量用。
- **长时间无响应**通常是模型别名指向了挂掉的后端，换模型，别原地重试。

## 七、改 fleet-studio 本身

改之前读仓库的 `docs/roadmap.md` 和对应的模块设计文档；门禁是 `pnpm check`。改完 `pnpm build`，再 `fleet daemon restart` 生效。改了 `skills/` 下的 skill，运行 `node scripts/install-skills.mjs` 重新安装；改了 `roles/` 下实现、侦察、评审的提示词，运行 `node scripts/install-roles.mjs` 同步给 opencode（pi 直接读仓库，不用装）。
