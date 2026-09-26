# Multica 调研：人 + 多智能体同板协作的产品形态

调研日期：2026-09-26（全部证据当日实际访问）
调研对象：https://github.com/multica-ai/multica 及官方文档 multica.ai/docs
性质：需求方向调研，非正式需求。取证以官方仓库 README、官方文档为准，未爬全站、未读全部源码。

---

## ① 产品身份与官方链接

Multica 自我定位："**Agents that show up on the board**" —— 一个 source-available 的协作工作区，把 AI coding agent 当作团队成员来派活：领 issue、汇报进度、提出阻塞、交回评审。官方宣称支持 26 种 agent CLI、可自托管、无锁定。

| 项 | 内容 | 来源 |
|---|---|---|
| 官网 | https://multica.ai | README 链接栏（已访问，定价页 404，见⑤） |
| 文档站 | https://multica.ai/docs | 同上 |
| 仓库 | https://github.com/multica-ai/multica | 已访问 |
| 运营方 | Index Labs (Hong Kong) Limited，版权 2025-2026 | LICENSE Part I |

**许可证（重要，非纯开源）**：LICENSE 文件实际是「Apache 2.0 + 附加条件」（自称 Multica License）：
- 商业使用（含企业内部任务平台）允许，但**未经商业授权不得对外提供托管服务**（SaaS/managed service，收不收费都受限），组织内部使用不受限（Part I 条件 1a）；
- 不得移除 UI 中的 Multica LOGO/名称/版权信息，除非取得 branding waiver（条件 1b）。
- 原文证据："you may not use the Multica source code to provide a hosted service to third parties"（https://github.com/multica-ai/multica/blob/main/LICENSE ，2026-09-26）
- 分类：**已见官方 LICENSE 原文**。

---

## ② 目标用户与一条实际工作流

**目标用户**：已经在用多个 AI coding CLI（Claude Code、Codex、Cursor 等）的工程团队。README 痛点描述："Each one lives in its own terminal tab, forgets everything when the session ends… The more agents you add, the more of your day goes to babysitting them."（https://github.com/multica-ai/multica ，README "What is Multica?"，2026-09-26）

**实际工作流（官方文档串联）**：
1. 人建 issue（标题即可，如 `MUL-123`），写清目标与验收标准（https://multica.ai/docs/issues ，2026-09-26）；
2. Assignee 选一个 **agent**（或 squad），确认对话框可"Start"或"Don't start yet"（https://multica.ai/docs/assigning-issues ，2026-09-26）；
3. 系统为该 agent 创建一条 **run**，绑定 runtime 的 daemon 认领，在本机调用该 agent 配置的 AI coding 工具执行；runtime 离线则 run 在队列等待（同上 + /docs/tasks）；
4. 执行中 agent 通过 Multica CLI 发评论、改 issue 状态，评论与结果写回同一 issue，右侧 Execution log 实时可见 transcript、tool call、错误（/docs/tasks，2026-09-26）；
5. 交付时 agent 把 issue 置为 `in_review`；人评审，`done` 通常由人确认或 PR 带 `Closes MUL-123` 关键字合并触发（/docs/issues，2026-09-26）。

---

## ③ 看板、任务层级、智能体角色与协作方式

**看板与任务层级**（https://multica.ai/docs/issues ，2026-09-26）：
- Issue 页提供 **list / board / table / Gantt / swimlane** 五种视图，同一批 issue；
- 7 个内建状态分 4 个生命周期类别：unstarted（backlog/todo）、started（in_progress/in_review/blocked）、done、closed（cancelled），可自定义状态（如 Code Review、QA），自定义只继承生命周期语义不继承特殊行为；
- 层级：issue ≤ 1 个 project；大任务拆 **sub-issue**（父子状态互不影响），sub-issue 可分 **stage**（1/2/3 批次），最早未完成 stage 全部 done/cancelled 后父 issue 收通知，**若父 issue 的 assignee 是 agent，agent 被唤醒决定是否开下一 stage**——多智能体按阶段推进的现成机制。

