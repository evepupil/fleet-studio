# Conductor 调研：多路编码 agent 的并行工作区与交付闭环

调研日期：2026-09-26（以下链接均为当日实际访问、实际读到页面内容）
调研对象：https://www.conductor.build/ 及官方文档 https://www.conductor.build/docs
性质：需求方向调研。取证以官网、文档站、定价页、条款页为准；未爬全站、未读源码、未看 issue 区、未装客户端、未实测。

**当前形态（先说边界）**：官方自述是 **Mac 桌面应用 + Conductor Cloud + Multiplayer 多人协作**的组合，非单一本地单人工具。llms.txt 原文 "**Conductor is a Mac app that lets you run many coding agents in parallel on your codebase.**"（https://www.conductor.build/llms.txt ，2026-09-26）；官网首页同时写 "**Conductor is now _multiplayer_**"（共享 workspace 链接、看谁在线、实时共同 prompt agent）与 "**A cloud sandbox for every agent.**"，并称可从 desktop app、mobile 或自有集成走 Conductor API（https://www.conductor.build/ ，2026-09-26）。故**本地工作区**与**云端/多人工作区**是两条并行入口，下文分别标注。

**去混淆**：对象是 **conductor.build**，运营方 **Melty Labs, Inc.**（Delaware），与 Netflix 的 Conductor 工作流引擎无关。条款原文 "is by and between Melty Labs, Inc., a Delaware corporation … ("Conductor")"（https://www.conductor.build/terms ，2026-09-26）；条款称 Platform 为 "Conductor's proprietary hosted AI automation software platform"，官网未见公开仓库，故按**闭源商业软件**记录（未找到许可证文件）。

---

## ① 产品身份与官方链接

文档首页定位原文："Conductor lets you run Claude Code, Codex, Cursor, and OpenCode in parallel. Each task gets its own workspace, branch, files, terminal, diff, and review path."（https://www.conductor.build/docs ，2026-09-26，**官方文档原文**）

| 项 | 内容 |
|---|---|
| 官网 | https://www.conductor.build/ |
| 文档站 | https://www.conductor.build/docs |
| 全量索引 | https://www.conductor.build/llms-full.txt（约 378KB） |
| 定价 | https://www.conductor.build/pricing |
| API | https://api.conductor.build/v0 ；文档 https://www.conductor.build/docs/api |
| 运营主体 | Melty Labs, Inc.（Delaware），https://www.conductor.build/terms |
| 许可证 | 未见公开仓库；条款称 proprietary，未找到许可证文件 |

**商业与免费边界（定价页原文）**：

| 档位 | 价格 | 关键差异（原文摘录） |
|---|---|---|
| Free | $0 | "Run multiple coding agents in parallel"、"Local workspaces on your Mac"、BYO 订阅与密钥 |
| Pro | $50/mo | Cloud 工作区、Multiplayer（最多 5 个 Pro 用户）、Conductor API、mobile app |
| Teams | $60/mo/user | 任意规模团队实时协作、Admin portal、集中计费 |
| Enterprise | Custom | SAML SSO / SCIM、DPA、SLA 与专属支持 |

来源：https://www.conductor.build/pricing ，2026-09-26。补充：Cloud 目前"不额外收费，但计划未来按用量计费"——"Not right now, but we plan to introduce usage-based pricing for cloud compute in the future."；Team 档目前 "invite-only"（https://www.conductor.build/docs/cloud/faq ，2026-09-26）。

**推理成本**：不带模型额度，走 BYO——"you can use your own subscriptions, API keys, or both in cloud workspaces"（同上）。

**口径冲突（未核实原因）**：FAQ 有与定价页不一致的旧文 "Right now we don't [charge]… making Conductor an amazing free tool"（https://www.conductor.build/docs/faq ，2026-09-26）。同站既有免费工具口径又有 $50/$60/Enterprise 定价，**差异原因本轮未核实**。

---

## ② 目标用户与实际工作流程

**目标用户**：同时用多个 AI 编码 CLI（Claude Code / Codex / Cursor / OpenCode）的个人与团队；官方称其为 "AI-managers"，自称在做 "the AI orchestrator" 品类（https://www.conductor.build/llms-full.txt 官方博文，2026-09-26，**官方宣传，未核实**）。

