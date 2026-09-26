# Agor（preset-io/agor）调研

- 采集日期：2026-09-26（下文所有 URL 均为当日实际访问）
- 入口：官方仓库 https://github.com/preset-io/agor ；官网 https://agor.live ；文档 https://agor.live/guide/getting-started
- 取证方式：GitHub 仓库页面 + agor.live 官方指南页（boards / sessions / branches / internal-mcp）+ 官方 issue #1575、#2171（gh 只读 API）。
- 本文所有引文均为对应页面原文摘录；标注「官方说明」来自文档，标注「源码/仓库」来自仓库文件树或 issue 正文。

## ① 产品身份

**Agor：self-hosted、多人在线（multiplayer-ready）的 AI 编码智能体「团队指挥中心」。** 官方 README 原文：*"Team command center for all things agentic. Agor is a self-hosted, multiplayer-ready web workspace for running coding agents — Claude Code, Codex, Gemini, and others — on isolated git branches."*（https://github.com/preset-io/agor ，2026-09-26）

- 出品方：Preset（airflow 商业化团队，官网多处链接 preset.io）。官网自称 *"The command center for AI enablement"*，目标人物是 "AI Enablement Engineer"（https://agor.live ，2026-09-26）。
- 无自有模型：驱动 Claude Code、Codex、Gemini、Copilot、OpenCode、Cursor(beta) 等现有 agent CLI/SDK，按 session 可切换（README 原文 *"Agor ships no model of its own"*）。
- 许可证：**BSL 1.1**（Business Source License），官方口径 *"Production use is permitted under BSL 1.1"*（https://agor.live 首页）；npm 包名 `agor-live`。未发现传统开源 OSI 许可证，也**未找到公开价格页**（官网仅提 "Agor Cloud is coming" 托管服务，未给价格，记为未核实）。

## ② 目标用户与一条实际工作流程

目标用户：需要带团队用 AI 编码智能体的工程团队／内部「AI 赋能工程师」，自托管部署，solo 可用、开 multiplayer 后多人协作。

典型流程（由官方文档 concepts 串成，均为官方说明）：

1. `npm install -g agor-live && agor init && agor daemon start && agor open` 起 daemon，浏览器打开工作台（README Quick Start）。
2. 添加 repo → 建 branch。Agor 以分支为核心工作单元（官方称 branch 是 *"the primary unit of work"*），并给出**约定式**最佳实践 *"Best practice: 1 branch = 1 issue = 1 PR = 1 feature."*（https://agor.live/guide/branches）——这是官方建议的使用约定，不是结构强制；非 git 实体另有 Cards(Beta) 补充（见 ③）。分支在 `~/.agor/worktrees/<repo>/<name>` 下物化为 git worktree 或独立 clone。
3. 在分支卡片上开 session（选 Claude Code/Codex/Gemini…），对话即工作；父会话可 **fork**（复制上下文开兄弟分支）/ **spawn**（全新上下文的子会话）/ **btw**（临时旁路提问）（https://agor.live/guide/sessions）。
4. 把分支卡拖进 zone（如 "Code Review"）触发模板化 prompt，模板变量自动带上 `{{ branch.issue_url }}`、`{{ branch.pull_request_url }}`；链条 `[Triage]→[Analyze]→[Build]→[Review]→[Ship]` 即看板式流水线（https://agor.live/guide/boards）。
5. 验收：spawn 的子会话完成后向父会话发 callback 报告（状态/摘要/工具调用数），父会话不阻塞；人可随时对树中任意已完成节点再 prompt。合并 PR 后归档分支保留全部会话历史用于审计。

## ③ 看板/任务层级/智能体角色与协作方式

**关键结论：Agor 的画布不是任务看板，是分支的 2D 空间组织层。** 官方原文：*"Instead of linear lists or kanban columns, every branch lives at an (x, y) coordinate on a board. Like Figma for AI coding work."*（https://agor.live/guide/boards）zones 表面是区域，**实际绑定了业务行为**：*"A zone is a spatial region on a board that triggers a templated prompt when a branch is dropped into it."* zone 配 Handlebars 模板（分支/issue/PR/env 变量），触发时选 session 或自动建新 root session——所以「拖进 zone」=「以固定模板发起一次 agent 执行」，空间位置即工作流语义。这纠正了任务书里"勿把自由画布自动等同任务看板"的担心：Agor 的 zone 恰恰是把自由画布**升级成半结构化工作流引擎**，但实体本身（分支）依然是 git 分支而非工单。真正的自由实体是 **Cards (Beta)**：*"generic workflow entities (support tickets, sales leads, content pieces) … just not git-bound"*，由 teammate 通过 MCP 创建管理（https://agor.live/guide/boards）。

层级与角色：

