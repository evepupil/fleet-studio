# Paperclip 调研：用「公司模型」把 agent 管成团队

- 调研日期：2026-09-26（所有引用均为当日实际访问）
- 目的：核实 Paperclip 是否真的通过组织/任务/预算/审批把 agent 管成团队，并提炼对 fleet-studio（Multica 式、带任务看板的军团产品）有用的最小能力。
- 取证方式：全部真实联网，取官方仓库、官方文档站原文（raw markdown），未做任何凭印象补齐。

## ① 产品身份与官方链接（已见源码/官方说明）

- 名称：Paperclip，定位「the app people use to manage AI agents for work」；GitHub 组织为 **paperclipai**（成立于 2026-02-27，官网 paperclip.ing），主仓库 https://github.com/paperclipai/paperclip ，当日 `gh` 实测：MIT License、最近推送 2026-09-26T01:00Z（活跃）。README 开头："**If OpenClaw is an _employee_, Paperclip is the _company_.** Paperclip is a Node.js server and React UI that orchestrates a team of AI agents to run a business."（原文，README.md）
- 文档站：https://docs.paperclip.ing ；官网 https://paperclip.ing ；npm 包名 `paperclipai`。
- 形态：开源自托管控制平面（control plane）。官方定义："Paperclip is the control plane for autonomous AI companies … One instance of Paperclip can run multiple companies."（docs/start/what-is-paperclip.md 原文）。README 明确"Open source. Self-hosted. No Paperclip account required."
- 许可证：MIT（gh API `licenseInfo` 实测 + README badge），版权方 Paperclip Labs, Inc。价格：官方页面无 SaaS 定价，成本全部是用户自付的模型 API 费（costs.md 明示 "This isn't a Paperclip fee; it's a cost you pay directly to the AI provider"）。

## ② 目标用户与一条实际工作流程（官方说明）

目标用户（README "Paperclip is right for you if" 原文要点）：想搭自治 AI 组织的人；"You have **20 simultaneous Claude Code terminals** open and lose track of what everyone is doing" 的多 agent 重度用户；要 7×24 自治但保留审计与介入权的人；要监控成本和执行预算的人。

官方三步流程（README 表格原文：Define the goal → Hire the team → Approve and run）：

1. 定公司目标："Build the #1 AI note-taking app to $1M MRR"；
2. 招团队：CEO、CTO、工程师、设计师、营销，任意 runtime；
3. 审批并运行：审 CEO 战略、设预算、点开始，看板监控。

细化后（core-concepts.md）：设目标 → CEO 创建战略并提交人审批 → 批准后 CEO 拆任务、按角色指派 → agent 以心跳方式领任务执行 → 人通过审批队列/看板监督。

## ③ 看板 / 任务层级 / 角色与协作方式（已见官方文档）

- **任务层级**：issue 是工作单元，带 parent issue，一路追溯到公司目标。managing-tasks.md 原文示例："Company Goal: Build the #1 AI note-taking app └── Build authentication system └── Implement JWT token signing"，并称 "This keeps agents aligned — they can always answer 'why am I doing this?'"。状态机：`backlog -> todo -> in_progress -> in_review -> done`，可转 `blocked`；done/cancelled 为终态。
- **看板**：任务按 project 分组，dashboard 按状态统计、高亮停滞任务；活动流（activity log）记录全部变更。
- **角色/组织**：每个 agent 有 adapter、角色（CEO/CTO/manager/general/worker 等）、title、汇报线、能力描述、预算、状态；"Agents are organized in a strict tree hierarchy. Every agent reports to exactly one manager (except the CEO)"（core-concepts.md 原文）。汇报链用于升级（escalation）与委派；第一个 agent 强制是 CEO（agents.md：'The first agent you create is always the CEO — there's no way around this'）。
- **协作方式（心跳）**：agent 不常驻，靠 heartbeat 短暂唤醒：定时器、任务指派、@-mention、人工 Invoke、审批结果均可触发；每次心跳内"查身份→看任务→领任务→checkout→干活→更新状态"（core-concepts.md heartbeat protocol 原文）。delegation 沿组织树上下流动（README）。
- **防冲突**：进入 in_progress 需要**原子 checkout**，同一任务只有一个 agent 能持有；并发抢占返回 409 Conflict（core-concepts.md 原文）。另有 blocker 依赖、父/子任务委派（子任务带 parentId+goalId）。

## ④ 工作目录隔离、交付物、评审与人工接管（官方文档/仓库）

