# Composio Agent Orchestrator（AO）：任务看板与自动交付循环调研

- 调研日期：2026-09-26，所有 URL 当日实际访问。
- 角色说明：本文为 collector 原始资料，只记录页面上实际看到的内容，标注证据等级：〔源码/仓库文件〕〔官方文档〕〔官方宣传〕〔提案/进行中〕〔未核实〕。〔源码/仓库文件〕仅证明文件/路径/配置存在于仓库，不代表本轮运行验证；〔实测〕仅用于本轮实际执行的请求（gh API、网页抓取）结果。
- 目标：为 fleet-studio（类 Multica、带任务看板的多智能体协作产品）提供方向借鉴，不做需求决策。

## ① 产品身份与官方链接

- 名称：Agent Orchestrator（简称 AO）。官方文档自我定位原文："a desktop IDE for supervising AI coding agents. It gives workers isolated workspaces…"（https://docs.aoagents.dev ，官方文档）。
- 仓库归属勘误：任务书给定的 https://github.com/ComposioHQ/agent-orchestrator 经 GitHub API 实测已重定向——对 ComposioHQ 与 Untrivial-ai 两个名字分别调 gh api，均返回 `"full_name":"Untrivial-ai/agent-orchestrator"`。规范地址现为 https://github.com/Untrivial-ai/agent-orchestrator 〔源码/仓库实测〕。仓库内 Go module 路径与 STATUS.md issue 链接仍使用 `aoagents` 组织名，与重定向后的 Untrivial-ai 并存，均指向同一仓库（约 650+ open issues，2026-09-26 推送）；遗留名称并存只说明旧路径未清理，迁移顺序与主体变更过程本轮无证据、不作推断。
- 其他官方入口：文档站 https://docs.aoagents.dev ；官方周报 https://orchestrator.inc/changelog/ 。
- 许可证：Apache-2.0（gh API `license.spdx_id` + README 徽章，https://github.com/Untrivial-ai/agent-orchestrator/blob/main/LICENSE ）〔仓库实测〕。
- 形态：本地桌面应用（Electron + React 前端，Go daemon 只监听 `127.0.0.1`，状态存 `~/.ao`），可选 CLI `ao`，移动端伴侣 App（docs 首页"Local By Design"节，官方文档）。

## ② 目标用户与一条实际工作流程

- 目标用户：要在同一仓库并行运行多个编码 agent 的开发者/工程负责人。README："Running several across a project creates a different job: deciding what matters, splitting work cleanly… preventing branch collisions"（官方宣传）。
- 官方基本循环（docs 首页原文）："add project -> start session -> isolated worktree -> pull request -> CI/review -> merge -> cleanup"〔官方文档〕。
- Quickstart 最小流程（https://docs.aoagents.dev/quickstart/ ）：Add project → New task（命名+具体 prompt+选 harness/模型/接口）→ "AO creates an isolated git worktree and branch for the session before launching the selected controller" → 在 Chat/TUI 里跟进和给反馈 → inspector 看 PR 摘要（CI、reviewer、未解决评论、mergeability）→ merge；"AO never force-deletes a dirty worktree"〔官方文档〕。
- 命令行等价物（per-role-agents 文档）：`ao spawn --project my-project --kind worker --name issue-42 --issue 42 --mode tui` 可带 issue 号建 worker，`--kind orchestrator` 建编排器；编排器会话在桌面端有专门的 spawn-orchestrator 流程（docs/STATUS.md 前端清单）〔官方文档+源码/仓库文档〕。

## ③ 看板、任务层级与角色协作

- 角色只有两层（https://docs.aoagents.dev/guides/per-role-agents/ ，官方文档）："A worker implements a focused task in an isolated workspace and may own pull requests. An orchestrator supervises a project, monitors sessions, and delegates implementation to workers." worker/orchestrator 可分别配置不同 harness 和模型，配置示例里 orchestrator 用 claude-code、worker 用 codex。
- 编排器职责（README，官方宣传）：把模糊目标拆成 focused tasks、spawn/重定向 worker、传递上下文、跟进度；"The orchestrator owns planning and delegation; workers own implementation, tests, commits, and pull requests." 其项目级对话持久保存目标/决策/约束，并结合 live AO 状态（活跃 worker、PR、CI、review）做规划。
- 看板四列（README，官方宣传）：**Working**（正在实现或待下一条指令）、**Needs you**（阻塞、缺输入、CI 失败、被要求修改、失联）、**In review**（open/draft PR 等检查或评审）、**Ready to merge**（已批准可合并，合并后会话保留可见直到归档）。
- 关键机制：卡片位置由事实推导而非人工拖动。README："AO derives each card's position from session, pull request, CI, and review facts"；dashboard 文档："AO does not persist a display-status label. It derives what you see from durable facts such as agent activity, termination, controller state, and current pull-request checks, reviews, and mergeability"（https://docs.aoagents.dev/dashboard/ ，官方文档）。活动信号枚举：Active / Idle / Waiting for input / Blocked / Exited。
- 源码佐证：changelog 条目 "Derive a Kanban column & display status per session"（PR #4249）；编排器-子任务关系在仓库有 schema 与组件：`cloud/internal/postgres/migrations/00006_orchestrator_children.sql`、`frontend/src/renderer/components/OrchestratorChildrenSection.tsx`、`useOrchestratorChildren.ts`〔源码〕。但"编排器如何拆任务"的算法/prompt 细节本轮未定位到描述文件（检索不足不证明不存在），只有上述叙述性描述与数据结构。

