# Vibe Kanban 调研（多智能体协作方向）

- 调研日期：2026-09-26（所有链接当日访问）
- 调研人：collector（fleet-studio 调研轮，仅收集不开发）
- 取证方式：真实联网抓取官方仓库 README、官方文档站、官方博客、GitHub issue；未凭印象补齐。

## ① 产品身份与官方链接

**Vibe Kanban** 是 BloopAI（bloop 公司）出品的开源工具：一个面向开发者的看板，用来看板卡片（issue）跟踪并驱动多种 AI 编码智能体（Claude Code、Codex、Gemini CLI 等）干活，主打"并行运行 coding agent + git worktree 隔离"。

| 项 | 内容 | 证据 |
|---|---|---|
| 官方仓库 | https://github.com/BloopAI/vibe-kanban | README 自述："Get 10X more out of Claude Code, Gemini CLI, Codex, Amp and other coding agents..."（已见仓库 README，2026-09-26） |
| 官网/文档 | https://vibekanban.com 、https://vibekanban.com/docs | 文档首页标语："Orchestrate AI Coding Agents…Switch between Claude Code, Codex, OpenCode and others"（已见官方站，2026-09-26） |
| 安装方式 | `npx vibe-kanban`（npm 包 vibe-kanban） | README："One command. Describe the work, review the diff, ship it. `npx vibe-kanban`"（已见，2026-09-26） |
| 许可证 | Apache License 2.0 | 仓库 LICENSE 文件正文："Apache License Version 2.0, January 2004"（已见源码库 LICENSE，2026-09-26） |
| ⚠️ 现状 | **项目已宣布 sunsetting（关停）** | README 顶部大标题："**Vibe Kanban is sunsetting.** Read the announcement."（已见 README，2026-09-26） |

关停公告发布于 2026-04-10（页面署名 "April 10, 2026"，meta `article:published_time=2026-04-10`；2026-09-26 访问已见）："Today we're shutting down bloop, the company behind Vibe Kanban. The Vibe Kanban project will live on, open source and community maintained."公告当时的安排是 "Remote services will remain available for 30 days, after which Vibe Kanban will transition to a fully local architecture"（自公告日起约 30 天后转纯本地架构，即约 2026-05 上旬；该期限是否按期执行、云服务当前可用性未实测）。**对本项目的含义：产品形态与源码在形态研究上有参考价值，但不能依赖其云服务/官方维护前景；引用云功能时注意其可能已按公告下线。**

价格（历史口径，关停前定价，仅作参考）：个人 $0；Pro $30/user/月；Enterprise 定制（官方 pricing 页搜索摘要，未逐页打开全文，部分核实）。Cloud 版发布博客称"Vibe Kanban remains free for individuals. To collaborate with others, upgrade your organisation to a Pro subscription at $30 per user per month."（来源 https://www.vibekanban.com/blog/introducing-vibe-kanban-cloud ，已见搜索摘录，2026-09-26）。注意：关停公告写明 "subscriptions terminated"（订阅已终止），该价格口径已随 2026-04-10 公告失效。

## ② 目标用户与一条实际工作流程

**目标用户**：用 CLI 型编码智能体（Claude Code、Codex、Gemini CLI、Copilot、Amp、Cursor、OpenCode、Droid、CCR、Qwen Code 共 10+ 种）的软件工程师；0.1 云版本后扩展到小团队（issue 支持优先级、标签、指派人、评论、子任务、阻塞等，见官方 Discussion #2510，https://github.com/BloopAI/vibe-kanban/discussions/2510 ，2026-09-26 已见搜索摘录）。

