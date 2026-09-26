# 04 - Gas Town 调研（多智能体协作方向）

调研日期：2026-09-26（所有链接当日访问）。角色：collector。
取证方式与等级分三级：**A 官方仓库文档**＝gastownhall/gastown 克隆到本地读 README/docs 的 Markdown 与文件树（**未读 Go 实现代码，读文档≠验证代码**）；**B 官方文章/宣传**＝yegge.ai 作者文章；**C 官方 issue**＝gh 只读查询。官方文档站 gastown.dev/docs.gastownhall.ai 仅见于搜索摘要未逐页打开。未爬全站，核心页面约 6 个。

## ① 产品身份与官方链接

- **身份（已核实）**：Gas Town，"Multi-agent orchestration system for Claude Code, GitHub Copilot, and other AI agents with persistent work tracking"。官方仓库 `steveyegge/gastown` 现重定向到 **gastownhall/gastown**（gh api 确认 `full_name = gastownhall/gastown`，未归档，最近推送 2026-09-18）。
  - 证据：https://github.com/gastownhall/gastown 原文 "Gas Town - multi-agent workspace manager"（仓库描述，gh 查询）
- **许可证（已核实）**：MIT，"Copyright (c) 2025 Steve Yegge"。https://github.com/gastownhall/gastown/blob/main/LICENSE
- **价格**：未发现官方定价；作者称运行成本高属宣传口径："Gas Town is also expensive as hell."（指 LLM API 开销）https://yegge.ai/essays/welcome-to-gas-town/

## ② 目标用户与一条实际工作流程

- **目标用户（官方说明/宣传）**：高阶多会话玩家。作者原文："Do not use Gas Town if you do not juggle at least five Claude Codes at once, daily." "If you're not at _least_ Stage 7... you will not be able to use Gas Town."（Stage 7 ≈ 同时手管 10+ 个 agent）。https://yegge.ai/essays/welcome-to-gas-town/
- **实际工作流程（官方 README 的 MEOW 模式，已见文档）**：
  1. 人对 **Mayor**（镇级协调 agent）说出目标；
  2. Mayor 拆成 **Beads**（任务原子）并创建 **Convoy**（运输队，捆绑多个 bead 的持久跟踪单元）；
  3. Mayor 用 `gt sling` 把 bead 派给 **Polecats**（临时工人 agent）；
  4. Polecat 干完后 `gt done`：推分支、向合并队列提交 MR、自我退出会话；
  5. **Refinery**（炼油厂，每 rig 一个）批处理合并请求、跑验证门、按 Bors 式两分法合入 main（Bors：源自 Rust 项目的合并机器人思路——把多个 MR 打包成批整体跑测试，失败则二分定位坏 MR 剔除重试；此为 README 宣称，与设计文档分期表互有出入，见④）；
  6. **Witness/Deacon** 巡检卡死并恢复；堵住的事按严重度升级给 **Overseer（人类）**。
  - 证据：https://github.com/gastownhall/gastown#readme 原文 "Convoys 🚚 Work tracking units. Bundle multiple beads that get assigned to agents."

## ③ 看板/任务层级/角色与协作