- **工作目录**：agent 配置里有 Working directory (cwd)（agents.md Configuration Tab 原文）；README "Workspaces & Runtime"："Project workspaces, isolated execution workspaces (**git worktrees, operator branches**), and runtime services (dev servers, preview URLs). Agents work in the right directory with the right context every time."
- **issue 级隔离工作区**：`skills/paperclip/references/issue-workspaces.md`（仓库内 agent 技能文档）显示每个 issue 可有 isolated execution workspace（`cwd`/`branchName`/`status`），支持 `inheritExecutionWorkspaceFromIssueId` 保持连续性，并有运行时服务（dev server/preview URL）的 start/stop/restart API 与 MCP 工具，QA agent 可直接取预览 URL 做浏览器验证。
- **交付物/验证**：README 四支柱表格原文："verify from diffs, screenshots & tests"；runs 记录里有 Artifacts & Work Products（roadmap 已完成项）。
- **评审**：状态机把 `in_review -> done` 画为正常路径（core-concepts.md / managing-tasks.md），但官方只给状态图，未见"必须经 in_review 才能置 done"的服务器强制说明——按文档流程建议对待，是否硬约束未实测。README："Paperclip orchestrates work, not pull requests. Bring your own review process."（原文明示不接管 PR 评审）。
- **人工接管**：审批队列 + board override：人可随时 pause/resume/terminate 任何 agent、重派任何任务、绕过 CEO 直接招人（approvals.md "Board Override Powers" 原文）。注意边界：平台审批仅覆盖审批队列内动作（招聘、CEO 战略、预算恢复）；README "Nothing ships without your sign-off" 是治理宣传语，不能据此推断所有外部提交/发布都有技术拦截——agent 在外部 runtime 的命令与提交权限由 adapter 自身配置决定（如 Codex 的 sandbox/approvals bypass 选项，agents.md Configuration Tab），强制边界未实测。

## ⑤ 失败恢复、预算 / 权限边界（官方文档）

- **审批三类**：Hire Agent（agent 提招聘案，含角色/adapter/汇报线/申请的月预算，人可 Approve/Reject/Request Revision）；CEO Strategy（战略不批，CEO 不能把任务推进 in_progress——approvals.md 原文："The CEO cannot move tasks to 'in progress' until you approve its strategy"）；Budget Override（预算硬停后的恢复审批）。修改请求（Request Revision）可无限轮次。
- **预算**：公司/agent 月度预算 + 项目终身预算三层；costs.md 原文流程："At 80%: Paperclip records a warning … At 100%: The agent is automatically paused. No further heartbeats are triggered."月度预算 UTC 每月 1 日重置，纯预算暂停的 agent 自动复活。成本按公司/agent/项目/目标/issue/provider/model 多维记账，含缓存折扣后的实付金额。官方文档对 worker agent 月花费有两处互相不一致的估计，不宜外推，本文不引用具体数字；且 API/token 费仅为模型侧成本，自托管的服务器/存储/运维等用户总成本未计入。
- **失败恢复**：heartbeat 队列为 DB-backed，"Recovery handles orphaned runs automatically"（README 原文）；run 级提供 Cancel/Retry/Resume（进程丢失的 run 带 `resumeFromRunId` 续跑，agents.md Runs Tab）；agent 配置每次修改存 revision，可一键回滚到历史版本（agents.md Configuration Revisions）；paused agent 的任务保留，恢复后继续。
- **权限边界**：两种部署模式（trusted local / authenticated）；agent 用 API key + 短期 run JWT 调控制面，"Every mutating request is traced to an actor"（README）；密钥实例/公司两级隔离，"Sensitive values stay out of prompts unless a scoped run explicitly needs them"；多公司数据完全隔离。

## ⑥ 对 fleet-studio 的启示

**适合借鉴的三点：**

1. **目标→任务单一追溯链 + 原子 checkout**。每条任务带 parent/goal 链，agent 永远知道 why；in_progress 用原子 checkout（409 冲突）保证一个任务同时只归一个 agent——这是军团不互相踩踏的最小机制，比任何复杂调度都便宜。
2. **心跳模型 + 会话/任务保留**。agent 不常驻执行可省资源（官方称两次心跳间 dormant、"consumes no budget"），但定时唤醒本身仍可能产生 token 用量，并非零成本；失败 run 可 Retry/Resume（resumeFromRunId 续跑）。这直接解决"多开终端、重启丢上下文"的痛点。
3. **两段式预算硬停**。80% 警告、100% 自动暂停 + 月度重置，配合公司/agent/项目三层作用域与实付（缓存折扣后）记账。多 agent 产品必须内置这种"到钱就停"的闸门，而不是事后报表。