**一条实际工作流程（官方文档口径）**：
1. `npx vibe-kanban` 启动，配置项目仓库与默认 agent（官方 Getting Started，https://vibekanban.com/docs/getting-started ）。
2. 在看板上建 issue：标题+富文本描述；官方明确"Your issue description becomes the prompt your coding agent receives"（Issue Management，https://vibekanban.com/docs/issue-management.md ，2026-09-26 已见）。
3. 从 issue 创建 workspace：系统建 git worktree+新分支，agent 在隔离目录执行；原仓库不受影响，"Nothing is pushed to remote until you explicitly create a PR"（Workspaces Overview，https://github.com/BloopAI/vibe-kanban/blob/main/docs/workspaces/index.mdx ，已见）。
4. 审查 Changes 面板的 diff、行内评论反馈给 agent；内置浏览器预览（同上 + Reviewing Code 文档）。
5. 满意后 Create PR（AI 生成描述）或直接 merge 回目标分支（README 与 Git Operations 文档，https://vibekanban.com/docs/workspaces/git-operations ）。

## ③ 看板 / 任务层级 / 智能体角色与协作方式

- **看板列**：To do / In progress / In review / Done 四列默认显示，Backlog、Cancelled 默认隐藏（issue-management.md，已见）。
- **任务层级**：issue 是"fundamental unit of work"，支持 parent/child 的 **Sub-Issues**；关键规则："Each sub-issue has its own independent status — completing all children does not auto-complete the parent"（issue-management.md，已见）。
- **issue ↔ workspace 是一对多（官方证据仅支持一卡连多个 workspace）**："You can connect multiple workspaces to a single issue — useful for running agents in parallel on different parts of the same feature"（issue-management.md，已见）。反向关系（一个 workspace 连多张卡）未见官方说明，不作推断。
- **执行模型**：issue → workspace（worktree 分支）→ 一个或多个 **session**（与某个 agent 的会话线程），支持多仓库 workspace（Workspaces Overview：workspace 可含多个 repository，每个有独立 git 状态；session 是"conversation thread with a coding agent"，已见）。
- **agent 角色**：Vibe Kanban 本身不做"角色分工"，agent 是可插拔执行器；通过 **Agent Profiles** 预设不同配置变体（规划模式、模型、权限档位），同一 agent 可存多套 profile，如"Fast iteration / Complex tasks / Autonomous work / Code review"（Agent Profiles 文档，https://vibekanban.com/docs/settings/agent-configurations.md ，2026-09-26 已见）。即"分工"由人通过 profile 选择体现，不是产品内置的智能体角色系统。
- **协作**：Team/Personal 两个视图区分全项目与个人 issue；云端支持组织、成员、评论（llms.txt 目录 + issue-management.md，已见）。

## ④ 工作目录隔离、交付物、评审与人工接管

- **隔离机制（官方文档明确）**：创建 workspace 时"Creates a git worktree - a separate working directory linked to a new branch；Your original repository stays untouched"（workspaces/index.mdx，已见）。搜索页补充"Vibe Kanban uses git worktrees to create isolated workspaces for each task…No Conflicts: Agents can work on different tasks simultaneously without interfering"（https://vibekanban.com/docs/workspaces/ 摘要，2026-09-26 已见）。多个 workspace"Agents in different workspaces don't interfere with each other"（index.mdx，已见）。
- **setup/cleanup 脚本**：每个 worktree 是全新目录，官方要求项目配 setup script（如 `npm install`）："Each time a coding agent is executed it runs in a git worktree which is unlikely to contain your dependencies, configs, .env etc."（Creating Projects，https://vibekanban.com/docs/core-features/creating-projects ，已见搜索摘录）。这是 worktree 方案的真实成本：环境准备必须自动化。
- **交付物**：worktree 内提交 → PR（AI 生成描述）→ GitHub 上评审合并；也可在 UI 内直接 merge（多种合并策略，PR #3335 加了 rebase 与 --no-ff，https://github.com/BloopAI/vibe-kanban/pull/3335 ，已见）。
- **评审与人工接管**：diff 行内评论直接发给 agent；agent 出错时人可以 review/评论/改写重试/新开 session/删 workspace；官方文档称 "The agent only modifies files in your workspace - it cannot push code or merge without your explicit action"（workspaces/index.mdx 常见问题，已见；此为官方描述，本轮未做权限实测验证）。agent 状态有 Running/Idle/"Needs Attention"（举手图标）提示（同上）。
- **冲突处理**：base 分支前进后任务状态变 "Rebase conflicts"，三个选项：Resolve Conflicts（自动生成解决指令发给 agent 代解）、Open in Editor（人工改）、Abort Rebase（回退）（官方文档 Resolving Rebase Conflicts，https://vibekanban.com/docs/core-features/resolving-rebase-conflicts ，2026-09-26 已见）。"让另一个 agent 实例去解冲突"是官方支持的路径。