**流程（本地/云端共用同一套 chat/diff/git/terminal/PR）**：

1. **开空间**：`Command Shift N`（或 New workspace 旁 `...`）从分支、PR、GitHub issue 或 Linear issue 建 workspace。"The workspace is the unit of delegation. The branch and pull request are the unit of integration."（https://www.conductor.build/docs/concepts/workflow ，2026-09-26）
2. **执行**：workspace 内跑 Claude Code / Codex / Cursor / OpenCode，或用 IDE 打开；各有独立文件、分支、进程与 agent 上下文。**云端** workspace 的 agent 跑在 Vercel sandbox 内，关掉 Mac 应用仍继续（https://www.conductor.build/docs/cloud/faq ，2026-09-26）。
3. **验证**：终端、Run 按钮或 Spotlight testing 跑起来看。
4. **Diff/预览**：`Command Shift D` 开 Diff Viewer 逐文件看，可在代码行留评论，**评论变成 composer 附件直接发回给改代码的那个 agent**（https://www.conductor.build/docs/reference/diff-viewer ，2026-09-26）。
5. **PR/合并**：`Command Shift P` 建 PR，可用 agent 起草描述、回应评审、修失败检查。Checks tab 汇总 git status、CI、部署、评论线程、todos（https://www.conductor.build/docs/reference/checks ，2026-09-26）。
6. **归档**：Archive 后 workspace 从侧边栏消失；可在 **History** 面板恢复，**含聊天历史**（https://www.conductor.build/docs/concepts/workflow 、https://www.conductor.build/docs/troubleshooting/issues ，2026-09-26）。

**多人维度（Multiplayer，属 Cloud organization）**：成员可打开同一 workspace 与 chat、看谁在线、实时看到同一 chat 的新输出、follow 别人的 workspace、用 **Reassign to** 转给队友（https://www.conductor.build/docs/cloud/collaboration ，2026-09-26）。**本地 workspace 是否也支持共享，本轮未找到说明，未核实。**

---

## ③ 看板 / 任务层级 / 智能体角色与协作

**看板：本轮公开文档未找到，未核实。** 公开信息架构是**侧边栏（Pinned / My workspaces / Team / Following）+ Home 视图**，Home 只列三个筛选："**By**（队友或 Anyone）、**In**（一个或多个项目）、**Archived**"（https://www.conductor.build/docs/cloud/collaboration ，2026-09-26）。全量文档（llms-full.txt，约 378KB）检索 `kanban`/`board`/`backlog`/`sprint`/`priority` **零命中**（本地 grep，2026-09-26）。**未命中只说明这份公开文档没出现，不能证明产品内不存在看板、优先级或状态列**——未装客户端、未看 changelog 与 issue 区、未实测；更上层聚合（epic/milestone 等）同样**未核实**。

**任务层级（官方定义；各层关系并不都是 1:1）**：

| 层级 | 官方定义 | 官方给出的关系 |
|---|---|---|
| Project | 代码库条目，持有 Repository Settings、脚本、指令与 workspace 列表 | 1 project 含 1 repository（**官方原文如此，未实测**） |
| Repository | 背后的 Git 代码库 | **1 repository 含多个 workspace** |
| **Workspace** | 一个任务/issue/实验/PR 的隔离副本 | **1 workspace = 1 branch** |
| Branch | workspace 内检出的分支，通常是评审与 PR 单位 | 1 branch 对应 1 working tree |
| Working tree | 磁盘文件（Git worktree 实现） | 属于 1 个 workspace |
| Running environment | workspace 内跑的 app、server、watcher、测试 | 1 workspace 可跑多进程 |

来源：https://www.conductor.build/docs/concepts/workspaces-and-branches ，2026-09-26。

**可确认**：一个仓库下可有多个 workspace，**每个 workspace 有自己的分支与工作目录**；故不采用"整条链 1:1、一个项目只能一个 workspace"的说法。branch 的硬约束只有一条："A branch can only be checked out in one workspace at a time."（同上）。

**智能体角色：本轮公开文档未找到角色/职责体系，未核实。** 公开可选项只有 harness（Claude Code / Codex / Cursor / OpenCode）+ 会话级模式开关（Plan Mode、Fast Mode、推理等级、Codex personality/goals）（https://www.conductor.build/docs/concepts/agent-modes ，2026-09-26）。harness 能力不同，如 Plan Mode 仅 Claude Code 与 Codex 支持，Cursor 与 OpenCode 标为 "Not supported"（同页）。

