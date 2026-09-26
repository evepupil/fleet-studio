# 08 - Ruflo（原 Claude Flow）多智能体编排调研

- 调研日期：2026-09-26（所有访问日期同此）
- 入口：https://github.com/ruvnet/ruflo ；候选 UI：https://flo.ruv.io（页面取证，未做交互操作）
- 证据标注：【源码】=已读仓库内文件/接口返回；【仓库文档】=仓库内设计文档（非实现验证）；【官方说明】=官方文档原文；【页面取证】=本次抓取的页面内容；【宣传】=README/徽章数字；【提案】=未合并 PR/issue；【未核实】=未见证据

## ① 产品身份与官方链接

Ruflo 是原 Claude Flow 的改名，定位为围绕 Claude Code / Codex 的"代理线束（harness）"。README 背景：*"Claude Flow is now Ruflo"*（https://github.com/ruvnet/ruflo ，README"Background"节【源码】）。副标题：*"An agent meta-harness for Claude Code and Codex"*（同页【官方说明】）。npm 包名 `ruflo`，许可证 MIT（gh api repos/ruvnet/ruflo 返回 `license.spdx_id = MIT`【源码】）。官网首页指向 Cognitum.One（同 API【源码】）。**未发现定价页**；README 徽章称 UI 为 Beta（*"Try the UI Beta — flo.ruv.io"*【宣传】），是否收费未核实。

## ② 目标用户与一条实际工作流程

面向已用 Claude Code/Codex 的开发者，想给单人工作流加协调、记忆与多代理。官方指南给出一条保守的落地流程（https://github.com/ruvnet/ruflo/blob/main/docs/ruflo-explained.md 第10章【官方说明】）：先只读评审——*"Keep the first pass read only. Do not install dependencies… edit files, publish, or deploy"*；人审计划后只授权一处改动——*"Implement only the agreed input validation change… Stop before committing or deploying"*，交付物是"改动+证据"而非一句 done。同文第12章给出成本口径：*"one coordinator, a few genuinely independent tasks, a fixed budget, and a clear finish line"*。

## ③ 看板 / 任务层级 / 角色协作

- **本轮未找到可验证的完整持久任务看板**。检索边界：flo.ruv.io 页面取证、仓库代码搜索（kanban/board）、issue/PR 检索各一轮，未克隆 544MB 全仓，不排除未检索位置存在看板实现。已见证据：
  - flo.ruv.io 页面取证显示**聊天窗口**（"Welcome to RuFlo, your intelligent workflow automation assistant"），未见看板入口【页面取证】；
  - 仓库内 `v3/goal_ui/src/components/agents/TaskBoard.tsx` 的任务列表是**硬编码演示数据**（`const tasks = […]` 静态数组，todo/in-progress/blocked/done 四列）（https://github.com/ruvnet/ruflo/blob/main/v3/goal_ui/src/components/agents/TaskBoard.tsx 【源码】）；
  - PR #951"localhost kanban board"（Backlog→Active→Review→Done、SQLite 持久化）返回 `merged: false`，**已关闭未合并**，不能作为可用功能证据【提案】（https://github.com/ruvnet/ruflo/pull/951 ）。
- **角色分工有源码依据**：`.agents/skills/` 下有 queen-coordinator、hierarchical-coordinator、worker-specialist 等大量 agent 定义文件【源码】；指南第3章：*"Hierarchical coordination gives one coordinator responsibility for integration"*【官方说明】。
- README 宣称 *"100+ specialized agents"*、"98 agents, 60+ commands"【宣传】，与仓库文件量级相符，但**单个 agent 是否真能用好未核实**；指南自评：*"Treat its feature list as a map to investigate, not a claim that every feature is enabled"*（ruflo-explained 第3章）。
- **任务依赖与交接**：联邦机制用"claims"防撞车——*"Before starting shared work, an agent posts a claim on a resource; one owner per resource, first valid claim wins"*（ruflo-explained 第14章【官方说明】）。

## ④ 工作目录隔离 / 交付物 / 评审与人工接管