- **任务层级（已见文档）**：Convoy（批次/看板单元，中文可理解为“运输队/里程碑”，`gt convoy status/list` 即仪表盘）→ Bead（原子任务，前缀+5 位 ID 如 `gt-abc12`）→ Molecule（多步工作流模板，中文可理解为“分子”：一个公式实例化出带依赖的步骤链，每步有检查点）。Convoy 标 `mountain` 后有史诗级任务的自动卡死检测与智能跳过。https://github.com/gastownhall/gastown/blob/main/docs/concepts/convoy.md 原文 "A **convoy** is a persistent tracking unit that monitors related issues across multiple rigs."
- **持久任务账本（资料不一致，后端细节未专项核实）**：作者旧文章称 Beads 以 JSON 逐条存进项目 git 仓库（"Beads are stored in JSON (one issue per line) and tracked in Git"），并称 "There is no 'alternate backend' for Gas Town"；但当前 README 原生安装前置依赖表列 **Dolt、Beads（bd 0.57.0+）、sqlite3、tmux**。两处口径不一，本轮未读存储实现，不作"唯一后端/零外部依赖"结论，仅确认存在随项目持久化的结构化任务账本。https://yegge.ai/essays/welcome-to-gas-town/ ；依赖表见 https://github.com/gastownhall/gastown#readme
- **角色分工（已见 glossary/docs）**：Town（总部 `~/gt/`）级：Mayor（协调）、Deacon（后台巡检守护进程）、Dogs（杂务工人）；Rig（项目仓库）级：Witness（polecat 生命周期管理）、Polecats（临时工人）、Refinery（合并队列）、Crew（长期 Named agent，跨会话保持上下文）。第八角色 **Overseer＝人类本人**，"you have an identity in the system, and your own inbox"。https://github.com/gastownhall/gastown/blob/main/docs/glossary.md
- **协作方式（已见文档）**：邮箱信件（`gt sling` 派活＝把任务挂到对方 Hook 上等执行；`gt nudge` 即时催促＝不经邮件系统的实时提醒）；工作状态存于 Beads 账本与 git-backed hooks（README 表述："Work state stored in Beads ledger"），不靠 agent 记忆。可裁剪：作者《Emergency User Manual》称可以不用 Refinery——“Just tell the Mayor to shut down the rig and sling work to the polecats with the message that they are to merge to main directly. Or... the Mayor can merge them manually.”（小团队可降级为工人直接合 main / 人手合）https://steve-yegge.medium.com/gas-town-emergency-user-manual-cf0e4556d74b

## ④ 目录隔离、交付物、评审与人工接管

- **隔离（已见文档）**：每个 rig 是独立 git 仓库；agent 的 Hook 是该仓库的 **git worktree**（工作树：同一仓库检出的独立目录，互不干扰、共享版本历史），"Work survives agent restarts"，崩溃可回滚。跨项目协作“用 worktrees，不要把狗派过去”（docs/overview.md:111）。交付物是 MR（合并请求），合并权集中在 Refinery，工人无权直接动 main。
- **评审/合并队列（资料不一致，未读实现）**：README 宣称 "The refinery processes MRs through a batch-then-bisect merge queue (Bors-style). This is a core capability, not a pluggable strategy."，失败 MR "fixed inline or re-dispatched"；但 docs/design/architecture.md 分期表将批内两分、预验证标注 "Blocked by Phase 1/2"。两份官方资料互有出入，本轮未读实现代码，当前版本是否支持批两分不作判定。https://github.com/gastownhall/gastown/blob/main/docs/design/architecture.md
- **人工接管（已见文档）**：Overseer 有身份与收件箱；Escalation 分三级路由：CRITICAL(P0)→"bead + mail + email + SMS"（直达人类），HIGH(P1)→邮件，MEDIUM(P2)→只发 Mayor。链路 Agent→Deacon→Mayor→Overseer，每级可解决或上转，过程写进 bead 评论。https://github.com/gastownhall/gastown/blob/main/docs/design/escalation.md

## ⑤ 失败恢复与预算/权限边界

- **宕机恢复（已见文档）**：状态存 git hooks + Beads，"If the workflow is captured as a molecule, then it survives agent crashes, compactions, restarts, and interruptions."（上下文压缩也不丢）。另有 **Seance**（降神会，中文可理解为“询问前任”：新会话通过 `.events.jsonl` 日志发现并提问前任会话，找回中断前的决策上下文）；Polecat 状态机含 Stalled（卡死）/Zombie（僵尸：活干完但退出失败）终态，Witness 负责巡检回收。https://github.com/gastownhall/gastown/blob/main/docs/concepts/polecat-lifecycle.md 原文 "clean completion retires the live polecat session"
- **并发/配额边界（官方说明）**：**Scheduler** 为容量治理器，`scheduler.max_polecats` 限制并发派工，"Prevents API rate limit exhaustion by batching dispatch"。这只是并发/配额治理（限制同时在跑的 agent 数），**不是货币预算硬停**；未见按金额停机的机制（未专项核实）。https://github.com/gastownhall/gastown#readme
- **权限边界（官方自认短板，Proposal 提案）**：沙箱执行文档明说 "Every polecat today runs directly on the host machine... with full access to the host filesystem, network, and credentials... Credential exfiltration is a real threat." 沙箱方案标注 **Status: Proposal**。https://github.com/gastownhall/gastown/blob/main/docs/design/sandboxed-polecat-execution.md

## ⑥ 限制与反证（明确列出）