**智能体角色与身份**（https://multica.ai/docs/agents ，2026-09-26）：
- Agent = workspace 里可复用的"身份 + 能力 + 执行配置"：名字、头像、职责 instructions、最多 3 个 conversation starters、**skills**（可复用方法/资料/文件）、runtime/model/思考等级、Access、并发/环境变量/MCP 等。改模型或 instructions 不产生新 agent，历史不丢。
- **关键设计（回答"长期成员还是临时进程"）**：官方明说 "An agent is **not** a continuously running process. It is a reusable identity and configuration; it only produces concrete runs when work arrives."——agent 是**长期成员身份**，执行是按需临时进程，二者分离；runtime 离线时身份与历史保留，新 run 排队等待。
- **协作案型**：分给 agent（own）、评论 @-mention（只处理这条不改负责人）、回复 agent 评论（信息进后续 run）、直接 chat（不挂 issue）、加入 project/squad（可当 project lead / squad leader / member）、被 Autopilot 定时或事件触发。共 6 类入口（/docs/agents，2026-09-26）。

**多智能体协作：Squad**（https://multica.ai/docs/squads ，2026-09-26）——本轮最值得研究的一页：
- 结构 = 1 个 leader agent（必须是 agent）+ 若干 members（agent 或人），同一人可进多个 squad；
- **指派 squad ≠ 全员并发**：只唤醒 leader，leader 读上下文后发一条 delegation 评论 @-mention 选中成员（该 mention 触发成员各自的新 run），再用 `multica squad activity …` 写入"已评估"记录，然后**停止**——leader 不亲自实现；
- leader 每回合被注入三段固定内容：系统级 **Squad Operating Protocol**（硬编码、不可编辑：按 roster 的精确 mention markdown 委派、每回合记录评估、dispatch 后即停、整体达标才置 `in_review`）、**Squad Roster**（每成员一行含精确 mention 链接）、自定义 **Squad Instructions**（路由规则）；
- 后续唤醒规则有防环设计：leader 自己的评论不触发自己、成员已 @ 具体人时 leader 让位、leader 已有 queued run 时去重；成员回报或 stage 关卡结束时 leader 被重新唤醒决定下一步/升级/交付。

**主动执行：Autopilot**（https://multica.ai/docs/autopilots ，2026-09-26）：
- 配置 = Runbook（每次注入的目标/约束/步骤）+ assignee（agent 或 squad）+ 触发器（cron 多时刻表或 webhook）；两种模式：create issue（进常规协作流）或 run only（无 issue、只留历史）；
- webhook 支持 Idempotency-Key 去重、事件过滤、URL 轮换、delivery 重放；
- 失败熔断："当过去 7 天 ≥50 次完成/失败 run 且失败率 90%，系统暂停该 autopilot 并通知创建者"。

**评论/提及/技能证据**：评论 @-mention 是**执行触发器而非通知**（"An @-mention of an agent is an execution trigger, not a notification"，/docs/agents，2026-09-26）；agent 可建 issue、发评论、改状态，但无 inbox、收不到 @all。Skills 在 agent 配置中以独立字段存在（/docs/agents），task 文档提到 run 失败原因含 `skill bundle download failure`，可交叉印证 skills 会随 run 下发（/docs/tasks，2026-09-26）。

---

## ④ 工作目录隔离、交付物、评审与人工接管

**运行状态与任务状态明确分离**（两处文档反复强调，2026-09-26）：
- "Run lifecycle and issue status are separate: a run completing does not by itself change the issue status."（https://multica.ai/docs/assigning-issues）
- "`completed` only means this particular run ended normally — it does not confirm the issue's goal has been met."（https://multica.ai/docs/tasks）
- 服务端只在 run 开始/结束时翻 issue 状态是**被禁止的默认**：状态由 agent 在 run 中经 CLI 显式写入（开始→`in_progress`、交付→`in_review`、纯咨询不动状态）；仅两个系统例外——run 失败且无其他 run/重试时 `in_progress` 回滚 `todo`，关联 PR 全部合并且带关闭关键字时置 `done`（/docs/issues）。改负责人/状态**不会**停掉已启动的 run，打断必须去 Execution log 停 run。

