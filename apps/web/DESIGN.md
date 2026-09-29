# fleet studio 看板（第三版：Linear 式工作台）—— 站点层规格（唯一事实来源）

> 所有实现会话动手前先读完本文件，再读 `design/` 下属于自己那一页的规格。本文件和 `design/*.md` 是契约，**实现会话不得修改**。
> 视觉依据是 `docs/前端设计.md`（第三版）；它来自用户指定的设计提炼 `C:/code/shadcn-studio/sonder-board/docs/设计提炼.md`（一张 Linear 式看板截图的提炼）。
> 规格故意写满：该有的先摆上，删减是主控验收时的事。实现会话只负责按规格做出来，规格没写的按同一套令牌补齐，不要自己发挥。
> 这是一次**改版**：功能和数据层都已存在并通过验收。凡是规格写「行为照旧」的地方，以现有代码的行为为准，只改外观和布局。

---

## 0. 定位、参照与验收标准

一个只在本机打开的工作台，给同时推进多个项目、每个项目派出一群便宜模型苦工的人用。打开就是任务看板：谁在排队、谁在干活、刚做完什么，一眼看完；点开一张卡看任务书、实时过程和回报。另有槽位（每个模型池被谁占着、启停和调顺序）和总览（用量与分布）。

用户来这里干这几件事：

1. 打开看板：三列展开「排队中、工作中、已完成」，右侧把「失败、已取消」收成两行短条（失败数标红），点开能展开成列。
2. 按项目、池、角色、标题筛看板；侧栏点一个项目，只看它的任务。
3. 切到「列表」查更早的历史：按状态、项目、池、角色、时间筛，按开始时间、用量、耗时排序，往下滚自动加载。
4. 点卡片或列表行进详情页：左边标题、回报、任务书、时间线，右边一列属性。
5. 窗口栏按 Ctrl K 搜任务（编号或标题），回车直达详情。
6. 槽位页看每个池的占用、排队、成功率，停用某个池或调派活顺序；总览看忙不忙、token 花在哪。

目标观感：**设计提炼里的那张 Linear 式看板**。参照和各自抄什么：

| 参照 | 抄什么 |
|---|---|
| 设计提炼（`sonder-board/docs/设计提炼.md`，用户指定，唯一视觉依据） | 38px 窗口栏；240px 固定侧栏，只给当前入口一整行浅灰底；工作区顶上 40px 视图栏 + 40px 筛选栏；三列展开 + 右侧已结束状态收成短行；三层任务卡（编号与负责人 / 状态与两行标题 / 进度与分类标签）；正文 13/17、辅助 12/16、间隔 8px；底色 浅灰 → 近白 → 白；1px 低对比边框、很浅的阴影；卡片圆角 6、控件圆角 5、图标描边 1.7；彩色只用于识别（团队绿、进行中黄、已完成紫、彩色标签）；字重 400/500，不加大标题和统计卡 |
| Linear 桌面版（凭记忆，只借组件形态） | 侧栏条目与分组标题的密度；视图栏里的小号视图切换；「筛选」下拉菜单带二级菜单、选中条件排成可删的小标签；「显示」弹层；看板列头「状态图标 + 名称 + 数量」；Linear 式状态图标（虚线圈、半填充圈、实心勾）；Ctrl K 搜索弹窗；详情页「左正文、右属性栏」 |

不抄：新建、编辑任务的弹窗和按钮（看板只读，写操作只有槽位启停和排序）；头像；优先级竖条图标；设计提炼里的 Sonder 虚构内容；任何渐变、大号数字卡片、页面副标题、欢迎语、营销式大留白。

### 0.1 页面清单

| 页面 | 路由（哈希） | 用户来干什么 | 首屏核心动作 | 区块下限 | 分路 |
|---|---|---|---|---|---|
| 任务 · 看板 | `#/tasks`（`#/` 和未知地址也到这里） | 看谁在排队、干活、刚做完 | 三列 + 右侧收起组 + 每列前几张卡、筛选按钮、搜索框同时在首屏 | 6：视图栏、筛选栏、状态列、收起组、任务卡、空/加载态 | 看板路（看板本体）+ 列表路（视图栏内容、筛选栏、显示弹层） |
| 任务 · 列表 | `#/tasks/list` | 查历史任务 | 筛选栏 + 列表前 10 行 | 5：视图栏、筛选栏、表头、任务行、底部合计 | 列表路 |
| 任务 · 详情 | `#/tasks/<编号>` | 看任务书、过程、回报 | 面包屑、标题、状态、属性栏、回报在首屏 | 7：面包屑、标题与状态行、失败说明、回报、任务书、时间线、属性栏 | 详情路 |
| 槽位 | `#/slots` | 看池、启停、调顺序 | 表格第一行的开关和上下移 | 4：视图栏（含公共排队）、全部停用提醒、槽位表格（含占用格子提示卡）、停用确认框 | 槽位路 |
| 总览 | `#/overview` | 看忙不忙、用量分布 | 实时指标条、时间范围、统计指标条 | 6：视图栏（含时间范围）、实时指标条、统计指标条、token 分布、任务次数分布、token 趋势 | 总览路 |
| 骨架（每页都有） | — | 切页、搜索、看占用 | 侧栏三项、搜索入口、占用数 | 6：窗口栏、侧栏、工作区、提示条、连不上服务、搜索弹窗 | 地基路 + 搜索路（搜索弹窗） |

### 0.2 验收标准（先写死，验收时逐项对）

- 侧栏三项都能进入对应页，刷新停在当前页；`#/` 和未知地址跳到 `#/tasks`；`#/w/<编号>`（第一版链接）跳到 `#/tasks/<编号>`；`#/overview`、`#/slots`、`#/tasks/<编号>`（第二版链接）照常可用。
- 每页每个区块处理：加载中、空、出错、长文本；五档宽度（1440、1280、1024、800、390）不出现页面级横向滚动（看板和宽表格在自己的容器里横向滚动不算）；浅色、深色两套主题。
- 演示数据五个场景（`?demo=busy|empty|failure|offline|disabled`）下各页截图符合规格。
- 门禁：`pnpm check` 全绿（含第 7 章扩展后的写死颜色、禁用字号字重检查）；交互检查（各页末尾的表）全部通过。
- 首屏核心动作按 0.1 表出现在 1280×800 视口的首屏。

---

## 1. 技术栈（已锁定）

| 项 | 值 |
|---|---|
| 框架 | React 19 + Vite（已装），单页应用 |
| 语言 | TypeScript，仓库根 `tsconfig.base.json` 的最严格设置 |
| 组件库 | shadcn/ui（源码在 `src/components/ui/`），底层 Radix |
| 样式 | Tailwind CSS 4；令牌是 `src/styles/tokens.css` 的 CSS 变量，经 `src/styles/globals.css` 的 `@theme inline` 映射成类名（第 2 章） |
| 路由 | React Router 7，`createHashRouter` |
| 数据请求 | TanStack Query 5（统计、任务列表、项目、搜索、两个改设置的请求）；全局快照流和单任务流用 zustand 仓库 |
| 状态 | zustand |
| 图表 | Recharts 3，经 shadcn/ui 的 `chart` 组件用 |
| 日历 | react-day-picker 9，经 shadcn/ui 的 `calendar` 组件用 |
| 提示消息 | sonner（只用于改设置失败） |
| 图标 | `lucide-react` 1.47.0，只用下方白名单；五种任务状态的图标是 `StatusIcon` 里的内联图形 |
| 单测 | Vitest，只测 `src/lib/`、`src/api/`、`src/state/` 下的纯函数和演示数据 |
| 包管理 | pnpm（仓库根执行） |