## ⑤ 失败恢复、预算/权限边界

- **失败恢复**：agent 会话走偏可"Start a new session"或"Edit messages to retry with different instructions"；彻底不行就删 workspace 重来（index.mdx，已见）。历史用户报告过进程级故障 "ExecutionProcess can stay 'running' after worktree is missing (ghost run, no logs)"（issue #1571，https://github.com/BloopAI/vibe-kanban/issues/1571 ，已见；当前是否仍存在未核实）。
- **worktree 生命周期是历史问题集中区**（以下均为历史用户报告，当前是否仍存在未核实）：merge 后未自动清理（issue #1764，https://github.com/BloopAI/vibe-kanban/issues/1764 ）、归档后残留 10+ 个 worktree 且 dev server 互相顶掉（issue #2907，https://github.com/BloopAI/vibe-kanban/issues/2907 ）、社区要求可配置的自动清理（issue #765，https://github.com/BloopAI/vibe-kanban/issues/765 ）——均 2026-09-26 已见。README 提供 `DISABLE_WORKTREE_CLEANUP` 环境变量，佐证清理机制存在（已见）。
- **权限边界**：Agent Profiles 提供 Codex 沙箱三档（read-only / workspace-write / danger-full-access）、审批四档（untrusted / on-failure / on-request / never）、以及带红色警告的 `dangerously_skip_permissions` 类开关（agent-configurations.md，已见）。默认设计（官方文档描述，未做权限实测）：agent 不能 push/merge，需人确认（index.mdx，已见）。
- **预算边界**：**未发现** token/费用预算控制功能；文档只有 reasoning effort（影响 token 消耗的提示性说明）与第三方 provider 的 env 注入，未见硬性花费上限。（2026-09-26 检索官方文档目录 llms.txt 与 agent 配置页，未发现，属限制而非确认不存在于全部代码。）
- **限制/反证（选一条展开）**：并行 worktree 并不能消灭合并冲突——官方 issue #1141："When base branch is ahead, the diffs for a worktree will include those changes"，多个任务从同一 base 并行开工，先合并的任务会污染后审任务的 diff，用户称"this happens a lot"（https://github.com/BloopAI/vibe-kanban/issues/1141 ，2026-09-26 已见）。另有 #1897：目标分支被另一 worktree 占用时 direct merge 静默失败（已见）。结论：worktree 解决"写冲突"，不解决"合并秩序"。

## ⑥ 对 fleet-studio 的借鉴判断

**适合借鉴的三点**：
1. **issue（看板卡片）与执行解耦，一卡多执行**：issue 文本即 agent prompt；官方支持一张卡连多个 workspace 并行跑不同 agent/方案，人工择优合并。其"卡片=需求、workspace=带分支的执行环境（可含多个 session 与多个仓库）、session=一次 agent 会话"三层抽象边界清晰。适用条件：fleet-studio 若采用 git 分支型隔离，此分层值得参考；若采用容器/云端沙箱，则需另行设计对应抽象（出处见②③）。
2. **worktree 隔离 + 显式 PR/merge 门禁**：官方文档描述默认 agent 只能改 worktree、push/merge 需人操作；diff 行内评论回流成 agent 的 follow-up 指令。适用条件：适合以人工验收为闸门的流程；若目标场景是全自动无人值守合并，此模式会成瓶颈，且并行下的合并秩序问题该产品也未解决（见⑤限制/反证）（出处见④）。
3. **Agent Profiles（可复用的权限/模型/模式预设）**：把"快速试错档 / 稳妥审批档"做成可切换 profile，配三档沙箱、四档审批。适用条件：当同一 agent 需按任务风险等级切换权限时有价值；profile 的粒度、命名与默认档位需结合自身工作流重新设计，非拿来即用（出处见⑤）。