1. **健康检查缺陷报告（官方 issue，开放状态，未复现）**：#4614 报告 `gt health` 的 zombie 检测仅按进程名匹配，把别的 town 的健康 dolt 服务器误报 36+ 小时、同时漏掉同机 5 个真僵尸，且巡检指引会诱导 agent 杀掉别人活库。issue 开放只说明报告未关闭，不保证缺陷在当前版本未修复，本轮未复现验证。https://github.com/gastownhall/gastown/issues/4614
2. **官方资料互有出入**：合并队列批两分——README 宣称已支持、设计文档分期表标 "Blocked"；沙箱执行文档自认现状无沙箱（polecat 全权访问宿主机）、方案标 Proposal。引用时必须区分"设计文档/宣称"与"已验证实现"，本轮均未读实现代码。
3. **Windows 支持有限（官方 README）**："For full tmux-backed workflows on Windows, use WSL... Native Windows shells are best treated as minimal CLI-only environments."；原生 Windows 的 CGO/ICU 构建需 MSYS2。即官方完整流程推荐 WSL、原生 Windows 仅部分 CLI 可用，未核实全部命令在原生 Windows 的可用范围。https://github.com/gastownhall/gastown#readme
4. **使用门槛即反证**：作者明说少于 5 个并行 Claude Code 就别用；"hands-on-the-wheel"——并非全自动。
5. **未发现项**：未搜到官方定价页；未发现支持非 git 版本控制的迹象（Beads 强绑 git）。另 README 提到 **Wasteland**（跨 town 的联邦协作网络，经 DoltHub 认领任务、积累可携带声誉），仅见宣传性描述，未核实可用性。

## 值得 fleet-studio 借鉴的三点

1. **持久任务账本**（Beads 模式）：任务/事件/依赖为随项目持久化的结构化条目，agent 崩溃/重启后按账本续作（官方文档口径）。注意其当前原生安装依赖 Dolt/Beads/sqlite3，具体后端未专项核实——借鉴点在"账本与代码同仓持久化、崩溃即续作"的思想，不绑定其实现选型。
2. **合并秩序集中交付**：工人只产出 MR、`gt done` 后自我退役（“会话即牛，身份即 CV”：会话用完即弃，完成记录累积成履历），合并/验证权收归单一 Refinery，批处理+验证门避免工人互相 rebase 打架（Bors 式细节为 README 宣称，实现未验证）；失败任务自动转“修复任务”回流队列。
3. **分级升级到人**：Deacon→Mayor→Overseer 的逐级兜底 + P0 直达短信/邮件，把"人工接管"做成系统内一等角色（有身份、有收件箱），而不是临时打断。

## 不适合借鉴的两点

1. **单机本地多会话取向**：核心流程以本机 tmux 会话编排各角色，官方完整流程推荐 WSL、原生 Windows 仅 minimal CLI；跨机/云端执行仅见提案（daytona 沙箱，Status: Proposal）与联邦网络宣传（Wasteland，未核实可用性）。fleet-studio 若以跨机/云端看板为主形态，不能照搬其本地会话编排假设。
2. **工人无沙箱、全权访问宿主机**：官方自认凭据外泄风险，沙箱仍是提案；作为对外产品不能照抄"直接跑在用户主机"的模型。

## 最重要的 3 个出处

1. https://github.com/gastownhall/gastown （README + docs/ 的 Markdown，身份、角色、架构、Windows 支持口径；取证等级 A，未读 Go 实现代码）
2. https://yegge.ai/essays/welcome-to-gas-town/ （作者文章：目标用户、Overseer、Beads 口径、崩溃恢复；取证等级 B，宣传口径且早于当前 README 依赖表）
3. https://github.com/gastownhall/gastown/blob/main/docs/design/escalation.md （升级协议：严重度路由与人工接管；取证等级 A）

## 未核实边界

- 合并队列批内两分（Bors 式）是否已在当前版本实现：README 与设计文档口径不一，未读实现代码，不判定。沙箱执行未验证是否已上线（文档标 Proposal）。
- gastown.dev 与 docs.gastownhall.ai 仅来自搜索摘要，未逐页打开核对（仓库内 docs 为准）。
- "expensive as hell" 无官方成本数字；Convoy `mountain` 自动跳过逻辑未实测。