**多个 agent 的组织方式：官方给的是二选一决策，非内置协作协议**（https://www.conductor.build/docs/concepts/parallel-agents ，2026-09-26）：

- **多 workspace**（独立分支/PR，可独立归档或丢弃）——独立 feature、可分别上线的 bug fix、issue fanout、可能丢弃的实验；
- **同 workspace 多 agent**（共享同一分支与代码状态）——一个实现另一个评审同一 diff、一个改完另一个修测试、开 PR 前多 agent 评审。

官方点明同 workspace 的代价："agents in the same workspace can edit the same files."

agent 间是否真正互相通信：公开文档只找到一条 opt-in 实验路径——Settings → Environment 加 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 启用 Claude Code 实验性 agent teams（https://www.conductor.build/docs/faq ，2026-09-26），但**官方未描述开启后如何协作，未核实**。其余"多 agent 协同"在公开文档中表现为外部 agent 经 API 编排（见⑤），**是否另有内置协作机制未找到、未核实**。

---

## ④ 隔离、交付物、评审与人工接管

**隔离机制**：用 Git worktree 给每个 workspace 一份独立 branch + working tree；新 workspace 基于 base branch（如 `origin/main`）且**先 fetch origin**，故总从最新远端提交开始（https://www.conductor.build/docs/concepts/workspaces-and-branches ，2026-09-26）。

**关键边界（原文）**："Workspace isolation is development isolation, not a security boundary. Agents and commands still run on your Mac with your user permissions."（同上，讲本地 workspace）FAQ 补充本地 agent "run directly on your system without sandboxing"，建议跑在专用机器或 VM 上（https://www.conductor.build/docs/faq ，2026-09-26）。云端 workspace 则跑在 Vercel 托管的隔离 Linux sandbox 内（https://www.conductor.build/docs/reference/security-and-permissions ，2026-09-26）。

**交付物与暂存区**：每个 workspace 有 `.context` 目录放**不提交**的笔记与交接材料（"Notes and handoffs can live in the workspace's `.context` folder without being committed"）；耐久约定放 `AGENTS.md` / `CLAUDE.md` / Repository Settings / skills（https://www.conductor.build/docs/reference/agent-behavior ，2026-09-26）。

**评审**：公开文档描述为两层——机器评审用 `Review` 动作（一个 agent 评另一个的 diff），人工评审用 Diff Viewer；GitHub review 评论也汇入 Conductor 与 Checks tab（https://www.conductor.build/docs/reference/diff-viewer 、https://www.conductor.build/docs/concepts/workflow ，2026-09-26）。

**人工接管与合并闸门**：Todos 页原文 "Conductor blocks unfinished work so a workspace does not merge while known tasks are still open"；Checks 页原文 "Conductor may block or discourage merge actions when required work is still open, such as unresolved todos or failed checks."（https://www.conductor.build/docs/reference/todos 、https://www.conductor.build/docs/reference/checks ，2026-09-26）。两处措辞强度不同（一处 blocks，一处 may block or discourage），**属界面流程约束，实际强制程度（能否绕过、何时只是提示）本轮未实测、未核实**。团队维度的人工接管是 **Reassign to**（https://www.conductor.build/docs/cloud/collaboration ，2026-09-26）。

---

## ⑤ 失败恢复、预算/权限边界

**失败恢复（公开文档多条路径）**：

- **Checkpoints**：每次 agent 回复前把工作分支状态快照进私有 Git ref；悬停消息点 revert 可回到之前轮次。代价原文："Clicking the revert icon will **permanently delete** all user and AI messages from the selected turn and later."（https://www.conductor.build/docs/reference/checkpoints ，2026-09-26）。
- **卡住/等输入/要权限**：侧边栏显示 session 需输入；处置顺序为等命令跑完 → 看是否在等审批 → 取消当前回复 → 用明确下一步重开消息 → 状态混乱就新开 chat 或用 checkpoint（https://www.conductor.build/docs/troubleshooting/issues ，2026-09-26）。
- **归档恢复**：History 面板恢复 workspace 及聊天历史；路径被外部移动/删除则可能无法打开，只能从 branch 或 PR 重建（同上）。