**本版新增依赖（只有这一个）**：`@radix-ui/react-dropdown-menu@2.1.24`（本机 pnpm 仓库已有，先试 `pnpm --filter @fleet/web add @radix-ui/react-dropdown-menu@2.1.24 --offline`，不行再去掉 `--offline`），用来做 shadcn 的 `dropdown-menu` 组件（筛选菜单）。搜索弹窗用已有的 `@radix-ui/react-dialog` 做 shadcn 的 `dialog` 组件。

**不引入**（除上表外一律不准加）：cmdk、动画库、CSS-in-JS、其他 UI 框架、其他图表库、日期库、虚拟列表库、表单库、拖拽库。

**图标白名单**（已在本机 1.47.0 逐个确认存在，只用这些）：`PanelLeft`、`Search`、`SlidersHorizontal`、`ListFilter`、`Kanban`、`List`、`ListChecks`、`Layers`、`LayoutDashboard`、`ChevronRight`、`ChevronLeft`、`ChevronDown`、`ChevronUp`、`ChevronsRight`、`ChevronsUpDown`、`X`、`Check`、`ArrowLeft`、`ArrowDown`、`ArrowUp`、`Copy`、`Clock`、`RotateCw`、`Inbox`、`Unplug`、`WifiOff`、`TriangleAlert`、`Info`、`CalendarDays`、`FileText`、`SquareTerminal`、`Terminal`、`Pencil`、`FilePlus`、`Globe`、`Wrench`、`MessageSquare`、`Brain`、`LoaderCircle`、`CircleCheck`、`CircleX`、`CornerDownLeft`。shadcn 源码里自带的图标不在名单里的，换成名单里最接近的（例如 `ChevronDownIcon` 用 `ChevronDown`、`CheckIcon` 用 `Check`、`CircleIcon` 用 `StatusIcon` 以外的内联小圆点）。

## 2. 设计令牌

### 2.1 令牌与类名

- 令牌全部在 `src/styles/tokens.css`（**主控已写好，谁都不准改**），数值来源是 `docs/前端设计.md` 第 3 节。默认浅色，`prefers-color-scheme: dark` 时换深色值。
- `src/styles/globals.css`（地基路写）按下表把令牌映射成 Tailwind 类名。**业务代码只用这些类名**；任何 `#…`、`rgb(`、`hsl(`、`oklch(` 色值、方括号里的色值、Tailwind 自带调色板（`bg-white`、`text-black`、`bg-blue-500`、`border-zinc-200` 之类）都会被门禁拦截。

`@theme inline` 里的颜色映射（写 `--color-<名字>: var(<令牌>)`，得到 `bg-<名字>`、`text-<名字>`、`border-<名字>`、`fill-<名字>`、`stroke-<名字>` 等类名）：

| 名字 | 令牌 | 用在哪 |
|---|---|---|
| `window` | `--bg-window` | 窗口栏、侧栏、页面最外层（浅灰） |
| `panel` | `--bg-panel` | 工作区面板（近白） |
| `column` | `--bg-column` | 看板列的托盘、收起组的短条 |
| `card` | `--bg-card` | 任务卡、指标条、图表面板、输入框、按钮描边款（白） |
| `raised` | `--bg-raised` | 回报里的代码块、任务书正文、工具参数、指标条单元的悬停底 |
| `overlay` | `--bg-overlay` | 菜单、弹层、提示卡、弹窗、抽屉 |
| `hover` | `--bg-hover` | 可点的行、幽灵按钮的悬停底（半透明） |
| `selected` | `--bg-selected` | 当前菜单项、选中的视图切换项、选中的分段项、打开的属性开关（半透明浅灰） |
| `line` | `--line` | 所有 1px 细线、卡片和面板描边 |
| `line-strong` | `--line-strong` | 悬停的卡片描边、关着的开关轨道、空占用格描边 |
| `meter-track` | `--meter-track` | 空占用格底、占用条底 |
| `fg-1` / `fg-2` / `fg-3` | `--text-1` / `--text-2` / `--text-3` | 主文字 / 次要 / 标签和时间戳。`fg-3` 不放在 `bg-selected` 上（那里用 `fg-2`） |
| `brand` / `brand-soft` / `on-brand` | `--accent` / `--accent-soft` / `--on-accent` | 强调色只用于：焦点环、开关打开的轨道、链接式按钮文字、主按钮（「回到最新」）、日历选中日。**选中态一律用 `bg-selected` 浅灰，不用强调色** |
| `team` | `--team` | 侧栏顶部产品标记（绿色方块），别处不用 |
| `status-queued` `status-running` `status-warning` `status-done` `status-failed` `status-cancelled` | 同名 `--st-*` | 状态图标颜色。`status-running`、`status-queued`、`status-cancelled` **只做图形**；`status-warning`、`status-done`、`status-failed` 可以做文字 |
| `status-warning-soft` `status-failed-soft` | 同名 | 提示条、异常时间线行、失败说明的淡底 |
| `proj-0`～`proj-7` | `--proj-0`～`--proj-7` | 项目色，**只做图形**（标签色点、占用格、图例色点） |
| `series-0`～`series-7`、`series-other` | 同名 | 图表系列色，只做图形 |
| `scrim` | `--scrim` | 弹窗、抽屉背后的遮罩 |

同一个 `@theme inline` 里再给 shadcn/ui 组件用的语义名（shadcn 源码里的类名靠它们生效，业务代码不用这些名字）：

| shadcn 名字 | 令牌 |
|---|---|
| `background` / `foreground` | `--bg-panel` / `--text-1` |
| `card` / `card-foreground` | `--bg-card` / `--text-1` |
| `popover` / `popover-foreground` | `--bg-overlay` / `--text-1` |
| `primary` / `primary-foreground` | `--accent` / `--on-accent` |
| `secondary` / `secondary-foreground` | `--bg-raised` / `--text-1` |
| `muted` / `muted-foreground` | `--bg-hover` / `--text-3` |
| `accent` / `accent-foreground` | `--bg-hover` / `--text-1`（注意：shadcn 的 accent 是悬停底，不是强调色） |
| `destructive` | `--st-failed` |
| `border` / `input` / `ring` | `--line` / `--line` / `--accent` |
| `chart-1`～`chart-8` | `--series-0`～`--series-7` |

注意 `card` 同时是本项目的名字和 shadcn 的名字，指向同一个令牌 `--bg-card`，只写一次。shadcn 源码里凡是 `bg-black/50`、`text-white` 这类写死颜色，一律换成上表名字（遮罩 `bg-scrim`，白字 `text-on-brand`）。

### 2.2 字阶与排版

`@theme inline` 里：`--font-sans: var(--font-sans)`、`--font-mono: var(--font-mono)`；字号只有四档：`--text-12: var(--fs-12)` 配 `--text-12--line-height: var(--lh-12)`，同理 13、14、16。