- **Board ⊃ Branch（卡片，带 x,y 坐标）⊃ Session（会话树）**。一个 workspace 可多 board（按项目/流水线/团队分）。
- Session 三种分叉：**Fork**（复制父上下文，仅 Claude Code/Codex 支持）、**Spawn**（新上下文子会话，可跨工具：Claude 父 spawn Codex 子）、**BTW**（临时问题，自动归档，答案注回父会话）（https://agor.live/guide/sessions）。
- Spawn 有**一等 callback 语义**：非阻塞、父忙时排队、子完成后自动回报 status/summary/toolCount、子会话持久可继续追问、支持层级嵌套（子再 spawn）。官方对比 Claude Code 原生 subagent："Parent stays responsive / Full conversation & git history / Children can spawn their own children"（https://agor.live/guide/sessions）。
- **长期队友（Teammates）**：持久 AI 角色，各有 Knowledge-base 命名空间（可语义检索的共享记忆）、skills、MCP 工具、gateway channels（Slack/GitHub 触达）、schedule（定时 standup/audit/heartbeat）（https://agor.live ，首页 "Raise AI teammates…" 节）。
- 多人协作：live cursors、facepile、空间评论、共享 session/env；官方截图 *"The board: branches as cards, zones as regions, agent sessions, and — optionally — teammates present live."*（README）
- 代码证据：仓库文件树有 `apps/agor-cli/src/commands/board/{add-session,clone,export,import,list}`、`tenant/gate/{acquire,release,inspect}` 等，说明 board 与租户门控都是一等 CLI 概念（https://github.com/preset-io/agor 文件树，2026-09-26）。

## ④ 工作目录隔离、交付物、评审与人工接管

- **隔离**：每分支一个真实 git 工作目录（worktree 或 clone 两种存储模式，operator 可配置 `branch_storage.allowed_modes`）；每分支一键 dev 环境，*"ports auto-assigned so parallel branches never collide"*（README；https://agor.live/guide/branches）。执行隔离提供 *"trusted local, fail-closed sandbox, or delegated external execution"* 三档（README）；沙箱开启 `home_mode: per_user` 时会自动关闭 clone 的 borrow_base_objects 以防跨挂载点断裂（branches 文档）。权限为 board/branch 两级 RBAC（Viewer/Editor/Manager）+ 文件访问 + session 共享开关；fork/spawn 的子会话**只复制 env 变量名不复制值**，按归属用户重新解析，防止借父会话拿密钥（sessions 文档）。
- **交付物**：分支本身即交付（issue_url + PR_url 挂在记录上）；PR 合并后归档。Artifacts 功能让 agent 在画布上渲染"live dashboards, mockups, calculators"（官网首页）。
- **评审/人工接管**：zone 触发即评审工作流（如 "Human PR Review" zone，internal-mcp 文档示例）；session 权限模式可设 auto-approve/supervised/manual，随时改（sessions 文档）；queue 管理：人可 list/cancel/reorder 子会话待办队列，官方给了「先排队更新→重排队→**才** stop 原任务」的非原子四步法（https://agor.live/guide/internal-mcp）。

## ⑤ 失败恢复、预算/权限边界

- **失败恢复**：分支物化异步，`filesystem_status: "creating"`；MCP 提供 retry-safe 的 `agor_branches_wait_for_ready`（默认 45s，上限 5 分钟）；活跃分支 filesystem 非 ready 时可用 Recover / `agor_branches_retry_provisioning` 恢复，恢复以**发起请求的 Manager** 身份执行并校验 git ref；unarchive 确认丢失时 UI 30 秒后报 **unknown outcome 而非失败**，要求刷新读态不许盲目重放（https://agor.live/guide/branches）。branch cleanup（默认 `git clean -fdX`）默认禁用，需 repo admin 显式启用，且任务/上传/环境未清时会拒绝执行。
- **预算**：每 prompt 记录 token + 美元成本，*"per-prompt token and dollar accounting with full, durable history across every session"*（README）；官方立场 *"Tokens burned isn't a KPI"*（agor.live）。会话转录有硬上限：单条 executor 消息写盘 800,000 字节，diff 预览 250KiB，超限走**有损降级**并明确告知哪些字段丢失（sessions 文档 "Large tool transcripts"）。
- **权限边界**：MCP 面向 agent 全量开放（*"Anything a user can do in Agor, an agent can do too"*，https://agor.live/guide/internal-mcp），但走同一套 RBAC：queue 操作需 workspace Member + Branch Manager；子会话**不继承额外权限**（*"Delegated Session credentials retain the acting user's permissions; child ancestry grants no additional rights"*）；tenant 边界永不穿越。MCP token 为 24h 短期 JWT，无撤销机制（泄漏爆炸半径以 exp 封顶）；viewer 角色不发 token。
- **风险自述**：官方 best practices 要求 *"Keep permission policies tight / Design idempotent workflows / Log agent activity"*（internal-mcp 文档）。