**不适合照搬的两点**：
1. **对"免费用户为主、未找到可持续模式"保持警惕（仅限该公司个案，不外推到品类）**：bloop 因 "the vast majority are free users and we couldn't find a business model" 关停（shutdown 公告原文，已见）。证据仅说明该公司未找到可持续模式，不能证明整个品类不可行；对 fleet-studio 的启示是尽早验证付费意愿，而非推断某类商业模式不可行。
2. **执行目录生命周期管理宜前置设计（基于历史用户报告）**：merge 后 worktree 未自动清理（#1764）、归档后残留大量 worktree 且 dev server 互相顶掉（#2907）、社区请求可配置自动清理（#765）——均为历史用户报告，当前是否仍存在未核实。fleet-studio 若采用类似机制，宜把"执行目录生命周期（创建→活跃→合并→保留期→回收）"作为前置设计项，以降低出现同类问题的概率。

## 附：事实清单与来源分级

| # | 事实 | 来源 | 分级 |
|---|---|---|---|
| 1 | 2026-04-10 公告 sunsetting、公司关停、转社区维护；公告当时安排远程服务自公告日起约 30 天后下线（历史安排，当前状态未实测） | https://www.vibekanban.com/blog/shutdown | 官方说明（已见原文，含页面署名日期） |
| 2 | 10+ 编码 agent 可切换；issue 描述即 agent prompt | https://github.com/BloopAI/vibe-kanban ；https://vibekanban.com/docs/issue-management.md | 已见源码库 README / 官方文档 |
| 3 | workspace=worktree+新分支，原仓库不动；官方文档描述 push/PR 需人操作（未做权限实测） | https://github.com/BloopAI/vibe-kanban/blob/main/docs/workspaces/index.mdx | 官方文档（已见原文） |
| 4 | 一张 issue 可连多个 workspace 并行（一对多）；子任务状态独立、不自动回写父卡 | https://vibekanban.com/docs/issue-management.md | 官方文档（已见原文） |
| 5 | Rebase 冲突三选一，可让 agent 自动解 | https://vibekanban.com/docs/core-features/resolving-rebase-conflicts | 官方文档（已见原文） |
| 6 | Codex 沙箱三档、审批四档、dangerously_ 前缀红色警告 | https://vibekanban.com/docs/settings/agent-configurations.md | 官方文档（已见原文） |
| 7 | 并行任务 diff 被先合并任务污染（#1141）、direct merge 静默失败（#1897）、worktree 残留（#1764/#2907/#765） | 对应 issue URL | 官方 issue（历史用户报告+维护者互动，未逐条验证复现，当前是否仍存在未核实） |
| 8 | 许可证 Apache-2.0 | https://github.com/BloopAI/vibe-kanban/blob/main/LICENSE | 已见源码 |
| 9 | 关停前云定价 $0/$30 每用户每月/Enterprise 定制（历史口径，订阅已随公告终止） | https://vibekanban.com/pricing ；https://www.vibekanban.com/blog/introducing-vibe-kanban-cloud | 官方（pricing 页仅见搜索摘要，未打开全文） |
| 10 | 该公司关停时自述原因："vast majority are free users and we couldn't find a business model"（公司个案，不外推） | https://www.vibekanban.com/blog/shutdown | 官方说明（已见原文） |

**未核实边界**：① pricing 页全文未逐页打开，企业版条款细节未知，且该定价为关停前历史口径；② 各 issue 的修复状态未逐一追踪，文中涉及 issue 均按历史用户报告记录，当前是否仍存在未核实；③ 关停公告（2026-04-10）安排的 30 天远程服务期是否按期执行、云服务当前可用性未实测；④ 关停后"社区维护版 roadmap"官方说 "over the next few weeks" 发布，截至 2026-09-26 未检索到已发布版本；⑤ 未阅读后端源码验证 worktree 清理与 ghost-run 的实际实现；未做 agent push/merge 权限实测，相关表述均为官方文档描述。