| 类名 | 字号 / 行高 | 用在哪 |
|---|---|---|
| `text-12` | 12 / 16 | 辅助文字：编号、时间、计数、标签、表头、分组标题、按钮和输入框文字 |
| `text-13` | 13 / 17 | 正文基准：卡片标题、列表标题、菜单项、属性值、时间线正文 |
| `text-14` | 14 / 20 | 只给弹窗标题 |
| `text-16` | 16 / 22 | 详情页标题、指标条的数字、环形图中心合计 |

字重只用 `font-normal`（400）和 `font-medium`（500）：当前菜单项、列头、面板标题、按钮用 500，其余 400。**不用 `font-semibold`、`font-bold`**；**不用** `text-11`、`text-22`、`text-28` 和 Tailwind 自带的 `text-xs`、`text-sm`、`text-base`、`text-lg`、`text-xl`（门禁会拦）。时间、时长、计数、编号、路径、token 数一律 `font-mono`；表格里要纵向对齐的数字列加 `tabular-nums`。

### 2.3 间距、圆角、阴影、尺寸、断点

- `@theme inline` 里 `--spacing: 4px`：`p-1`=4、`p-2`=8、`p-3`=12、`p-4`=16、`p-6`=24。卡片之间、列之间都是 8px（`gap-2`）。允许的半档：`1.5`（6px）、`0.5`（2px）、`2.5`（10px）只在规格写明处用。
- 圆角：`--radius-sm: var(--r-chip)`（4px，标签、小片、kbd）、`--radius-md: var(--r-control)`（5px，按钮、输入框、菜单项、侧栏行、视图切换）、`--radius-lg: var(--r-card)`（6px，卡片、看板列、面板、工作区、弹层、弹窗）、`--radius-xl: var(--r-card)`；占用格 `rounded-[var(--r-slot)]`（2px，方括号里只准写 `var(--…)`）。
- 阴影：`--shadow-card: var(--shadow-card)`（类名 `shadow-card`，任务卡、指标条、面板、输入框、描边按钮）、`--shadow-panel: var(--shadow-panel)`（`shadow-panel`，工作区面板）、`--shadow-overlay: var(--shadow-overlay)`（`shadow-overlay`，菜单、弹层、提示卡、弹窗）；shadcn 自带的 `--shadow-2xs`、`--shadow-xs`、`--shadow-sm` 设成 `0 0 0 0 transparent`，`--shadow-md`、`--shadow-lg` 设成 `var(--shadow-overlay)`。
- 骨架尺寸（方括号里写变量）：窗口栏 `h-[var(--window-bar-h)]`（38）、侧栏 `w-[var(--sidebar-w)]`（240）、视图栏 `h-[var(--view-bar-h)]`（40）、筛选栏 `h-[var(--filter-bar-h)]`（40）、提示条 `h-[var(--banner-h)]`（32）、侧栏行 `h-7`（28）、控件 `h-7`（28）、小控件 `h-6`（24）、标签 `h-5`（20）、看板列最小宽 `min-w-[var(--board-col-min)]`（248）、收起组宽 `w-[var(--ended-col-w)]`（200）、详情属性栏 `w-[var(--detail-aside-w)]`（280）。
- 断点：`@theme` 加 `--breakpoint-md: 800px`；Tailwind 默认 `lg` = 1024、`xl` = 1280。≥ 1024 侧栏常驻（可用窗口栏按钮收起）；< 1024 侧栏改成从左边滑出的抽屉；< 800 是手机布局（各页写明）。验收看 1440、1280、1024、800、390 五档。
- 焦点：所有可聚焦元素 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`，只在键盘聚焦时出现（shadcn 自带的 ring 样式删掉，统一用这一种）。

### 2.4 全局样式（`globals.css`，地基路写）

- `@import "tailwindcss";`、`@import "tw-animate-css";`、`@import "./tokens.css";`，然后 `@theme inline { … }`（2.1～2.3 的全部映射）。
- `html, body, #root` 高度 100%、`overflow: hidden`（滚动交给各区域）；`body` 用 `bg-window text-13 text-fg-1 font-sans antialiased`；`::selection` 用 `bg-brand-soft`。
- 图标描边：`svg.lucide { stroke-width: var(--icon-stroke); }`（lucide 图标默认带 `lucide` 类，这一条把全站图标统一成 1.7px 细线）。
- 滚动条：`* { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }`。
- 深浅跟随系统：令牌文件已用 `prefers-color-scheme` 切换，**不加** `.dark` 类，不做主题切换按钮；Tailwind 的 `dark:` 变体保持默认（按系统）。
- 旋转动画：`@keyframes spin`；`--animate-spin-slow: spin 1.2s linear infinite`（类名 `animate-spin-slow`，只给时间线里「还在执行的工具」和「停用」按钮的转圈）；`@media (prefers-reduced-motion: reduce)` 下 `.animate-spin-slow { animation: none }`。
- 重试斜纹：`.hatch { background-image: repeating-linear-gradient(45deg, var(--hatch) 0 1px, transparent 1px 4px); }`。
- 断线变淡：`[data-workspace][data-offline="true"] [data-page-body] { opacity: 0.6; }`。
- 删除 `src/styles/base.css`（第一版遗留，已无人引用）。

## 3. 动效纪律

工具类界面：**不做入场动画、不做数字滚动、不做闪烁高亮、不做骨架闪光、不做图表加载动画**（Recharts `isAnimationActive={false}`）。只允许：

- 悬停和按下的底色、描边变化：`transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]`。
- 折叠箭头旋转 90°：`transition-transform duration-[var(--dur-base)] ease-[var(--ease)]`。
- 菜单、弹层、弹窗、抽屉用 shadcn 自带的淡入（`tw-animate-css` 的 `animate-in fade-in-0`），时长 `var(--dur-base)`，不加滑动和缩放。
- 转圈只有两处：时间线最后一个还没有结果的工具（`LoaderCircle`）、停用确认框里请求进行中的按钮。**任务状态图标一律静止**（Linear 式半填充圈表示工作中）。

## 4. 文件结构与共享组件

### 4.1 目录与路由

```text
apps/web/src/
├─ main.tsx                  地基：QueryClientProvider + RouterProvider + Toaster
├─ app/
│  ├─ router.tsx             地基：路由表（见下）
│  ├─ AppShell.tsx           地基：窗口栏 + 侧栏 + 工作区 + 提示条 + <Outlet /> + 搜索弹窗 + Ctrl K
│  ├─ WindowBar.tsx          地基（design/骨架.md S1）
│  ├─ AppSidebar.tsx         地基（S2，桌面常驻和手机抽屉共用同一份内容）
│  ├─ ShellBanners.tsx       地基（S4）
│  ├─ ConnectionGate.tsx     地基（S5）
│  └─ search/                搜索路（S6）：SearchDialog.tsx 及其子组件
├─ styles/tokens.css         主控独占
├─ styles/globals.css        地基
├─ components/ui/            地基：shadcn/ui 源码
├─ components/*.tsx          地基：业务共享组件（4.3）
├─ api/                      queries.ts 由地基加一个钩子；demo/ 不动
├─ state/                    地基（taskFilterStore.ts 除外，主控已改好）
├─ lib/                      主控：board.ts、search.ts、taskFilters.ts、status.ts 已写好并有单测；其余照旧
├─ features/board/           看板路
├─ features/tasks/           列表路
├─ features/worker/          详情路
├─ features/slots/           槽位路
├─ features/overview/        总览路
└─ pages/
   ├─ TasksPage.tsx          地基建占位，列表路覆盖
   ├─ TaskDetailPage.tsx     地基建占位，详情路覆盖
   ├─ SlotsPage.tsx          地基建占位，槽位路覆盖
   └─ OverviewPage.tsx       地基建占位，总览路覆盖
```