**工作目录隔离**（https://multica.ai/docs/security-model + /docs/daemon-runtimes ，2026-09-26）：
- 每 run 独立工作目录是**官方默认**："Per-run working directory. Each run gets its own workdir under `~/multica_workspaces/`"（https://multica.ai/docs/security-model ，2026-09-26），目录根可经 `workspaces_root` 配置改盘（/docs/daemon-runtimes）。两点边界：① 是否存在指向既有本地项目目录的例外模式**未验**——/docs/tasks 有 `waiting_local_directory` 状态（"The target local directory is held by another run; waiting for the directory lock to release"）、/docs/daemon-runtimes 有 "Parallel runs compete for machine capacity, tool account quota, and the same working directory" 及 `multica repo checkout` 字样，仅提示存在目录锁/指定目录机制，官方默认与例外范围未核实；② 该隔离不是沙箱，官方原话将 per-run workdir 列为 "conveniences and blast-radius reduction — not a security boundary"（/docs/security-model，2026-09-26）；
- 每 run 独立 agent 状态（Codex 有 run 级 `CODEX_HOME`）；run 级 API token（`MULTICA_TOKEN`，`mat_` 前缀）绑定到该 agent + 该 run，最长 24 小时；run 绑定 runtime，**永不迁移到别的机器**；
- 交付物：diff/PR 挂在 issue 上，执行过程（transcript、tool call、命令、错误、时间戳）可回放，token 用量按 agent/issue 统计（README "Stay in the loop"段 + /docs/tasks）。

**评审与人工接管**：
- "Review gates → Work lands in review, not in main. You decide what ships."（README，2026-09-26）；`done` 留给人或 PR 合并集成；
- Inbox 只在 agent 需要人介入时提醒（"Get pinged when an agent needs a call, not for every step"）；
- 人随时可在 run 记录里 stop，失败后手动 retry（且 retry 唤起的是**当时**那个 agent，不跟随改派）。

---

## ⑤ 失败恢复、预算/权限边界

**失败恢复**（https://multica.ai/docs/tasks ，2026-09-26）：
- run 状态机：deferred→queued→dispatched→(waiting_local_directory)→running→completed/failed/cancelled；queued 不过期（runtime 心跳在就算忙），dispatched 超 5 分钟判失败，running 无时长上限靠 15s 心跳判活；
- **自动重试白名单**：瞬态故障（runtime 离线、daemon 重启回收、执行超时、工具断网等）默认重试 2 次（工具断网最多 3 次）；auth 失败、配额耗尽、配置错误、模型问题等**永不自动重试**，须先修因再手动重试；
- 失败原因两级编码：平台级 + `agent_error.*`（工具级，如 `provider_quota_limit`、`context_overflow`），排障可读；
- 重试尽量保留上一 run 已写的文件、同 runtime 可续接上一会话；会话被污染（如 context overflow）则原目录上开新会话。

**预算**：官方口径是**用量可见**（"Token usage → See what each run cost, per agent and per issue"，README，2026-09-26），配额耗尽（402）列为失败原因；**未发现**独立预算上限/熔断配置（除上述 autopilot 90% 失败率自动暂停），此为未核实边界，不强作结论。

**权限边界**（https://multica.ai/docs/agents + /docs/security-model + /docs/daemon-runtimes ，2026-09-26）：
- 三层角色 owner/admin/member + agent 级 Access（Only me / Entire workspace / Specific people，新 agent 默认 Only me）；admin 能管 agent 但**不能绕过 Access 跑别人的 "Only me" agent**；能否 @ squad 取决于能否跑它的 leader；
- runtime 默认**私有**（只有 owner 能在上面建 agent），改 public 仅 owner 可决定——"the runtime is someone else's computer"；
- **限制/反证（本轮最重要的反面证据）**：官方安全模型坦承 run 默认以 daemon 用户完整权限执行、**不做文件系统沙箱**："Multica makes no filesystem-sandbox guarantee… Treat every run as unsandboxed and put the boundary outside the daemon."；默认路径上 Codex 跑 `sandbox_mode = "danger-full-access"`、Claude Code 跑 `--permission-mode bypassPermissions`（唯一例外是 Windows 上显式 opt-in Codex 原生沙箱）。隔离靠用户自建：专用 Unix 用户/容器/VM。即"边界在 daemon 之外"是产品的明示立场，不是宣传里的安全卖点。