`npx ruflo init` 会向工作区写入 `.claude/`、`.claude-flow/`、`CLAUDE.md` 等（README Quick Start 表【源码】）——这是脚手架落盘，**未见按 agent 隔离工作目录/worktree 的机制**【未核实】。人工接管靠"先只读、后单点授权、验收测试+停止条件"的流程约定（见②）。secret 防护有门：ADR-G007 提到 *"Secrets gate (evaluateSecrets) scans memory write content for secrets before storage"*（https://github.com/ruvnet/ruflo/blob/main/v3/@claude-flow/guidance/docs/adrs/ADR-G007-memory-write-gating.md 【仓库文档】）。

## ⑤ 共享记忆 / 写冲突 / 失败恢复 / 预算权限

**ADR-G007（Status: Accepted，2026-02-01）是仓库内对"写冲突"的已接受设计方案（设计文档，本轮未见对应实现代码验证）**【仓库文档】（https://github.com/ruvnet/ruflo/blob/main/v3/@claude-flow/guidance/docs/adrs/ADR-G007-memory-write-gating.md ）：明确列出风险 *"A coder agent overwrites the architect's design decisions"*，方案为四件套：按角色的命名空间写权限（示例规则 `[R050] Only coordinator agents may write to swarm/task-assignments namespace`）、违规速率限流、TTL/衰减、矛盾检测（`areContradictory()`）。**该 ADR 自述局限（设计层面自述，未实测）**：*"If an agent bypasses MCP (direct database access), the gates are ineffective"*；*"No built-in TTL engine"*；且设计方案中明确**否决了用 CRDT 解决记忆写冲突**（*"Rejected because CRDTs solve a different problem"*）。

失败恢复：CLI 提供 `npx ruflo doctor` 健康检查，但指南承认 *"Some advanced subsystem checks reported `unknown`, not `healthy"`"*、*"`doctor --fix` prints suggested commands"*（第13章【官方说明】）。持续运行：README 列有 autopilot（自主循环）、loop-workers（定时后台任务）、daemon【宣传级，未实测】；指南要求先定预算和停止条件（第3章）。README 宣称的 *"314 MCP tools"*、*"8.1M+ downloads"* 均按宣传处理，指南自己都说 333 tools 的计数 *"describes the available interface, not 333 capabilities proven"*。

## ⑥ 对 fleet-studio 的借鉴判断

**适合借鉴三点：**
1. **任务看板应是"可执行的持久化状态"而非展示层（建议）**——已见的两处看板均不可用作证据（TaskBoard.tsx 演示数据、PR #951 未合并），但"看板列（待办/进行/阻塞/完成）+ 持久化 + agent 指派"的组合在 PR #951 设计中有参考价值，fleet-studio 若做看板需自行验证落地。
2. **记忆写门控的角色模型（建议）**：ADR 提出的按角色授予命名空间写权限（coder 不许覆盖 architect 的决策）+ 矛盾检测 + 违规限流，思路清晰，可作为候选简化移植，落地前需自行验证实现成本。
3. **"claims 独占"防撞车（建议）**：一资源一主人、先声明先得、只有主人能移交，为多代理领任务提供互斥语义（官方说明，机制未实测），值得评估。

**不适合照抄两点：**
1. **百级 agent 定义 + 314 MCP 工具的海量货架**：维护成本极高，官方自己都承认多数功能未验证，fleet-studio 应做少数几个真能跑通的角色。
2. **联邦/Nostr 跨机协作层**：引入密钥、中继、邀请制和网络信任边界，与"低复杂度看板协作"目标不匹配。

## 限制与反证（必读）

- 本轮检索范围内未找到可验证的完整持久任务看板：页面取证为聊天窗、TaskBoard.tsx 为演示数据、PR #951 未合并；此结论限于上述检索边界，不能推出主干完全没有看板。
- ADR-G007 自认 MCP 旁路即失效；doctor 多项 unknown。
- 未搜到独立第三方评测/价格页（记为未发现，不视为不存在风险为零）。

## 未核实边界

- 98/100+ agent 的实际协作质量、autopilot/daemon 的稳定性、按 agent 的工作目录隔离，均未实测；未克隆 544MB 全仓（API 视图替代）。