路由表（`router.tsx`，`createHashRouter`，全部挂在 `AppShell` 下）：

| 路径 | 元素 |
|---|---|
| `/` | `<Navigate to="/tasks" replace />` |
| `/tasks` | `<TasksPage view="board" />` |
| `/tasks/list` | `<TasksPage view="list" />` |
| `/tasks/:id` | `<TaskDetailPage />` |
| `/slots` | `<SlotsPage />` |
| `/overview` | `<OverviewPage />` |
| `/w/:id` | 重定向到 `/tasks/:id`（`replace`） |
| `*` | `<Navigate to="/tasks" replace />` |

`/tasks/list` 是静态段，React Router 会优先于 `/tasks/:id` 匹配，不用特殊处理。

页面组件的约定：每页最外层是 `<>` 片段，依次渲染 `ViewBar`（必有）、`FilterBar`（只有任务页有）、然后一个 `<div data-page-body className="min-h-0 flex-1 …">` 作为这一页的内容区（滚动方式各页写明）。页面组件是唯一可以接收路由参数的地方。

### 4.2 区块清单

| 页 | # | 区块 | 组件 | 文件 | 标记 | 哪一路 |
|---|---|---|---|---|---|---|
| 骨架 | S1 | 窗口栏 | `WindowBar` | `app/WindowBar.tsx` | `data-window-bar` | 地基 |
| 骨架 | S2 | 侧栏 | `AppSidebar` | `app/AppSidebar.tsx` | `data-nav` | 地基 |
| 骨架 | S3 | 工作区 | `AppShell` 内 | `app/AppShell.tsx` | `data-workspace` | 地基 |
| 骨架 | S4 | 提示条 | `ShellBanners` | `app/ShellBanners.tsx` | `data-banner` | 地基 |
| 骨架 | S5 | 连不上服务 | `ConnectionGate` | `app/ConnectionGate.tsx` | `data-connection-gate` | 地基 |
| 骨架 | S6 | 搜索弹窗 | `SearchDialog` | `app/search/SearchDialog.tsx` | `data-search-dialog` | 搜索 |
| 任务 | T1 | 视图栏内容 | `TasksPage` 内 | `pages/TasksPage.tsx` | `data-view-bar` | 列表 |
| 任务 | T2 | 筛选栏 | `TaskFilterBar` | `features/tasks/TaskFilterBar.tsx` | `data-filter-bar` | 列表 |
| 任务 | T3 | 显示弹层 | `DisplayMenu` | `features/tasks/DisplayMenu.tsx` | `data-display-menu` | 列表 |
| 任务 | T4 | 看板 | `TaskBoard` | `features/board/TaskBoard.tsx` | `data-board` | 看板 |
| 任务 | T5 | 列表 | `TaskList` | `features/tasks/TaskList.tsx` | `data-task-list` | 列表 |
| 详情 | D1 | 视图栏面包屑 | `TaskDetailPage` 内 | `pages/TaskDetailPage.tsx` | `data-view-bar` | 详情 |
| 详情 | D2 | 正文（标题、状态、失败说明、回报、任务书） | `WorkerDetail` | `features/worker/WorkerDetail.tsx` | `data-detail` | 详情 |
| 详情 | D3 | 时间线 | `Timeline` | `features/worker/timeline/Timeline.tsx` | `data-timeline` | 详情 |
| 详情 | D4 | 属性栏 | `TaskProperties` | `features/worker/TaskProperties.tsx` | `data-properties` | 详情 |
| 槽位 | L1 | 视图栏公共排队 | `SharedQueuePill` | `features/slots/SharedQueuePill.tsx` | `data-shared-queue` | 槽位 |
| 槽位 | L2 | 全部停用提醒 | `AllDisabledNotice` | `features/slots/AllDisabledNotice.tsx` | `data-all-disabled` | 槽位 |
| 槽位 | L3 | 槽位表格 | `SlotsTable` | `features/slots/SlotsTable.tsx` | `data-slots-table` | 槽位 |
| 槽位 | L4 | 占用格子与提示卡 | `SlotMeter` | `features/slots/SlotMeter.tsx` | `data-slot-meter` | 槽位 |
| 槽位 | L5 | 停用确认框 | `DisablePoolDialog` | `features/slots/DisablePoolDialog.tsx` | `data-disable-dialog` | 槽位 |
| 总览 | O1 | 实时指标条 | `LiveCards` | `features/overview/LiveCards.tsx` | `data-live-cards` | 总览 |
| 总览 | O2 | 时间范围 | `RangeBar` | `features/overview/RangeBar.tsx` | `data-range-bar` | 总览 |
| 总览 | O3 | 统计指标条 | `StatCards` | `features/overview/StatCards.tsx` | `data-stat-cards` | 总览 |
| 总览 | O4 | token 分布 | `TokenShareCard` | `features/overview/TokenShareCard.tsx` | `data-token-share` | 总览 |
| 总览 | O5 | 任务次数分布 | `TasksByProjectCard` | `features/overview/TasksByProjectCard.tsx` | `data-tasks-by-project` | 总览 |
| 总览 | O6 | token 趋势 | `TokenTrendCard` | `features/overview/TokenTrendCard.tsx` | `data-token-trend` | 总览 |

**最重要的区块**：T4 看板（全站门面，允许写得最长）；D3 时间线；L3 槽位表格；O1 实时指标条。

区块组件只用具名导出，数据一律从 `state/`、`api/queries.ts` 读，不接收业务参数。例外只有这几个，写在页面层：`TaskFilterBar`、`DisplayMenu` 接收 `view`；`WorkerDetail`、`TaskProperties` 接收 `id` 或 `detail`；`SearchDialog` 没有参数（开关状态在 `searchStore`）。

### 4.3 共享组件签名（地基路照写；各路只准 import，不准改）

现有组件保留签名、按新令牌改外观；新增组件照下表。**旧组件 `StatCard`、`SectionCard`、`RoleChip` 地基路先原样留着**（旧的业务代码还在用，删了编不过），各页改完后由主控统一删除，业务代码**不准再用**它们。