**价格**：官网定价页 404（https://multica.ai/pricing ，2026-09-26 访问），商业授权需联系 sales（LICENSE Part I 提供 contact-sales 入口）。未发现公开价格表。

---

## ⑥ 对 fleet-studio 的借鉴判断（需求方向，非结论）

**适合借鉴的三点**：
1. **issue 状态与 run 生命周期双轨制**：任务状态（人看的看板）与运行状态（机器的执行记录）分离，run 完成不自动改任务状态；状态推进由 agent 经受控通道显式写回，仅保留极少数系统例外（失败回滚、PR 合并自动 done）。这是"人和 agent 同板"能成立的关键契约，fleet-studio 的看板值得照此定义字段与事件。（已见官方文档多页一致陈述）
2. **agent = 长期身份 + 按需临时进程**：agent 卡片常驻看板（有可用性/负载两类状态），执行时才派 run 到 runtime；run 独立记录、可回放、失败不覆盖历史。这样"10 个 agent 雇员"不会变成 10 个常驻进程。
3. **squad 的"leader 唤醒-委派-停止"协议**：不搞全员广播，leader 拿 roster 和路由规则、发精确 @mention 触发成员 run、写评估记录即停，成员回报或 stage 关卡再唤醒 leader；配合 sub-issue stage 批次推进。这是现成的多智能体军团编排骨架，防环与去重规则也一并给了。

**不适合照搬的两点**：
1. **"不做沙箱、边界交给用户"的默认**：默认 `danger-full-access`/`bypassPermissions` 对个人自托管工具合理，但 fleet-studio 若面向团队/军团场景，把隔离完全推给用户自建 VM 的立场很难作为产品承诺，至少需要更安全的默认档。
2. **执行接入依赖 agent CLI；非编码交付的验收深度未核实**：Multica 的执行面绑定 agent CLI（README 自述 26 种），但这不等于只能做编码——官方 issue 定义明示 "a feature, a bug, an investigation"（/docs/issues，2026-09-26），Autopilot 官方用例也含每日进度汇总、依赖审计等非编码场景（/docs/autopilots，2026-09-26），故"非编码受限"不能当作已知事实。对 fleet-studio 真正未核实的是：调研/运营类任务的通用附件、报告类交付物与人工验收流程是否与代码 diff/PR 同等完备，本轮未抓到证据；fleet-studio 需自定义交付物抽象并自行验证，而非默认照搬。

---

## 附：证据分类与未核实清单

**证据等级说明**：本报告事实均出自 2026-09-26 当日访问的官方页面（README/LICENSE 为仓库原文，/docs/* 为官方文档），属"官方说明"；未逐条核对源码实现，文档描述与实现可能有出入；README 中 "Your next 10 hires won't be human" 等属**宣传语**，未采信为事实。

**未核实/未发现**：
- 未逐行核对源码（仅看 README 与文档，另从仓库文件树确认存在 apps/desktop、daemon 等模块）；squad 协议、重试数值等均为文档口径；
- 每 run 工作目录是否存在"指向既有本地项目目录"的例外模式未验证（仅 `waiting_local_directory` 目录锁与 `multica repo checkout` 旁证，2026-09-26）；非编码任务（调研/运营）的附件与报告类交付验收深度未核实；
- 官网定价页 404，**未发现**公开价格；商业授权条款见 LICENSE；
- **未发现**独立预算上限功能；token 用量展示的粒度仅有 README 一句，未进文档核对细节；
- 官方 issue 区的边界讨论本轮未抓取（时间盒限制），issue 中是否有用户反馈的坑未验证；
- "26 agent CLIs"为 README 自述，未逐个数。

**核心出处前三**：
1. https://multica.ai/docs/squads —— 多智能体编排协议最完整（leader/roster/防环/stage）
2. https://multica.ai/docs/tasks —— run 状态机、重试白名单、双轨分离的机制页
3. https://multica.ai/docs/security-model —— 最重要的限制证据（无沙箱承诺、默认 full-access）
