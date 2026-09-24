# 接入层 · skill 与苦工提示词

> 模块定位：注入模型上下文的两类规矩——教主会话怎么经 fleet 派活的五份 skill，和苦工的五个角色提示词；以及把它们装进宿主的脚本 · 对应代码：`skills/`、`roles/`、`scripts/install-skills.mjs`、`scripts/install-roles.mjs`、`packages/cli/test/skills.test.ts` · 所属里程碑：[M4 fleet 系列 skill 与苦工提示词](../roadmap.md#m4) · 状态：进行中（skill 已装到 Claude Code、苦工提示词已切到仓库，等用户试用；Codex 未装）· 最近更新：2026-09-24

## 1. 职责与边界

- **管：**
  - 主会话这一侧的规矩：什么活外包、苦工从哪来、fleet 命令怎么用、任务书怎么写、怎么验收、进度怎么记；按里程碑开发、做界面、评审与销账三套流程；调度站的运维与排障。
  - 苦工这一侧的规矩：实现、侦察、评审、修复、测试五个角色的提示词正文和回报格式；opencode 三个 agent 的开头声明。
  - 安装：skill 装到 Claude Code 和 Codex，退役被取代的旧全局 skill；opencode 的 agent 从仓库提示词生成。
- **不管：** 角色用哪份提示词、禁哪些工具（在配置里，默认值见[领域模型与配置](核心层-领域模型与配置.md) 4.2 节）；fleet 命令和服务本身的行为（skill 只描述用法，行为以命令行层和服务层为准）；codeg、Claude Code、Codex 自身的配置。

## 2. 结构与数据流

### 2.1 skill（给主会话）

| skill | 干啥 | 由哪份旧 skill 来 |
|---|---|---|
| `fleet-dispatch` | 派活的基础规矩：三方分工、什么活外包、苦工从哪来、fleet 命令、角色、任务书六项、流水线、返工、验收、出错处理、进度流水、汇报 | pi-fleet、oc-fleet 的公共部分和「经 fleet 派活」一节；fleet-build 里的流水线与进度流水；Codex 的 auto-delegate 里讲宿主子代理的部分 |
| `fleet-project-build` | 设计定稿后按里程碑无人值守开发到底 | fleet-build |
| `fleet-ui-build` | 前端从分层规格到页面，含模板和截图验收工具 | ui-build |
| `fleet-review` | 按提交区间派评审苦工、判真伪、记进 `docs/review/`；反过来照账派修复、销账 | 全局规范里「Review 工程化」一节（原先没有对应 skill） |
| `fleet-ops` | 维护调度站：服务、池子、角色、运行时、排障；pi 和 opencode 各一份参考 | pi-fleet、oc-fleet 里只跟 pi、opencode 有关的部分 |

```text
fleet-dispatch（基础：怎么派、怎么验、怎么记）
 ├─ fleet-project-build（按里程碑开发）
 ├─ fleet-ui-build（做界面）
 └─ fleet-review（评审与销账）
fleet-ops（通道和运行时，维护时用）
```

数据流：`skills/<名字>/` 是唯一源文件 → `node scripts/install-skills.mjs` 复制到宿主的 skill 目录（Claude Code 是 `~/.claude/skills/`，Codex 是 `~/.codex/skills/`），每份里放一个标记文件 `.fleet-studio-skill.json` → 宿主新开会话时按 description 挑 skill 加载进主会话的上下文 → 主会话照着用 `fleet` 命令派活。

### 2.2 苦工提示词（给苦工）

| 角色 | 文件 | 回报格式 |
|---|---|---|
| 实现 | `roles/worker.md` | SUMMARY / FILES / VERIFY / SELF_REPORT / BLOCKED |
| 侦察 | `roles/scout.md` | FINDINGS / EVIDENCE / GAPS |
| 评审 | `roles/reviewer.md` | VERDICT / ISSUES |
| 修复 | `roles/fixer.md` | SUMMARY / FIXED / REJECTED / NEW_ISSUES / SELF_REPORT |
| 测试 | `roles/tester.md` | SUMMARY / TESTS / RESULTS / FAILURES / GAPS / SELF_REPORT |

另有 `roles/opencode-agents.json`：实现、侦察、评审三个 opencode agent 的开头声明（说明、模型、权限）。

数据流：

- **pi：** 配置里写 `builtin:roles/<角色>.md` → 服务展开成仓库里的绝对路径 → 作为追加系统提示词交给 pi，每次拉起时现读。改了提示词，下一次派活就生效，不用重启服务，也不用安装。
- **opencode：** 实现、侦察、评审走 `--agent <角色>`；agent 文件由 `node scripts/install-roles.mjs` 生成到 `~/.config/opencode/agents/`（开头声明取 `opencode-agents.json`，正文取 `roles/<角色>.md`）。修复、测试没有 agent，服务把仓库里的提示词拼在任务正文前面。
- **直接启动 pi：** 不经过 fleet 时（例如 Codex 里旧的 pi-fleet），pi 读 `~/.pi/agent/roles/<角色>.md`。同一个脚本把仓库提示词原样复制过去；内容和仓库完全一样，所以靠「内容一致」认出是脚本写的，不往提示词里加标记。

## 3. 关键决策

- **公共规矩只写一份。** skill 每加载一次，全文都进主会话的上下文；旧的开发流程要连带读派活规范，两份四百多行，而且任务书、验收、角色表在三份里各抄一遍，已经抄出矛盾（评审换不换模型、推理档位降不降、苦工输出放哪）。现在公共部分只在 fleet-dispatch，其余引用它的章节号。
- **pi 和 opencode 合成一份 fleet-ops。** 主会话派活时不挑运行时（池配置决定）；分成两份会在「派活」时抢着被加载；以后加运行时只加一份参考文件。
- **苦工从哪来**按 [sonnet 与 dsf 派活对比](../调研/sonnet与dsf派活对比.md) 定：边界清楚的小活走默认池；评审、集成测试、带并发或进程的子系统、要读懂大量现有代码的活给强模型；fleet 用不了时用宿主子代理兜底。宿主子代理必须写明模型（Claude Code 用 sonnet，Codex 用 gpt-5.6-luna），用了要记进进度流水，因为看板看不到它。
- **谁派活谁记进度流水。** 原来只有开发流程那份要求写 `docs/进度/`，直接派活或做界面都不留记录。
- **触发词分开。** 旧的开发流程和界面流程分别用「按设计开干」「照设计开干」，只差一个字；现在界面流程改成「照前端设计把页面做出来」，派活基础规矩独占「派活」「外包」。
- **苦工提示词只在仓库维护一份。** 原先 pi 读 `~/.pi/agent/roles/` 下的 8 份，测试角色在仓库，opencode 的三个 agent 又各带一份正文，已经对不上（opencode 的实现 agent 少了「不要再往下派活」）。
- **opencode 继续用 agent，正文改由仓库生成。** 只读角色靠 agent 的权限设置禁止改文件；改成「提示词拼在任务前面」会丢掉这层限制。
- **五份提示词补了同样三条边界**：不许再往下派活（苦工的命令行也能调用 fleet）；不许做会改仓库历史的 git 操作，只读命令可以；没人会回答它的提问，拿不准的写进回报。回报格式一字不动，回报解析和看板不受影响。
- **信息设计的四个角色从默认配置里去掉。** info-design 早就不派苦工，没有 skill 在用；它们的提示词文件留在 `~/.pi/agent/roles/`，没删。
- **安装用复制，不用链接。** Windows 上建链接要额外权限；复制加标记，覆盖和卸载都只动标记过的文件或目录。skill 碰到用户自己的同名目录就拒绝；opencode agent 碰到没标记的同名文件先挪进备份再写（这三个名字是给 fleet 用的）。
- **被替换的东西都挪进备份，不删。** skill 在 `<数据目录>/skill-backup/<时间>/<宿主>/`，opencode agent 在 `<数据目录>/role-backup/<时间>/opencode/`，两个脚本的 `--uninstall` 都挪回最近一次。
- **skill 与命令的一致性交给门禁。** skill 里写到的子命令、选项、动作词必须在命令的 `--help` 里存在；正文点名的 fleet 系列 skill 必须在仓库里。命令改了参数、skill 没跟上，门禁变红。

## 4. 当前实现

- 五份 skill 的正文；fleet-ui-build 带上原 ui-build 的参考、模板和六个验收工具。相对旧版的改动：派活处都指向 fleet 命令；修复任务书的回报格式对齐修复角色；截图工具关浏览器时按进程树整棵结束（搬了本仓库截图脚本 2026-09-24 的修法，旧版只结束主进程，会留下孤儿进程占着档案目录）；工具代码按本仓库的格式规则整理过。
- 五份角色提示词在 `roles/`；默认配置的五个角色都写成 `builtin:roles/<角色>.md`。本机已有的 `~/.fleet-studio/config.json` 同样改好，改之前的原样备份在 `config.json.bak-20260924-roles`。
- `scripts/install-skills.mjs`：默认装 Claude Code，`--target codex|all` 装 Codex 或两边；`--check` 只报告差异，有差异退出码 1；`--uninstall` 删掉本脚本装的、挪回最近一次备份的旧 skill。退役名单：pi-fleet、oc-fleet、fleet-build、ui-build、auto-delegate。宿主目录认 `CLAUDE_CONFIG_DIR`、`CODEX_HOME`，备份目录认 `FLEET_HOME`。
- `scripts/install-roles.mjs`：一条命令同步两处：生成 opencode 的三个 agent，把五份提示词原样复制到 pi 的角色目录；`--check`、`--uninstall` 同上，只处理仓库里有的角色，目录里别的文件不动。agent 目录认 `XDG_CONFIG_HOME`。开头声明里的字符串一律写成 JSON 字符串，它同时是合法的 YAML 写法。
- `packages/cli/test/skills.test.ts`：6 个测试，从 skill 的代码块和行内代码里取出全部 `fleet <子命令> ...` 用例，逐个对照 `fleet --help`、`fleet <子命令> --help` 的输出。`packages/core/test/config/defaults.test.ts` 核对五个角色都指向仓库提示词、文件都在。
- 为了让一致性检查能统一跑 `--help`，顺带修了 `fleet daemon --help` 报「未知的 daemon 子命令」（见 [fleet 命令](命令行层-fleet命令.md) 改动历史）。

## 5. 验证方式

- 门禁 `pnpm check` 里的 skill 一致性测试和默认角色测试；故意在 skill 里写一个不存在的选项（`fleet ps --watch`），测试会报出文件和那一句。
- 两个安装脚本都在临时目录演练过：装之前检查、安装并挪走旧的、装后检查一致、改动后检查报出差异、覆盖重装、卸载并挪回；skill 另验了遇到用户自己的同名目录拒绝安装、非法目标报错。
- 真实环境：skill 装到 Claude Code 后检查全部一致；opencode agent 生成后 `opencode agent list` 列出实现、侦察、评审三个 agent，侦察的「改文件」权限仍是拒绝；pi 角色目录同步后检查五份和仓库一致；本机服务改完配置后 `fleet roles` 只剩五个角色；经 fleet 派一个真实侦察苦工读仓库文件，9 秒完成，按侦察角色的格式交回回报。
- 待做：用户在新会话里实际用一轮；装到 Codex 后实测一次。

## 6. 待扩展项

- 装到 Codex 并实测（Codex 那边还留着旧的 pi-fleet、oc-fleet、fleet-build 和 auto-delegate）。
- 把 Claude Code 的无头模式接成第三种运行时、开一个强模型池，这样强模型苦工也经过闸门、显示在看板上。属于需求变更。
- 进度流水将来要给「现状卡」一类汇总用时，可能要把六项固定成可解析的格式。

## 7. 改动历史

| 日期 | 改动 |
|---|---|
| 2026-09-24 | 建立：五份 skill、安装脚本、skill 与命令一致性测试；装到 Claude Code，旧的 pi-fleet、oc-fleet、fleet-build、ui-build 挪进备份 |
| 2026-09-24 | 苦工提示词收进仓库：五个角色只读仓库 `roles/`，补上三条共同边界；opencode 三个 agent 改由 `install-roles.mjs` 生成；信息设计四个角色从默认配置去掉；本机配置同步改好。模块文档由「fleet 系列 skill」改名为「skill 与苦工提示词」 |
| 2026-09-24 | `install-roles.mjs` 同时同步 pi 的角色目录：`~/.pi/agent/roles/` 下四份旧提示词换成仓库版本并补上测试角色，旧文件挪进备份，信息设计四份不动 |