| 文件 | 导出 | 签名与样式 |
|---|---|---|
| `components/StatusIcon.tsx`（新） | `StatusIcon` | `{ status: RunStatus; retrying?: boolean; size?: 12 \| 14 \| 16; label?: string; className?: string }`，默认 `size` 14。`retrying` 为 true 且 `status === "running"` 时画 lucide `RotateCw`（同尺寸，颜色 `RETRY_ICON_CLASS`）；否则画内联 `<svg viewBox="0 0 16 16" width={size} height={size}>`，颜色类取 `lib/status.ts` 的 `STATUS_META[status].iconClass`，形状见本表下方。给了 `label` 就 `role="img" aria-label={label}`，否则 `aria-hidden="true"`。根元素加 `data-status-icon={status}` 和 `shrink-0`，再拼上 `className`。 |
| `components/StatusBadge.tsx` | `StatusBadge` | 签名不变 `{ status; retry?; queuePosition?; shared?; size?: "sm" \| "md" }`。`<span data-status={status} className="inline-flex items-center gap-1.5 whitespace-nowrap">`：`StatusIcon`（`sm` 12、`md` 14，重试时 `retrying`）+ 文字。文字规则照旧：重试「重试 {attempt}/{max}」、排队有位次「排队第 {n} 位」/`shared` 时「公共排队第 {n} 位」、否则 `STATUS_META[status].label`。文字颜色**一律中性**：`sm` 为 `text-12 text-fg-2`，`md` 为 `text-13 text-fg-1`；只有重试时文字用 `text-status-warning`。 |
| `components/Label.tsx`（新） | `Label` | `{ children: ReactNode; colorVar?: string; title?: string; "data-label"?: string; className?: string }`。`<span data-label={…} title={title} className="inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-sm border border-line bg-card px-1.5 text-12 text-fg-2 …">`；有 `colorVar` 时最前面一个 `ColorDot size={6}`；文字包在 `<span className="min-w-0 truncate">` 里。项目、角色、池这类分类标签都用它。 |
| `components/RoleChip.tsx` | `RoleChip` | 保留签名 `{ label }`，内部改成 `<Label>{label}</Label>`。新代码直接用 `Label`。 |
| `components/VerdictTag.tsx` | `VerdictTag` | 签名不变。`inline-flex h-5 items-center rounded-sm border border-line bg-card px-1.5 text-12 font-medium`；`pass` →「通过」`text-status-done`；`fail` →「不通过」`text-status-failed`。 |
| `components/ColorDot.tsx` | `ColorDot` | 不变。 |
| `components/Duration.tsx` | `Duration` | 不变。 |
| `components/MonoPath.tsx` | `MonoPath` | 不变。 |
| `components/UsageBreakdown.tsx` | `UsageBreakdown` | 不变。 |
| `components/CopyButton.tsx` | `CopyButton` | 签名不变。改用 `Button variant="ghost" size={showText ? "sm" : "icon-sm"}`；图标 `Copy` 14px `text-fg-3`，复制后 1.5 秒内换成 `Check`（`text-status-done`）；`showText` 时图标后跟 `<span className="font-mono text-12">{text}</span>`。 |
| `components/EmptyState.tsx` | `EmptyState` | 签名不变。`<section data-empty className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">`；`icon` 16px `text-fg-3`；`message` `text-13 text-fg-2`；`command` `rounded-sm bg-raised px-1.5 py-0.5 font-mono text-12 text-fg-1`；`action` 是 `Button variant="link" size="sm"`。 |
| `components/ErrorState.tsx` | `ErrorState` | 签名不变。布局同 `EmptyState`，`role="alert"`、`data-error`，图标 `TriangleAlert` 16px `text-status-warning`，文字「加载失败：{message}」，按钮「重试」。 |
| `components/Banner.tsx` | `Banner` | 签名不变 `{ kind: "offline" \| "config" \| "warning"; children; title? }`。`data-banner={kind} role="status"`，`flex h-[var(--banner-h)] min-w-0 shrink-0 items-center gap-2 border-b border-line bg-status-warning-soft px-4 text-12 text-fg-1`；图标 14px `text-status-warning`（offline `WifiOff`，其余 `TriangleAlert`）；文字 `min-w-0 truncate`。 |
| `components/Kbd.tsx`（新） | `Kbd` | `{ children: ReactNode }`。`<kbd className="inline-flex h-5 items-center rounded-sm border border-line bg-raised px-1 font-mono text-12 text-fg-3">`。 |
| `components/ViewBar.tsx`（新） | `ViewBar` | `{ icon?: LucideIcon; title: ReactNode; documentTitle: string; children?: ReactNode; right?: ReactNode }`。`<div data-view-bar className="flex h-[var(--view-bar-h)] shrink-0 items-center gap-3 border-b border-line px-4 max-md:px-3">`：左边 `<div className="flex min-w-0 items-center gap-2">`（`icon` 16px `text-fg-3` + `<h1 className="flex min-w-0 items-center gap-1.5 truncate text-13 font-medium text-fg-1">{title}</h1>`）；`children` 紧跟在它后面（视图切换等）；`right` 放在 `<div className="ml-auto flex shrink-0 items-center gap-2">`。挂载和 `documentTitle` 变化时设 `document.title = "{documentTitle} · fleet studio"`。 |
| `components/FilterBar.tsx`（新） | `FilterBar` | `{ children: ReactNode }`。`<div data-filter-bar className="flex h-[var(--filter-bar-h)] shrink-0 items-center gap-2 border-b border-line px-4 max-md:overflow-x-auto max-md:px-3">{children}</div>`。 |
| `components/ViewTabs.tsx`（新） | `ViewTabs` | `{ items: { key: string; label: string; to: string; icon: LucideIcon; end?: boolean }[]; ariaLabel: string }`。`<nav aria-label={ariaLabel} className="flex items-center gap-0.5">`，每项是 React Router `NavLink`（`end` 透传），`data-view-tab={key}`：`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-12 font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg-1`；当前项（`aria-current="page"`）`bg-selected text-fg-1`；图标 14px。< 800 只显示图标（文字 `max-md:sr-only`）。 |
| `components/Panel.tsx`（新，替代 `SectionCard`） | `Panel` | `{ title?: string; titleExtra?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; "data-section"?: string }`。`<section data-section={…} className="min-w-0 rounded-lg border border-line bg-card shadow-card {className}">`；有 `title` 或 `right` 时顶部 `<header className="flex h-10 items-center gap-2 border-b border-line px-4">`：`<h2 className="truncate text-13 font-medium text-fg-1">{title}</h2>`、`titleExtra`（紧跟标题，如「按天」）、`<div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>`；主体 `<div className={bodyClassName ?? "p-4"}>`。 |
| `components/MetricStrip.tsx`（新，替代 `StatCard`） | `MetricStrip`、`Metric` | `MetricStrip { "aria-label": string; children: ReactNode; "data-strip"?: string }` → `<section aria-label … className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card lg:grid-cols-4">`（`gap-px` 露出底下的 `bg-line`，就是格子之间的 1px 细线）。`Metric { label: string; value: string; valueClassName?: string; sub?: ReactNode; extra?: ReactNode; onClick?: () => void; ariaLabel?: string; loading?: boolean; "data-stat"?: string }` → 单元格 `flex min-w-0 flex-col gap-1 bg-card px-4 py-3`；有 `onClick` 时渲染成 `<button type="button">`，加 `text-left transition-colors hover:bg-raised`。内容：`label`（`text-12 text-fg-3`）→ `value`（`truncate font-mono text-16 font-medium {valueClassName ?? "text-fg-1"}`）→ `extra`（如占用条）→ `sub`（`truncate text-12 text-fg-2`）。`loading` 时 `value` 换成 `Skeleton h-[22px] w-20`、`sub` 换成 `Skeleton h-4 w-28`。 |
| `components/SegmentedControl.tsx` | `SegmentedControl` | 签名不变。外框 `inline-flex h-7 items-center gap-0.5 rounded-md border border-line bg-card p-0.5`（`size="sm"` 时 `h-6`）；每项 `h-6 rounded-sm px-2 text-12 text-fg-2 hover:bg-hover hover:text-fg-1`（`sm` 时 `h-5 px-1.5`）；选中 `data-[state=on]:bg-selected data-[state=on]:text-fg-1 data-[state=on]:font-medium`（**不用强调色**）；禁用 `disabled:text-fg-3 disabled:pointer-events-none`。`data-seg`、`data-control` 标记照旧。 |
| `components/RangePicker.tsx` | `RangePicker` | 签名和行为照旧。`select` 变体的触发器 `h-7 w-[148px] text-12`；日历弹层 `data-range-calendar` 照旧。 |
| `components/DimensionTabs.tsx` | `DimensionTabs` | 不变（外观随 `SegmentedControl`）。 |
| `components/SeriesLegend.tsx` | `SeriesLegend` | 不变。 |
| `components/ProjectLabel.tsx`（新） | `ProjectLabel` | `{ projectKey: string }`。用 `useProjectLookup()` 取名字和色位，渲染 `<Label data-label="project" colorVar={projectColorVar(colorIndex)} title={name}>{name}</Label>`；查不到色位时不画色点。 |