## ④ 工作目录隔离、交付物、评审与人工接管

- 目录隔离：每个 Git-backed worker 一个独立 branch+git worktree（quickstart 引文见②）；仓库内有专门适配层 `backend/internal/adapters/workspace/gitworktree/`（commands/discard/remove，含 Windows 修复路径）与迁移 `0096_session_worktree_base_ref.sql`〔源码〕。无仓库的 standalone 会话用 AO 管理的无分支目录（changelog 2026-09-20，#4851）。浏览器 profile 也按 worker 隔离："Browser profiles are isolated per worker so parallel UI tasks do not share state"（README）。
- 交付物：PR。inspector 摘要含 PR 链接、CI 状态（含失败 check 名和链接）、未解决 review 计数、不可合并原因；"Raw CI logs and full review bodies are not part of the concise desktop summary"（dashboard 文档）。
- 自动评审与修改回流：可配置 reviewer agent，PR 可自动启动评审（changelog #3338 "Automatic reviewer sessions for pull requests"）；评审路由 `GET /reviews`、`POST /reviews/execute`、`POST /reviews/{id}/send`，即评审结论可回发给原 worker（docs/STATUS.md〔源码/仓库文档〕）。评审代理按会话可选（changelog #3477），交互式评审面板覆盖 Claude Code、Codex、Aider 等 25 个 harness；其中 9 个被 STATUS.md 明确标注 experimental 且 host-trusted。
- CI 失败/冲突回流（docs/STATUS.md 原文，〔源码/仓库文档〕）："per-PR polling with ETag guards and semantic diffing, feeding PR facts into lifecycle, which sends agent nudges for CI failures, review feedback, and merge conflicts"（关联 issue #75/#108/#109）。
- 人工接管：Blocked 状态定义＝"an approval or permission decision is pending; automation will not inject input"（dashboard 文档）；通知中心四类持久事件 needs_input / ready_to_merge / pr_merged / pr_closed_unmerged；Chat 内有 approvals 与 structured questions 卡片；dirty worktree 不强删。兼容的 Claude Code/Codex 会话可在 Chat↔Terminal UI 间切换，忙时询问"finish and drain or stop and interrupt"（dashboard/quickstart）。

## ⑤ 失败恢复、预算与权限边界

- 失败恢复：会话状态跨 daemon 重启存活（changelog #5348；STATUS.md "Progress and recovery state survive daemon restarts"）；Chat 的 ACP provider host 以 detached 方式跨桌面重启保持会话不中断；rollback、重启恢复、controller-generation fencing〔源码/仓库文档〕。注意 `0039_drop_orchestrator_reengagement.sql` 表明"空闲编排器自动再激活"功能曾加又撤（#3274）〔源码〕。
- 权限边界：会话级权限列迁移 `0127_session_permissions.sql`（`ALTER TABLE sessions ADD COLUMN session_permissions`）〔源码〕；项目级权限默认值（changelog #4956 "Project-level permission defaults"）；角色配置示例 `"permissions": "bypass-permissions"`（per-role-agents 文档）。部分 harness 进 Chat 的前提就是用户显式选 bypass-permissions（STATUS.md：Pi Chat"only after the user explicitly chooses the per-session bypass-permissions fallback"；Unreal Agent"requires an explicit bypass-permissions session"）。
- 沙箱上限（重要限制，STATUS.md 原文〔源码/仓库文档〕）："native modes, autonomous settings, and prompts are not OS or network containment"——即 AO 不提供操作系统/网络级隔离，多个实验性 reviewer 被标注"host-trusted / experimental"。
- 代价/预算：AO 本地展示 token 用量与估算成本（changelog #4168 "Estimated model costs alongside token usage"；源码 `backend/internal/pricing/`、`backend/internal/daemon/usage_pricing.go` 为模型单价目录与成本换算〔源码〕）。模型费用发生在用户自己的 harness 账号上，AO 不代收。官方价格页：未找到——docs 与 orchestrator.inc 均无 pricing 页；仅第三方 Stork.ai 标注"Freemium"〔未核实，非官方〕。也未发现消费上限/预算闸门功能（未发现≠不存在）。
- 文档与宣传的出入（反证/限制）：
  1. docs 首页明说 "GitHub is the currently shipped source-control observation path. Broader tracker and SCM integrations described in older AO documentation are not all available in the current daemon rewrite."（官方文档），而官方 changelog 宣传 GitLab 仓库与 MR 支持（#2773，2026-08-16）。两者属官方资料口径不一致；本轮未读相关实现代码，不判断哪份文档当前生效。
  2. STATUS.md "In flight" 承认：GitHub tracker adapter 存在但 "there is no daemon observer loop or agent-lifecycle→issue mirroring yet, so the tracker does nothing at runtime"（#112）〔源码/仓库文档〕。此为仓库文档自述，本轮未运行实测，以该自述为限。
  3. 云版是进行中提案：changelog 称多租户控制面（WorkOS 登录、28 表 Postgres、组织级项目/会话）已并入 monorepo 但"Everything is flag-gated"（https://orchestrator.inc/changelog/ ）；PR #3251 为"multi-tenant control plane skeleton (phase 1)"〔提案/进行中〕。README 徽章里的"cloud agents"宣传与该自述存在口径差；"仍在提案/flag-gated"同样只依据官方文字，本轮未实测云功能运行状态。