**预算与硬性时间边界（云端 workspace）**：

- **Cloud sandbox 寿命**：4 小时无活动则 sleep；**无论是否活跃，每个 sandbox 在 23 小时 50 分被强制停止**——"every sandbox stops at its maximum lifetime of 23 hours and 50 minutes, even if active — which can interrupt running processes and agent turns"（https://www.conductor.build/docs/cloud/working-with-cloud-workspaces ，2026-09-26）。
- **Sandbox 规格**：8 vCPU / 16 GB RAM / 32 GB 临时 NVMe，Amazon Linux 2023，us-east-1，基于 Vercel Sandbox（https://www.conductor.build/docs/cloud/faq ，2026-09-26）。
- **Token 预算**：公开文档仅见 Codex goals 支持——goal bar 显示目标、状态与 token 用量，可暂停/恢复/编辑/清除；且 "Cloud workspaces do not support goals yet."（https://www.conductor.build/docs/concepts/agent-modes ，2026-09-26）。**是否有面向 workspace 或组织的统一预算上限，本轮未找到，未核实。**

**权限边界**：本地 agent 拥有与用户账户相同权限，部分工具调用会先请求审批；云端 agent 在 sandbox 内读写文件、跑命令，并可（开启权限后）操作你本地机器（https://www.conductor.build/docs/reference/security-and-permissions ，2026-09-26）。

**数据边界**：本地会话数据留在本机、Conductor 不访问；**云端会话 chat 消息存在 Conductor 服务器上**——"chat messages from cloud workspaces are stored on Conductor's servers."（https://www.conductor.build/docs/cloud/faq ，2026-09-26）。官方宣称持有 SOC 2 Type II（同页，**官方声称，未核实**）。

**经 API 的外部编排**：API v0 处于 beta，可 `POST /v0/workspaces` 建空间、`POST /v0/sessions/{id}/messages` 下任务、轮询 status 监督、`POST /v0/routines` 用 webhook 触发。官方给出「把外部 agent 变成我的 Conductor manager」提示词，以及 Plan/Implement、**Implement a multi-PR task**（拆任务→并行开多 workspace→分别监督→汇总表格）、Daily Report（只读 SQL 视图 `session_transcripts_view` 汇总过去 24 小时）等模板（https://www.conductor.build/docs/api ，2026-09-26）。这是**用提示词让另一个 agent 驱动 API**；官方亦提醒 "**Always pass an explicit `model`**"、"**Wait for `working` before trusting `idle`**"。Routine 的 webhook URL 是唯一凭证——"anyone who can POST to it can run the routine, and no other authentication is checked"（同上）。**公开文档未见内置多 agent 调度器说明；是否另有编排方式未找到、未核实。**

---

## ⑥ 可借鉴三点 / 不宜借鉴两点

**可借鉴**：

1. **"workspace = 委派单位，branch + PR = 集成单位"**：把"一个任务"与"一条可评审的分支"绑定，天然获得隔离、独立评审、独立归档/丢弃；fleet-studio 的看板卡片可照此设计，卡片背后是一份独立工作目录 + 一条分支，而非共享 checkout 的多 agent 混战。
2. **决策框架而非功能清单**：官方给取舍表（可独立上线→多空间；同一分支要评审/修测试→同空间）并写出代价，这种"给判据 + 给代价"的写法适合写进需求文档。
3. **合并前检查聚合与不提交暂存区**：Todos + Checks tab 把 git/CI/部署/评论/todos 收在一处作最后一道人工关；`.context` 放不入库的笔记与交接。两点可作机制候选，**具体强制效果未实测**。

**不宜借鉴**：

1. **它的"多 agent 协作"在公开文档中表现为外部 agent 轮询 API**，而非产品内调度器。官方模板要求管理者 agent 每 15 秒~2 分钟轮询 status、读增量消息、手工纠偏，还提醒 `idle` 早于 `working` 不可信。把编排降级成"另一个 agent 拼命轮询 HTTP"会带来延迟、重复动作与不可观测性——fleet-studio 宜做事件驱动 + 状态机。（**未核实是否另有内置调度器。**）
2. **公开信息架构中未见看板与跨任务统一任务层级视图**（本轮未找到，未核实）。Home 仅有 By/In/Archived 三个筛选；而 fleet-studio 需要 backlog/优先级/泳道/跨仓库视图这些在 Conductor 公开文档中未见的东西。故不宜照抄其信息架构，可借其工作区与闸门模型。