`StatusIcon` 的五种形状（`viewBox="0 0 16 16"`，线宽都是 1.7，全部用 `currentColor`；勾和叉画在实心圆上面，颜色用类名 `stroke-card`，即卡片底色）：

| 状态 | 形状 |
|---|---|
| queued | `<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2.4 2.3" />`（虚线圈） |
| running | `<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.7" />` + `<path d="M8 4.5 A3.5 3.5 0 0 1 8 11.5 Z" fill="currentColor" />`（右半填充） |
| completed | `<circle cx="8" cy="8" r="7" fill="currentColor" />` + `<path d="M5 8.2 L7.1 10.2 L11 6.2" fill="none" className="stroke-card" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />` |
| failed | `<circle cx="8" cy="8" r="7" fill="currentColor" />` + `<path d="M5.8 5.8 L10.2 10.2 M10.2 5.8 L5.8 10.2" fill="none" className="stroke-card" stroke-width="1.7" stroke-linecap="round" />` |
| cancelled | `<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.7" />` + `<path d="M4.3 11.7 L11.7 4.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />` |

（JSX 里属性写成 `strokeWidth`、`strokeDasharray`、`strokeLinecap`、`strokeLinejoin`。）

shadcn/ui 组件（`components/ui/`）按新令牌调外观，**已有的变体名和尺寸名都保留**（旧业务代码还在用），只改数值：

| 组件 | 要点 |
|---|---|
| `button.tsx` | 基础类 `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-12 font-medium whitespace-nowrap transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5`。变体：`default` `bg-brand text-on-brand hover:brightness-110 active:brightness-95`；`outline` `border border-line bg-card text-fg-1 shadow-card hover:bg-raised`；`ghost` `text-fg-2 hover:bg-hover hover:text-fg-1`；`secondary` `bg-raised text-fg-1 hover:bg-hover`；`destructive` `bg-status-failed text-on-brand hover:brightness-110 active:brightness-95`；`link` `h-auto px-0 text-brand hover:underline underline-offset-2`。尺寸：`default` `h-7 px-2.5`、`sm` 和 `xs` 都是 `h-6 px-2`、`lg` `h-8 px-3`、`icon` `size-7`、`icon-sm` 和 `icon-xs` 都是 `size-6`、`icon-lg` `size-8`。 |
| `input.tsx` | `h-7 w-full min-w-0 rounded-md border border-line bg-card px-2 text-12 text-fg-1 shadow-card outline-none placeholder:text-fg-3 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-soft disabled:opacity-50`（删掉 ring 类）。 |
| `select.tsx` | 触发器 `h-7 rounded-md border border-line bg-card px-2 text-12 shadow-card`，右侧 `ChevronDown` 14px `text-fg-3`；内容 `rounded-lg border border-line bg-overlay p-1 shadow-overlay`；选项 `h-7 rounded-md pl-2 pr-7 text-12 data-[highlighted]:bg-hover`，选中项右侧 `Check` 14px。 |
| `dropdown-menu.tsx`（新，照 shadcn new-york 写） | 导出 `DropdownMenu`、`DropdownMenuTrigger`、`DropdownMenuContent`、`DropdownMenuItem`、`DropdownMenuSub`、`DropdownMenuSubTrigger`、`DropdownMenuSubContent`、`DropdownMenuRadioGroup`、`DropdownMenuRadioItem`、`DropdownMenuLabel`、`DropdownMenuSeparator`。内容和子内容 `min-w-[200px] rounded-lg border border-line bg-overlay p-1 text-12 shadow-overlay`，层级 `z-[var(--z-overlay)]`；项 `flex h-7 cursor-default items-center gap-2 rounded-md px-2 text-12 text-fg-1 outline-none select-none data-[highlighted]:bg-hover data-[disabled]:opacity-50`；子菜单触发项右侧 `ChevronRight` 14px `text-fg-3`（`ml-auto`）；单选项右侧 `ml-auto` 放 `Check` 14px（选中才显示）；标签 `px-2 pt-1.5 pb-1 text-12 text-fg-3`；分隔 `-mx-1 my-1 h-px bg-line`。 |
| `dialog.tsx`（新，照 shadcn new-york 写） | 导出 `Dialog`、`DialogTrigger`、`DialogContent`、`DialogTitle`、`DialogDescription`、`DialogClose`。遮罩 `fixed inset-0 z-[var(--z-overlay)] bg-scrim`；内容默认 `fixed left-1/2 top-1/2 z-[var(--z-overlay)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-overlay shadow-overlay`，不带右上角关闭按钮（`showCloseButton` 默认 false）。 |
| `popover.tsx` | 内容 `z-[var(--z-overlay)] rounded-lg border border-line bg-overlay p-3 text-12 shadow-overlay`。 |
| `tooltip.tsx` | 内容 `z-[var(--z-overlay)] rounded-md border border-line bg-overlay px-2 py-1 text-12 text-fg-1 shadow-overlay`，不画箭头。 |
| `sheet.tsx` | 遮罩 `bg-scrim`；内容 `bg-window`；`side="left"` 时 `inset-y-0 left-0 h-full w-[var(--sidebar-w)] border-r border-line`；不渲染右上角关闭按钮（加 `showCloseButton` 参数，默认 false）。 |
| `switch.tsx` | 轨道 `h-4 w-7 rounded-full`，关 `bg-line-strong`、开 `bg-brand`；圆钮 `size-3 rounded-full bg-card shadow-card`，开时右移 12px；禁用 `opacity-40`。 |
| `table.tsx` | 行 `border-b border-line`；表头格 `h-8 px-3 text-left align-middle text-12 font-medium`（颜色交给里面的元素，避免 twMerge 吃掉字号）；单元格 `px-3 align-middle text-13`。 |
| `skeleton.tsx` | `rounded-md bg-hover`，**不带** `animate-pulse`。 |
| `alert-dialog.tsx` | 遮罩 `bg-scrim`；内容 `w-[400px] max-w-[calc(100vw-24px)] rounded-lg border border-line bg-overlay p-4 shadow-overlay`；标题 `text-14 font-medium`；按钮行右对齐 `gap-2`，「取消」`Button variant="outline"`。 |
| `toggle-group.tsx`、`toggle.tsx` | 去掉自带的边框、阴影和 `text-sm`，外观交给 `SegmentedControl`。 |
| `calendar.tsx` | 选中日 `bg-brand text-on-brand`、范围中间 `bg-brand-soft`、今天 `font-medium` + `ring-1 ring-line-strong`，字号 `text-12`。 |
| `chart.tsx` | 提示卡 `rounded-md border border-line bg-overlay px-2 py-1.5 text-12 shadow-overlay`。 |
| `sonner.tsx` | 提示条 `bg-overlay text-fg-1 border-line shadow-overlay text-12 rounded-lg`。 |
| `sidebar.tsx` 与 `hooks/use-mobile.ts` | **删除**（新侧栏不用 shadcn Sidebar）；`card.tsx`、`badge.tsx`、`separator.tsx`、`collapsible.tsx` 有人用就留，没人用就删。 |

