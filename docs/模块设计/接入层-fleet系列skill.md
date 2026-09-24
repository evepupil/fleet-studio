# 接入层 · fleet 系列 skill

> 模块定位：教各项目的主会话怎么经 fleet 派活的五份 skill，以及把它们装进宿主的脚本 · 对应代码：`skills/`、`scripts/install-skills.mjs`、`packages/cli/test/skills.test.ts` · 所属里程碑：[M4 fleet 系列 skill](../roadmap.md#m4) · 状态：进行中（已装到 Claude Code，等用户试用；Codex 未装）· 最近更新：2026-09-24

## 1. 职责与边界

- **管：** 主会话这一侧的规矩：什么活外包、苦工从哪来、fleet 命令怎么用、任务书怎么写、怎么验收、进度怎么记；按里程碑开发、做界面、评审与销账三套流程；调度站的运维与排障。另管安装：把仓库里的 skill 装到 Claude Code 和 Codex，退役被取代的旧全局 skill。
- **不管：** 苦工那一侧的规矩（角色提示词在 `~/.pi/agent/roles/` 和仓库 `roles/`，由配置引用）；fleet 命令和服务本身的行为（skill 只描述用法，行为以命令行层和服务层为准）；codeg、Claude Code、Codex 自身的配置。

## 2. 结构与数据流

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

## 3. 关键决策

- **公共规矩只写一份。** skill 每加载一次，全文都进主会话的上下文；旧的开发流程要连带读派活规范，两份四百多行，而且任务书、验收、角色表在三份里各抄一遍，已经抄出矛盾（评审换不换模型、推理档位降不降、苦工输出放哪）。现在公共部分只在 fleet-dispatch，其余引用它的章节号。
- **pi 和 opencode 合成一份 fleet-ops。** 主会话派活时不挑运行时（池配置决定）；分成两份会在「派活」时抢着被加载；以后加运行时只加一份参考文件。
- **苦工从哪来**按 [sonnet 与 dsf 派活对比](../调研/sonnet与dsf派活对比.md) 定：边界清楚的小活走默认池；评审、集成测试、带并发或进程的子系统、要读懂大量现有代码的活给强模型；fleet 用不了时用宿主子代理兜底。宿主子代理必须写明模型（Claude Code 用 sonnet，Codex 用 gpt-5.6-luna），用了要记进进度流水，因为看板看不到它。
- **谁派活谁记进度流水。** 原来只有开发流程那份要求写 `docs/进度/`，直接派活或做界面都不留记录。
- **触发词分开。** 旧的开发流程和界面流程分别用「按设计开干」「照设计开干」，只差一个字；现在界面流程改成「照前端设计把页面做出来」，派活基础规矩独占「派活」「外包」。
- **安装用复制，不用链接。** Windows 上建链接要额外权限；复制加标记文件，覆盖和卸载都只动标记过的目录，碰到用户自己的同名目录就拒绝，一个文件不动。
- **旧 skill 挪进备份，不删。** 备份在 `<数据目录>/skill-backup/<时间>/<宿主>/`，`--uninstall` 挪回最近一次。
- **skill 与命令的一致性交给门禁。** skill 里写到的子命令、选项、动作词必须在命令的 `--help` 里存在；正文点名的 fleet 系列 skill 必须在仓库里。命令改了参数、skill 没跟上，门禁变红。

## 4. 当前实现

- 五份 skill 的正文；fleet-ui-build 带上原 ui-build 的参考、模板和六个验收工具。相对旧版的改动：派活处都指向 fleet 命令；修复任务书的回报格式对齐修复角色；截图工具关浏览器时按进程树整棵结束（搬了本仓库截图脚本 2026-09-24 的修法，旧版只结束主进程，会留下孤儿进程占着档案目录）；工具代码按本仓库的格式规则整理过。
- `scripts/install-skills.mjs`：默认装 Claude Code，`--target codex|all` 装 Codex 或两边；`--check` 只报告差异，有差异退出码 1；`--uninstall` 删掉本脚本装的、挪回最近一次备份的旧 skill。退役名单：pi-fleet、oc-fleet、fleet-build、ui-build、auto-delegate。宿主目录认 `CLAUDE_CONFIG_DIR`、`CODEX_HOME`，备份目录认 `FLEET_HOME`。
- `packages/cli/test/skills.test.ts`：6 个测试。从 skill 的代码块和行内代码里取出全部 `fleet <子命令> ...` 用例，逐个对照 `fleet --help`、`fleet <子命令> --help` 的输出。
- 为了让一致性检查能统一跑 `--help`，顺带修了 `fleet daemon --help` 报「未知的 daemon 子命令」（见 [fleet 命令](命令行层-fleet命令.md) 改动历史）。

## 5. 验证方式

- 门禁 `pnpm check` 里的 skill 一致性测试；故意在 skill 里写一个不存在的选项（`fleet ps --watch`），测试会报出文件和那一句。
- 安装脚本在临时目录演练过：装之前检查、安装并退役旧 skill、装后检查一致、改动后检查报出差异、覆盖重装、卸载并挪回旧 skill、遇到用户自己的同名目录拒绝安装、非法目标报错。
- 真实安装后 `node scripts/install-skills.mjs --check` 全部一致。
- 待做：用户在新会话里实际用一轮；装到 Codex 后实测一次。

## 6. 待扩展项

- 装到 Codex 并实测（Codex 那边还留着旧的 pi-fleet、oc-fleet、fleet-build 和 auto-delegate）。
- 角色提示词收进仓库：现在 8 份在 `~/.pi/agent/roles/`，测试角色在仓库 `roles/`，两处维护；信息设计的 4 个角色已经没有 skill 在用。要动核心层默认配置，和需求设计 F3 的写法也不一样，等用户拍板。
- 把 Claude Code 的无头模式接成第三种运行时、开一个强模型池，这样强模型苦工也经过闸门、显示在看板上。属于需求变更。
- 进度流水将来要给「现状卡」一类汇总用时，可能要把六项固定成可解析的格式。

## 7. 改动历史

| 日期 | 改动 |
|---|---|
| 2026-09-24 | 建立：五份 skill、安装脚本、skill 与命令一致性测试；装到 Claude Code，旧的 pi-fleet、oc-fleet、fleet-build、ui-build 挪进备份 |