**多端入口边界（分开写，避免误判）**：

- **桌面客户端**：安装页原文 "**Conductor is not available for Windows or Linux yet.**"，安装后还要检查本机 GitHub 认证（`gh auth status`）与 agent 登录（`claude /login`、`codex login`、Cursor API key）（https://www.conductor.build/docs/installation ，2026-09-26）。**本地 workspace 这条路目前限 macOS，对当前 Windows 环境是硬约束。**
- **云端 workspace**：跑在 Vercel 托管的 Linux sandbox 上，agent 可在你关闭应用后继续工作；本地工具可通过 SSH 或文件同步接入（https://www.conductor.build/docs/cloud/faq 、https://www.conductor.build/docs/cloud ，2026-09-26）。但**公开文档中创建与管理云端 workspace 的入口仍是 Mac 应用；能否在 Windows 上仅用 API/浏览器操作，本轮未核实。**
- **API / mobile**：官网首页称 "Conduct from anywhere. Conduct from the desktop app, mobile, or your own integrations to the Conductor API."（https://www.conductor.build/ ，2026-09-26），定价页把 mobile app 列入 Pro（https://www.conductor.build/pricing ，2026-09-26），但 Cloud FAQ 一处写 "our mobile app (coming soon)"（https://www.conductor.build/docs/cloud/faq ，2026-09-26）——**mobile 是否已可用存在口径差异，未核实**。

**结论**：不应把 Conductor 概括为"纯 Mac 单人工具"。更准确：**桌面客户端（本地 workspace 入口）限 macOS；云端 workspace 与 Multiplayer 多人协作是其并行能力；另有 API 与（口径待核的）mobile 入口。**

---

## 未核实 / 未发现（不得当作不存在）

- **未找到（非"不存在"）**：看板、优先级字段、状态列/泳道、更上层任务层级、agent 角色体系。依据仅为公开文档关键词零命中 + 相关页面通读；**未命中不能证明产品内不存在**（未装客户端、未看 changelog 与 issue 区、未实测）。
- **未核实**：Todo/Checks 对合并的实际强制程度（官方一处 blocks、一处 may block or discourage），能否绕过。
- **未核实**：是否有内置多 agent 调度器或 agent 间通信协议（除 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 一句外无描述）。
- **未核实**：是否有面向 workspace 或组织的统一预算上限（公开文档只见 Codex goals 的 token budget）。
- **未核实**：SOC 2 Type II（FAQ 自述，未查 trust 中心）、"Trusted by 100k+ builders" 与 logo 墙（官方宣传，无第三方佐证）。
- **未核实（口径冲突）**：FAQ 称当前不收费、专注免费工具；定价页列 $50/$60/Enterprise。差异原因不明。
- **未核实**：非 Cloud（本地）workspace 能否多人共享——公开文档把 Multiplayer 归在 Cloud organization。
- **未核实**：mobile app 是否已可用（官网首页与定价页列出，Cloud FAQ 一处写 coming soon）。
- **未核实**：Windows/Linux 用户能否仅通过 API 或浏览器使用云端 workspace。
- **未核实**：源码层面的一切（官网未见公开仓库，未读源码，未找到许可证文件）。全部事实来自官方公开网页，**无一条来自源码或 issue 区**。

## 最重要的 3 个出处

1. https://www.conductor.build/docs/concepts/workspaces-and-branches —— Project/Repository/Workspace/Branch/Working tree 官方定义、"每个 workspace 有自己的分支与工作目录"、同一分支不能同时检出两处，及"隔离不是安全边界"。
2. https://www.conductor.build/docs/concepts/parallel-agents —— 多 workspace vs 同 workspace 多 agent 的官方取舍判据与代价。
3. https://www.conductor.build/docs/api —— 公开文档中详细描述的多 agent 编排方式（外部 agent 轮询 API / routines / multi-PR 模板）；是否另有内置调度器未核实。