### 4.4 数据层契约

`api/dataSource.ts`、`api/liveSource.ts`、`api/pickSource.ts`、`api/demo/**` **不动**。`api/queries.ts` 保留全部现有钩子，地基路只加一个：

```ts
/** 窗口栏搜索：按标题搜全部历史，最多 8 条。关键词去掉首尾空白后为空时不发请求 */
export function useTaskSearch(query: string) {
  const dataSource = useDataSource();
  const q = query.trim();
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => dataSource.getTasks({ range: "all", status: "all", q, sort: "createdAt", order: "desc", limit: 8 }),
    enabled: q.length > 0,
    staleTime: 5000,
    placeholderData: keepPreviousData,
  });
}
```

### 4.5 状态仓库（`state/`）

已有的照旧：`snapshotStore`、`workerStore`、`nowStore`、`overviewStore`；`taskFilterStore`（主控已改：默认状态是 `"all"`，其余不变）。地基路改一个、加五个：

| 文件 | 形状 | 说明 |
|---|---|---|
| `sidebarStore.ts`（改） | `{ open: boolean; drawerOpen: boolean; setOpen(v); toggle(); setDrawerOpen(v) }` | `open` 是 ≥ 1024 时侧栏是否常驻显示，存 `localStorage` 键 `fleet.sidebar`（值 `"open"` / `"closed"`；读到旧值 `"collapsed"` 当 `"closed"`，其余当 `"open"`）；`drawerOpen` 是 < 1024 时抽屉是否打开，只在内存里。 |
| `viewStore.ts`（新） | `{ lastTasksView: TaskView; setLastTasksView(v) }`，默认 `"board"` | 任务页最后停在看板还是列表（`TaskView` 从 `lib/taskFilters.ts` 引）；再加导出函数 `tasksPath(view: TaskView): string`（`"board"` → `"/tasks"`，`"list"` → `"/tasks/list"`）。只在内存里。 |
| `boardStore.ts`（新） | `{ expanded: ReadonlySet<CollapsibleColumn>; toggleExpanded(status: CollapsibleColumn): void }` | 看板上失败、已取消两列是否展开（`CollapsibleColumn` 从 `lib/board.ts` 引）。存 `localStorage` 键 `fleet.board.expanded`（JSON 数组，只收 `"failed"`、`"cancelled"`，读坏了当空）。 |
| `displayStore.ts`（新） | `{ cardProps: Record<CardProp, boolean>; setCardProp(key: CardProp, on: boolean): void }`，`export type CardProp = "id" \| "pool" \| "project" \| "role" \| "meta"`，默认全 true；再导出 `CARD_PROP_OPTIONS: { key: CardProp; label: string }[]` = 编号 id、池 pool、项目 project、角色 role、进度 meta（按这个顺序） | 看板卡片上显示哪些信息。存 `localStorage` 键 `fleet.board.props`（JSON 对象，缺的键用默认值）。 |
| `searchStore.ts`（新） | `{ open: boolean; setOpen(v: boolean): void; toggle(): void }` | 搜索弹窗开关。只在内存里。 |
| `useProjectLookup.ts`（新） | `export function useProjectLookup(): (projectKey: string) => { name: string; colorIndex: number \| undefined }` | 先查快照的 `projects`，再查 `useProjects()` 的结果；都查不到时名字取 `projectKey` 按 `/` 和 `\` 切开的最后一段，色位 `undefined`。用 `useMemo` 缓存查找表。 |

### 4.6 纯函数（`lib/`，主控已写好并有单测，各路直接用）

```ts
// lib/board.ts
BOARD_COLUMN_ORDER: readonly RunStatus[]          // queued, running, completed, failed, cancelled
COLLAPSIBLE_COLUMNS = ["failed", "cancelled"]; type CollapsibleColumn
isCollapsibleColumn(status): status is CollapsibleColumn
boardLayout(expanded): { columns: RunStatus[]; collapsed: CollapsibleColumn[] }
filterBoardWorkers(workers, { project?, pool?, role?, channel?, model?, q }): WorkerSummary[]
groupBoardColumns(workers): Record<RunStatus, WorkerSummary[]>   // 每列已排好序
cardMeta(worker): { kind: "queue"; text } | { kind: "elapsed"; from } | { kind: "retry"; text }
                | { kind: "duration"; ms } | { kind: "failure"; text } | null