## ⑥ 对 fleet-studio 的借鉴

适合借鉴三点：
1. **看板列由事实推导而非人工状态**：把 worker 活动 + PR/CI/review 事实实时推导成 Working/Needs you/In review/Ready to merge 四列（README+dashboard 文档），避免卡片状态与真实进度脱节；"Needs you" 列天然成为人工注意力收口。这是看板可信度的核心设计。
2. **两层角色 + 每 worker 独立 branch/worktree**：编排器只管拆解、委派、跟进度，worker 拥有实现/测试/提交/PR（per-role-agents 文档）；从目录层隔离解决并行冲突，且"不强行删除脏 worktree"保住人工成果。
3. **失败自动回流闭环**：CI 失败、review 要求修改、合并冲突由 daemon lifecycle 自动"nudge"回原 worker（STATUS.md 引文），reviewer agent 的结论也可路由回 worker；人工只在 Blocked（审批挂起）时介入。这一"自动交付循环"正是军团类产品需要的骨架。

不适合两点：
1. **本地优先的重量级形态慎照搬**：AO 为 25+ 种 harness 各做适配（tmux/conpty PTY、ACP 协议、各家审批模式差异），维护面极大（STATUS.md 中大半篇幅是这类工程细节）。若 fleet-studio 未来决定做云端多租户，应走受控沙箱+统一协议路线而非复刻"桌面应用+本地 daemon+每家 CLI 探测"；该决定未做前，默认按本机运行、研发/调研并用考虑，可保留本地形态但应控制 harness 适配数量。
2. **信任模型依赖单机自担风险**：AO 自认无 OS/网络级隔离（"not OS or network containment"），靠人工审批兜底。fleet-studio 默认本机研发/调研场景可沿用类似"人工审批兜底"模型；仅当未来要 agent 无人值守跑在他人/生产仓库或云端多租户时，才需容器/网络隔离与消费限额（AO 本身也未提供预算闸门，只能借鉴其成本可见性做法）。

另注：本轮仅定位到"编排器→children"的叙述与 schema（orchestrator_children 表/组件），未深入读取，也未找到可复用的拆解规格/验收协议；检索有限不证明不存在，fleet-studio 借鉴前需自行求证与设计。

## 主要出处（均 2026-09-26 访问）

1. README：https://github.com/Untrivial-ai/agent-orchestrator （raw：https://raw.githubusercontent.com/Untrivial-ai/agent-orchestrator/main/README.md ）
2. docs 首页 / Dashboard / Quickstart / Per-role agents：https://docs.aoagents.dev ，/dashboard/ ，/quickstart/ ，/guides/per-role-agents/
3. docs/STATUS.md（仓库内进度与边界自述）：https://raw.githubusercontent.com/Untrivial-ai/agent-orchestrator/main/docs/STATUS.md
4. 权限迁移 SQL：https://github.com/Untrivial-ai/agent-orchestrator/blob/main/backend/internal/storage/sqlite/migrations/0127_session_permissions.sql
5. 官方周报：https://orchestrator.inc/changelog/

## 未核实边界

- 未找到官方价格/订阅页；"Freemium"仅来自第三方（Stork.ai），未经官方证实。
- 编排器拆任务的具体机制（prompt、拆分算法、children 验收标准）本轮检索未定位到（不排除存在于仓库未遍历处或其他渠道）。
- STATUS.md 引用的 aoagents 组织旧 issue（#75/#108/#109/#110-#112）未逐一打开验证，仅以 STATUS.md 原文为据。
- 云版能力（Web/多租户）处于 flag-gated 阶段，实际可用范围未能从外部验证。