**不适合照搬的两点：**

1. **完整"公司拟人"隐喻（CEO 强制首招、汇报树、招聘审批）**。它把组织当产品本体，学习成本和仪式感重。本轮方案假设 fleet-studio 用户是管少量到二十个左右 agent 的开发者（该假设未经验证），扁平看板 + 角色 tag 更贴近此假设场景，树状层级与 CEO-first 流程学习成本高。另：Paperclip 官方定位不限于编程（README 提到设计师、营销角色），本轮不排除非编码 agent 的调研方向。
2. **领域漂移：为"经营公司"设计的目标/战略/财务体系**。战略审批、Billers/Finance 台账、订阅配额窗口等是为无人公司运营设计的；coding 军团的核心是仓库、PR、评审，Paperclip 自己也承认 "Bring your own review process"。这套财务/战略面应舍弃，换成代码评审与分支策略集成。

**限制/反证（已见）：**

- README 明确 "Not a code review tool … Bring your own review process"、"Not a workflow builder. No drag-and-drop pipelines"——它不提供 PR 级评审与可视化流水线，评审深度弱于 coding 工作流工具。
- 官方文档中 agent 月花费估计相互矛盾且强依赖模型/上下文长度（具体数字已从本文删除），未见独立实测数据（未核实）。
- 密集心跳/多 agent 并发下的 token 成本膨胀问题，官方以 cost-saving tips 承认需人工调优（如降心跳频率、写短任务描述），未见自动优化的证据。
- 其余（如移动端实际体验、多用户 RBAC 细粒度）本轮未查，不构成反证也不排除。

## 未核实边界

- 未抓取官网首页/产品页截图与宣传页（paperclip.ing/product 等）原文，本文官网表述均来自 README 与 docs 的转述。
- Heartbeat 调度实现细节（DB 队列、coalescing）只有 README 一段说明，未读对应源码验证。
- roadmap 中"Memory / Knowledge、Work Queues、Self-Organization"等为未完成项（⚪），属提案/计划，非现有能力。
- 价格：MIT 开源、无 SaaS 定价页已确认；但自托管最低硬件/成本组合未见官方数据。

---

### 附：关键出处（访问日期均为 2026-09-26）

| # | 出处 | 性质 | 关键证据 |
|---|------|------|----------|
| 1 | https://github.com/paperclipai/paperclip （README.md, raw master） | 官方仓库 | "If OpenClaw is an employee, Paperclip is the company"、四支柱、What Paperclip is not、MIT |
| 2 | https://raw.githubusercontent.com/paperclipai/paperclip/master/docs/start/core-concepts.md | 官方文档 | 组织/agent/issue/委派/心跳/治理六概念、原子 checkout 409、心跳协议 |
| 3 | https://raw.githubusercontent.com/paperclipai/paperclip/master/docs/guides/board-operator/managing-tasks.md | 官方文档 | 任务字段、parent 层级示例、状态机 |
| 4 | https://docs.paperclip.ing/guides/day-to-day/approvals.md | 官方文档 | Hire/Strategy/Budget 三类审批、board override、revision 轮次 |
| 5 | https://docs.paperclip.ing/guides/day-to-day/costs.md | 官方文档 | 80%/100% 预算硬停、三层预算、成本多维记账与缓存折扣 |
| 6 | https://docs.paperclip.ing/guides/org/agents.md | 官方文档 | 心跳生命周期、CEO-first、cwd、配置 revision 回滚、Retry/Resume |
| 7 | https://raw.githubusercontent.com/paperclipai/paperclip/master/skills/paperclip/references/issue-workspaces.md | 官方仓库（agent 技能参考） | issue 级隔离工作区（git worktree/branch）、运行时服务 API、工作区继承 |
| 8 | https://raw.githubusercontent.com/paperclipai/paperclip/master/docs/start/what-is-paperclip.md | 官方文档 | "control plane for autonomous AI companies"、多公司、两层架构 |

（另：`gh repo view paperclipai/paperclip --json licenseInfo,pushedAt` 于 2026-09-26 实测返回 MIT、pushedAt 2026-09-26T01:00:13Z，为 GitHub API 实时取证。）

STAR 数不作为可靠性依据，故未在正文引用（仓库 star 数仅供参考：85k+，勿用于论证正确性）。