// lib/search.ts
SEARCH_LIMIT = 8
matchLiveTasks(workers, query, limit?): WorkerSummary[]      // 空关键词 = 最近创建的 8 个
mergeSearchResults(live, remote, limit?): WorkerSummary[]
// lib/taskFilters.ts
type TaskView = "board" | "list"
TASK_STATUS_OPTIONS, TASK_SORT_OPTIONS, taskStatusLabel(s), taskSortLabel(s)
toTasksQuery(filters, cursor?)
activeFilterChips(filters, lookups, view): { key; label }[]   // label 已是最终文字，如「项目：wiki-forge」
chipResetPatch(key): Partial<TaskFilterState>
hasActiveFilters(filters, view): boolean
// lib/status.ts
STATUS_META: Record<RunStatus, { label; iconClass }>;  RETRY_ICON_CLASS
// 其余照旧：lib/format.ts、lib/colors.ts、lib/slotMeter.ts、lib/timelineView.ts、lib/tools.ts、lib/activity.ts、lib/liveMerge.ts、lib/utils.ts
```

## 5. 各页规格

- [design/骨架.md](design/骨架.md) —— S1～S6（地基路读 S1～S5；搜索路读 S6）
- [design/看板.md](design/看板.md) —— T4（看板路）
- [design/任务列表.md](design/任务列表.md) —— T1、T2、T3、T5（列表路）
- [design/任务详情.md](design/任务详情.md) —— D1～D4（详情路）
- [design/槽位.md](design/槽位.md) —— L1～L5（槽位路）
- [design/总览.md](design/总览.md) —— O1～O6（总览路）
- [design/演示数据.md](design/演示数据.md) —— 演示数据（第二版写的，本版不变）

## 6. 文案原则

- 全部中文，遵守界面文案守则：删掉不影响理解的字就不写；不写说明腔、开发备注、「运行正常」一类无意义状态；只放标题不配副标题；不给每块都配标题和说明。
- 状态词只用：排队中、工作中、已完成、失败、已取消；附加标记：重试 N/M、排队第 N 位、公共排队第 N 位、不通过。失败原因的中文取 `@fleet/core` 的 `FAIL_REASON_LABELS`。
- 数字一律具体：`23/40`、`排队 7`、`3分12秒`、`682.2M`。为 0 的计数项不显示（规格明确要显示 0 的除外）。
- 侧栏：任务、槽位、总览、项目。视图：看板、列表。按钮：筛选、显示、清除筛选。时间档位：今日、近 7 天、近 30 天、全部、自选。维度：模型、渠道、项目、角色。合并项：其他。
- 本文件和页面层写死的文案逐字照抄，不许改写、不许加标点。

## 7. 质量门禁

```bash
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
pnpm exec vitest run apps/web
pnpm exec biome check apps/web
node scripts/check-tokens.mjs
pnpm --filter @fleet/web build      # 构建由主控统一跑
```

`scripts/check-tokens.mjs`（地基路扩展）在现有「写死色值」检查之外，对 `apps/web/src` 下的 `.ts`、`.tsx` 再拦这几类（命中一处就失败，输出「文件:行号: 原文 (命中片段)」）：

1. Tailwind 自带调色板：`\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|caret|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b`，以及 `\b(?:bg|text|border|fill|stroke)-(?:white|black)\b`。
2. 方括号里的颜色：`-\[(?:#|rgb|rgba|hsl|hsla|oklch)`。
3. 停用的字号字重和旧类名：`\btext-(?:11|22|28|xs|sm|base|lg|xl|2xl|3xl)\b`、`\bfont-(?:semibold|bold|extrabold|black)\b`、`\b(?:bg|text|border)-page\b`、`\bshadow-none\b`。

自查：

- 不准 `any`、不准 `as` 强转（shadcn 源码里原有的保留）、不准 `@ts-ignore`、不准未使用的 import。
- 颜色、字号、间距、圆角只用第 2 章的类名；方括号里只准写 `var(--…)` 或规格写明的像素值（如 `mt-[1.5px]`）。
- 不在组件里 `new Date()` / `Date.now()` 取当前时刻：一律 `useNow()`。
- 所有可交互元素键盘可达、焦点可见；图标 `aria-hidden`，含义由文字或 `aria-label` 承担。
- 长文本都有省略或折叠；页面整体不出现横向滚动；网格和弹性布局里有横向滚动区的子项加 `min-w-0`。
- 输入框、下拉都是受控组件。
- Tailwind 只认完整类名：按状态切换颜色用对象映射完整类名，禁止拼接。

## 8. 文件写入边界与分路表

- **主控独占**：`src/styles/tokens.css`、本文件、`design/*.md`、`src/lib/board.ts`、`src/lib/search.ts`、`src/lib/taskFilters.ts`、`src/lib/status.ts`（及它们的单测）、`src/state/taskFilterStore.ts`。
- **公共文件（只有地基路能写；其余各路一律不准碰）**：`package.json`（只加第 1 章那一个依赖）、`src/main.tsx`、`src/app/**`（`app/search/**` 除外，地基只建占位）、`src/styles/globals.css`、`src/components/**`、`src/hooks/**`、`src/api/queries.ts`、`src/state/**`（`taskFilterStore.ts` 除外）、`scripts/check-tokens.mjs`、四个 `pages/*.tsx` 的占位。
- 每路只写分给自己的文件；要拆子组件，只能放在自己的目录、以自己的区块组件名开头（例如 `TaskBoardColumn.tsx`）。
- 只能 import：`react`、`react-router`、`@tanstack/react-query`、`zustand`、`recharts`（只在总览路）、`lucide-react`（白名单）、`@fleet/core`、`@/components/**`、`@/api/queries`、`@/state/**`、`@/lib/**`，以及自己目录里的文件。**不 import 其他路的文件**，唯一例外：`pages/TasksPage.tsx` 从 `@/features/board/TaskBoard` import `TaskBoard`。

| 路 | 负责的文件 | 读哪些规格 | 依赖 |
|---|---|---|---|
| 地基 | 上面列的全部公共文件；四个页面占位；删除第 4.3 节列出的旧文件 | 本文件、`design/骨架.md` S1～S5 | 无 |
| 看板 | `src/features/board/**` | 本文件、`design/看板.md` | 地基 |
| 列表 | `src/features/tasks/**`、`src/pages/TasksPage.tsx` | 本文件、`design/任务列表.md` | 地基 |
| 详情 | `src/features/worker/**`、`src/pages/TaskDetailPage.tsx` | 本文件、`design/任务详情.md` | 地基 |
| 槽位 | `src/features/slots/**`、`src/pages/SlotsPage.tsx` | 本文件、`design/槽位.md` | 地基 |
| 总览 | `src/features/overview/**`、`src/pages/OverviewPage.tsx` | 本文件、`design/总览.md` | 地基 |
| 搜索 | `src/app/search/**` | 本文件、`design/骨架.md` S6 | 地基 |
| 测试 | `scripts/ui/**` | 本文件、全部 `design/*.md` 末尾的交互检查表 | 地基（跑检查要等各页完成） |

占位的导出名（各路必须保持）：`pages/TasksPage.tsx` → `TasksPage`（`{ view: TaskView }`）；`pages/TaskDetailPage.tsx` → `TaskDetailPage`；`pages/SlotsPage.tsx` → `SlotsPage`；`pages/OverviewPage.tsx` → `OverviewPage`；`features/board/TaskBoard.tsx` → `TaskBoard`（无参数）；`app/search/SearchDialog.tsx` → `SearchDialog`（无参数）。

## 9. 哪些是编的

| 项 | 状态 |
|---|---|
| 四个池（dsf 20、glmf 7、qwen27 5、luna 8）的编号、渠道、模型、容量 | **真实**，来自本机配置（2026-09-25） |
| 演示项目名、30 天历史、在跑那批任务的标题、任务书、时间线、回报 | **编的**，见 `design/演示数据.md`，本版不变 |
| 侧栏版本号「v0.3」 | 第三版界面的编号，不对应包版本 |
| 各列排序规则、卡片进度小片的文字 | 主控定的，写在 `lib/board.ts` 并有单测 |

## 附录 数据

演示数据不变（`src/api/demo/**`）。交互检查要核对的数字从这些单测里抄：`src/api/demo/scenarios.test.ts`（实时五个数、池、统计、任务查询）、`src/lib/board.test.ts`（看板各列数量和顺序、按项目筛后的数量、卡片小片文字）、`src/lib/search.test.ts`（搜索结果）、`src/lib/taskFilters.test.ts`（小标签文字）。