## ⑥ 规模限制线索（风险证据，非硬上限）

**官方 issue 明确记录大工作区下的前端性能问题：**

- issue #1575 *"Agor frontend performance improvements"*（open）：bootstrap 曾一次性 `Promise.all` 发 **14 个 `findAll({ $limit: 10000 })`** 全局拉取，实例中有 **2861 个 board-objects、1147 个 cards**；修复分三阶段，Phase 1（board 范围首屏）已合并，Phase 2（bundle）与 Phase 3（**canvas 重渲染/会话树虚拟化**）截至 2026-09-26 仍为 planned（https://github.com/preset-io/agor/issues/1575）。
- issue #2171 *"Homepage load hangs and nearly crashes the browser"*（open，2026-08-05 报告）：*"Loading the Agor homepage (`/`) frequently causes the browser to hang, and it almost crashes."*（https://github.com/preset-io/agor/issues/2171）
- 另有文档级边界：board 卡片上会话树为受限滚动视口（两指滚动被画布平移抢占），MCP `agor_sessions_list` 分页上限 100、`sessionType` 过滤最多扫 10,000 候选（https://agor.live/guide/sessions）。

结论：以上是**风险线索**——均来自历史 issue 与单个实例的个案（报告于 2026-08，Phase 1 已合并修复启动路径），**不足以证明当前版本在数千实体量级普遍崩溃或卡顿，官方也未公布任何实体数硬上限**。本轮未部署、未对当前版本做任何性能实测，画布大实景性能属未核实项。稳妥的解读是：自由画布不宜被自动当作大规模任务看板，Agor 官方文档同样未如此宣称。

## ⑦ 对 fleet-studio 的借鉴建议

**适合借鉴（三点）：**

1. **候选设计：把空间画布/看板列升级为 zone 式触发器。** Agor 的 zone = 位置 + Handlebars 模板 prompt + session 选择策略，拖卡即执行（boards 文档）。fleet-studio 若做任务看板，可考虑在列/区域上挂"入列即执行的模板化 prompt + 上下文注入（issue/PR 链接自动带）"。**代价与前提**：zone 每次触发就是一次真实 agent 执行与计费，拖动误触发、重复拖入/重复投递事件都会重复消耗 token；若采用须配确认或防抖/幂等机制。故这是待评估的候选设计，不是无条件建议。
2. **会话树的 fork/spawn/btw + callback 语义。** spawn 非阻塞、父忙排队、完成自动回报、子可继续追问、可跨 agent 工具（sessions 文档）。这套"编排者-执行者"协议比一次性 subagent 更接近"军团"形态，且全程可内省（每个节点是可读会话），fleet-studio 的多智能体执行层可直接对标。
3. **agent 与人同权限体系的 MCP 自助面。** Agor 把整个系统经 MCP 暴露给 agent（queue 管理、建分支、挪卡、排程），复用人的 RBAC、短期 token、无越权继承（internal-mcp 文档）。fleet-studio 让 agent 自主操作看板时应照此设计：agent 是"一等用户"但权限永远落在真实用户名下。

**不适合照搬（两点）：**

1. **以 git 分支为核心实体的编码场景耦合。** Agor 围绕 branch 组织一切（官方约定 1 branch = 1 issue = 1 PR = 1 feature，见 ②），适合编码场景；非代码任务靠 Cards(Beta) 补充，尚为 Beta。fleet-studio 若定位通用任务军团（Multica 式），宜以独立任务/工单实体做骨干、git 分支作附件，而非倒过来。
2. **无虚拟化的全量 2D 画布渲染（基于风险线索的谨慎建议）。** 官方 issue 报告过大工作区下浏览器挂起/近乎崩溃、canvas 优化尚未完成（#1575/#2171），虽属个案且未经当前版本复测，仍提示押注无限画布有成本。fleet-studio 若预期任务数上百上千，看板宜以虚拟化列表/分组折叠为主、空间画布为辅。

## 覆盖与未核实边界

- 已核实：README、官网首页、boards/sessions/branches/internal-mcp 四篇官方文档、issue #1575/#2171 正文。所有引文见上文 URL。
- 未核实/未找到：
  - **定价**：未发现公开价格页（Agor Cloud 未上线，仅招团队）；BSL 1.1 许可证文本在仓库 LICENSE 中，未逐条核对生产使用条款细节。
  - 画布实体数量上限：官方未给出明确硬上限，仅有 #1575 中的实测规模（~2861 objects）与性能问题描述。
  - 未逐条阅读源码实现（本轮只看仓库文件树与文档），branch 物化、callback 投递等机制以官方文档自述为准。
