# fleet studio 看板（第二版：控制台）—— 站点层规格（唯一事实来源）

> 所有实现会话动手前先读完本文件，再读 `design/` 下属于自己那一页的规格。本文件和 `design/*.md` 是契约，**实现会话不得修改**。
> 视觉令牌与状态画法的依据是 `docs/前端设计.md`（第二版各节）；页面和区块的依据是 `docs/页面清单.md`；功能编号见 `docs/功能清单.md`。
> 规格故意写满：该有的先摆上，删减是主控验收时的事。实现会话只负责按规格做出来，规格没写的按同一套令牌补齐，不要自己发挥。
> 第一版（单页工作区）的规格在 git 历史里；`design/工作区.md` 保留，其中 R6～R8（苦工详情、任务与回报、时间线）的**行为**仍然有效，任务页详情照它迁移。

---

## 0. 定位、参照与验收标准

一个只在本机打开的控制台，给同时推进多个项目、每个项目派出一群便宜模型苦工的人用。三页：总览、槽位、任务。

用户来这里干这几件事：

1. 打开总览：一眼看出现在忙不忙（占了多少槽位、几个在跑、几个在排队、几个在重试），再看选定时间段里用了多少 token、派了多少活、花了多久。
2. 在总览看 token 花在哪些模型 / 渠道 / 项目 / 角色上、怎么随时间变化，哪个项目派活最多；点一项跳到任务页看明细。
3. 在槽位页看每个「渠道 · 模型」被谁占着、排了几个、最近顺不顺；停用某个池，或上下移动调整派活先用谁。
4. 在任务页按状态、项目、池、角色、时间筛任务，按标题搜；点开一个看任务书、实时过程和回报。

目标观感：**Sub2API 控制台的布局 + Linear 的克制灰阶 + Nomad 的「条和大数字分开摆」**。参照和各自抄什么：

| 参照 | 抄什么 |
|---|---|
| Sub2API 控制台（用户提供截图，凭截图） | 左侧菜单（顶部产品名 + 版本号、图标 + 文字、当前页整行浅色块）；内容区顶栏写页面名；一排统计卡片（上小灰标签、中大数字、下补充行）；横向筛选条卡片；「环形图在左、明细表在右」的图表卡片，卡片头部右侧放分段切换 |
| shadcn/ui 官方示例 Dashboard（ui.shadcn.com/examples/dashboard，凭记忆） | 可收起到只剩图标的侧栏；卡片、表格、分段切换、下拉框、开关、确认框、日历的组件形态；图表卡片的悬停提示样式 |
| Linear（2024 改版侧栏，凭记忆） | 层级靠明暗不靠字号；四级灰阶；选中块整行圆角 |
| HashiCorp Nomad Web UI 资源占用卡（凭记忆） | 槽位页占用格子和大数字分开摆 |
| Temporal Web UI Event History（凭记忆） | 重试斜纹；时间线「图标 + 类型 + 内联摘要」 |

不抄：Sub2API 卡片上的彩色图标块、余额和用户菜单、通知铃铛；任何渐变、投影卡片、表情符号、欢迎语、页面副标题；营销式大留白。

### 0.1 页面清单

| 页面 | 路由（哈希） | 用户来干什么 | 首屏核心动作 | 参照页 | 区块下限 | 分路 |
|---|---|---|---|---|---|---|
| 总览 | `#/overview`（`#/` 也到这里） | 看忙不忙、看用量和分布 | 实时卡片（可点）、时间筛选、统计卡片同时在首屏 | Sub2API 使用记录页 | 6：实时卡片、时间筛选、统计卡片、token 分布、任务次数分布、token 趋势 | 总览路 |
| 槽位 | `#/slots` | 看每个池、停用、调顺序 | 槽位表格第一行的开关和上下移动在首屏 | Nomad 资源卡 + Sub2API 渠道列表 | 3：顶栏右侧公共排队、槽位表格（含提示卡）、停用确认框 | 槽位路 |
| 任务 | `#/tasks`、`#/tasks/<编号>` | 找任务、看详情 | 筛选条和表格前几行在首屏 | Sub2API 使用记录表 + 第一版工作区详情 | 5：筛选条、已选条件、任务表格、详情（头部、任务书、过程、回报） | 任务表格路、任务详情路 |

### 0.2 验收标准（先写死，验收时逐项对）

- 三页都能从左侧菜单进入，刷新停在当前页；`#/w/<编号>`（第一版链接）跳到 `#/tasks/<编号>`；其他未知地址跳到 `#/overview`。
- 每页每个区块处理：加载中、空、出错、长文本、四档宽度（1440、1280、1024、800）不出现页面级横向滚动；深浅两套主题。
- 演示数据五个场景（`?demo=busy|empty|failure|offline|disabled`）下三页截图都符合规格。
- 门禁：`pnpm check` 全绿（含扩展后的写死颜色检查）；交互检查（各页末尾的表）全部通过。
- 首屏核心动作按 0.1 表出现在 1280×800 视口的首屏。

---

## 1. 技术栈（已锁定）

| 项 | 值 |
|---|---|
| 框架 | React 19 + Vite（已装），单页应用 |
| 语言 | TypeScript，仓库根 `tsconfig.base.json` 的最严格设置 |
| 组件库 | shadcn/ui（源码放 `src/components/ui/`），底层 Radix |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite`）；令牌是 `src/styles/tokens.css` 的 CSS 变量，经 `src/styles/globals.css` 的 `@theme inline` 映射成类名（第 2 章） |
| 路由 | React Router 7，`createHashRouter` |
| 数据请求 | TanStack Query 5（统计、任务列表、项目列表、两个改设置的请求）；全局快照流和单苦工流仍用 zustand 仓库 |
| 状态 | zustand（已装） |
| 图表 | Recharts 3，经 shadcn/ui 的 `chart` 组件用 |
| 日历 | react-day-picker 9，经 shadcn/ui 的 `calendar` 组件用 |
| 提示消息 | sonner，经 shadcn/ui 的 `sonner` 组件用（只用于改设置失败） |
| 图标 | `lucide-react` 1.47.0，只用下方白名单 |
| 单测 | Vitest，只测 `src/lib/`、`src/api/`、`src/state/` 下的纯函数和演示数据 |
| 包管理 | pnpm（仓库根执行，`pnpm --filter @fleet/web add ...`） |

**不引入**（除上表外一律不准加）：动画库、CSS-in-JS、其他 UI 框架、其他图表库、日期库（react-day-picker 自带的 `date-fns` 依赖允许存在，业务代码不直接 import）、虚拟列表库、表单库。

可用图标白名单（已在本机 1.47.0 逐个确认存在，只用这些）：`LayoutDashboard`、`Layers`、`ListChecks`、`PanelLeftClose`、`PanelLeftOpen`、`ChevronUp`、`ChevronDown`、`ChevronRight`、`ChevronLeft`、`ChevronsUpDown`、`ArrowUp`、`ArrowDown`、`ArrowLeft`、`ArrowUpDown`、`CalendarDays`、`X`、`Search`、`Copy`、`Check`、`WifiOff`、`TriangleAlert`、`Info`、`Unplug`、`Clock`、`LoaderCircle`、`CircleCheck`、`CircleX`、`CircleSlash`、`CircleDot`、`RotateCw`、`FileText`、`SquareTerminal`、`Terminal`、`Pencil`、`FilePlus`、`Globe`、`Wrench`、`MessageSquare`、`Brain`、`Inbox`。shadcn/ui 组件源码里自带的图标如果不在名单里，换成名单里最接近的（例如 `ChevronDownIcon` 用 `ChevronDown`）。

## 2. 设计令牌

### 2.1 令牌与类名

- 令牌全部在 `src/styles/tokens.css`（主控独占，**谁都不准改**），数值来源是 `docs/前端设计.md` 第 3 节。
- `src/styles/globals.css`（地基路写）按下表把令牌映射成 Tailwind 类名。**业务代码只用这些类名**；任何 `#…`、`rgb(`、`hsl(`、`oklch(` 色值、方括号里的色值（例如 `bg-[#fff]`）、Tailwind 自带调色板（`bg-white`、`text-black`、`bg-blue-500`、`border-zinc-200` 之类）都会被门禁拦截。

`@theme inline` 里的颜色映射（写 `--color-<名字>: var(<令牌>)`，得到 `bg-<名字>`、`text-<名字>`、`border-<名字>` 等类名）：

| 名字 | 令牌 | 说明 |
|---|---|---|
| `page` | `--bg-page` | 页面底 |
| `panel` | `--bg-panel` | 侧栏、顶栏、卡片、表格 |
| `raised` | `--bg-raised` | 回报卡、代码块、展开的工具详情 |
| `overlay` | `--bg-overlay` | 提示卡、弹出层、确认框 |
| `hover` | `--bg-hover` | 可点的行、按钮的悬停底 |
| `selected` | `--bg-selected` | 选中行、当前菜单项 |
| `line` | `--line` | 发丝线 |
| `line-strong` | `--line-strong` | 输入框边框、空格子描边 |
| `meter-track` | `--meter-track` | 空格子底、骨架 |
| `fg-1` / `fg-2` / `fg-3` | `--text-1` / `--text-2` / `--text-3` | 主文字（对比度 ≥ 15.9）/ 次要（≥ 6.3）/ 标签和时间戳（≥ 4.66） |
| `brand` / `brand-soft` / `on-brand` | `--accent` / `--accent-soft` / `--on-accent` | 强调色只用于：焦点环、当前菜单项文字图标、分段切换选中项、开关打开的轨道、选中行左侧 2px 标记、「回到最新」按钮 |
| `st-queued` `st-running` `st-done` `st-failed` `st-cancelled` `st-warning` | 同名 `--st-*` | 状态色，可做文字 |
| `st-warning-soft` `st-failed-soft` | 同名 | 提示条、异常行的淡底 |
| `proj-0`～`proj-7` | `--proj-0`～`--proj-7` | 项目色，**只做图形**（格子、色点），不做文字 |
| `series-0`～`series-7`、`series-other` | 同名 | 图表系列色，只做图形 |
| `scrim` | `--scrim` | 确认框遮罩 |

同一个 `@theme inline` 里再给 shadcn/ui 组件用的语义名（shadcn 组件源码里的类名靠它们生效，业务代码不用这些名字）：

| shadcn 名字 | 令牌 |
|---|---|
| `background` / `foreground` | `--bg-page` / `--text-1` |
| `card` / `card-foreground` | `--bg-panel` / `--text-1` |
| `popover` / `popover-foreground` | `--bg-overlay` / `--text-1` |
| `primary` / `primary-foreground` | `--accent` / `--on-accent` |
| `secondary` / `secondary-foreground` | `--bg-raised` / `--text-1` |
| `muted` / `muted-foreground` | `--bg-hover` / `--text-3` |
| `accent` / `accent-foreground` | `--bg-hover` / `--text-1`（注意：shadcn 的 accent 是悬停底，不是本项目的强调蓝） |
| `destructive` | `--st-failed` |
| `border` / `input` / `ring` | `--line` / `--line-strong` / `--accent` |
| `chart-1`～`chart-8` | `--series-0`～`--series-7` |
| `sidebar` / `sidebar-foreground` | `--bg-panel` / `--text-2` |
| `sidebar-primary` / `sidebar-primary-foreground` | `--accent` / `--on-accent` |
| `sidebar-accent` / `sidebar-accent-foreground` | `--bg-selected` / `--accent` |
| `sidebar-border` / `sidebar-ring` | `--line` / `--accent` |

shadcn/ui 组件源码里凡是 `bg-black/50`、`text-white` 这类写死颜色，一律换成上表名字（遮罩用 `bg-scrim`，白字用 `text-on-brand`）。

### 2.2 字阶与排版

`@theme inline` 里：`--font-sans: var(--font-sans)`、`--font-mono: var(--font-mono)`（类名 `font-sans`、`font-mono`）；字号 `--text-11: var(--fs-11)` 配 `--text-11--line-height: var(--lh-11)`，同理 12、13、14、16、22、28（类名 `text-11`～`text-28`）。**不用** Tailwind 自带的 `text-xs`、`text-sm` 等；shadcn 组件里出现的一律换：`text-xs` → `text-12`，`text-sm` → `text-13`，`text-base` → `text-14`，`text-lg` → `text-16`。

| 用途 | 类名 |
|---|---|
| 顶栏页面名 | `text-16 font-semibold text-fg-1` |
| 卡片标题（token 分布、任务次数分布……） | `text-14 font-semibold text-fg-1` |
| 统计卡片标签 | `text-12 text-fg-3` |
| 统计卡片大数字 | `text-28 font-semibold font-mono text-fg-1` |
| 统计卡片补充行 | `text-12 text-fg-2` |
| 表头 | `text-12 font-medium text-fg-3` |
| 表格正文 | `text-13 text-fg-1` |
| 次要行、时间戳 | `text-12 text-fg-3` |

字重只用 `font-normal`、`font-medium`、`font-semibold`。时间、时长、计数、编号、路径、token 数一律 `font-mono`；表格里需要纵向对齐的数字列加 `tabular-nums`；大号独立数字不加。

### 2.3 间距、圆角、阴影、断点

- `@theme inline` 里 `--spacing: 4px`，所以 `p-1`=4px、`p-2`=8px、`p-3`=12px、`p-4`=16px、`p-5`=20px、`p-6`=24px、`p-8`=32px，正好是 `--sp-*` 阶梯。只用这些档位（`gap-*`、`m-*` 同理）。
- 圆角：`--radius-sm: var(--r-sm)`（4px）、`--radius-md: var(--r-md)`（6px）、`--radius-lg: var(--r-lg)`（8px）、`--radius-xl: var(--r-lg)`（shadcn 卡片用 xl，也落到 8px）；格子另用 `rounded-[var(--r-slot)]`（方括号里只准写 `var(--…)`）。
- 阴影：`--shadow-2xs`、`--shadow-xs`、`--shadow-sm` 都设成 `0 0 0 0 transparent`（shadcn 的按钮、卡片自带阴影，本项目一律不要）；`--shadow-md`、`--shadow-lg` 设成 `var(--shadow-overlay)`（只有弹出层、提示卡、确认框用得到）。
- 骨架尺寸：侧栏 `w-[var(--sidebar-w)]`、收起 `w-[var(--sidebar-w-collapsed)]`、顶栏 `h-[var(--header-h)]`、内容区内边距 `p-6`、卡片间距 `gap-4`、卡片内边距 `p-5`。
- 断点（Tailwind 默认的 `lg` = 1024px、`xl` = 1280px；另在 `@theme` 加 `--breakpoint-md: 800px`）：≥ 1280 全布局；1024～1279 同上；800～1023 侧栏自动收起、卡片一行 2 张、图表单列、任务详情整屏；< 800 同上且宽表格在卡片内横向滚动。验收看 1440、1280、1024、800 四档。
- 焦点：所有可聚焦元素 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`，只在键盘聚焦时出现（shadcn 组件自带的 ring 样式保留，颜色已映射到 `--accent`）。

### 2.4 全局样式（`globals.css`，地基路写）

- `@import "tailwindcss";`、`@import "./tokens.css";`，然后 `@theme inline { … }`（2.1～2.3 的全部映射）。
- `html, body, #root` 高度 100%；`body` 用 `bg-page text-fg-1 font-sans text-13`；`::selection` 用 `bg-brand-soft`。
- 暗色、浅色跟随系统：令牌文件已用 `prefers-color-scheme` 切换，Tailwind 的 `dark:` 变体保持默认（按系统设置），**不加** `.dark` 类，不做主题切换按钮。
- 旋转动画：`@keyframes spin`（Tailwind 自带 `animate-spin` 是 1 秒，本项目要 1.2 秒：定义 `--animate-spin-slow: spin 1.2s linear infinite`，类名 `animate-spin-slow`）；`@media (prefers-reduced-motion: reduce)` 下 `.animate-spin-slow { animation: none }`。
- 重试斜纹：工具类 `.hatch { background-image: repeating-linear-gradient(45deg, var(--hatch) 0 1px, transparent 1px 4px); }`。

## 3. 动效纪律

这是工具类界面：**不做入场动画、不做数字滚动、不做闪烁高亮、不做骨架的闪光扫过、不做图表的加载动画**（Recharts 的 `isAnimationActive={false}`）。只允许：

- 悬停和按下的底色变化：`transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]`。
- 折叠展开箭头旋转 90°；侧栏收起展开的宽度过渡（shadcn Sidebar 自带，时长改成 `var(--dur-base)`）。
- 弹出层、确认框用 shadcn 自带的淡入（`tw-animate-css`），不另加。
- 工作中图标 `LoaderCircle` 用 `animate-spin-slow`；减少动态效果时换成直径 8px 的实心圆点（`bg-st-running`）。

## 4. 文件结构与共享组件

### 4.1 目录与路由

```text
apps/web/
├─ index.html                 地基路：保留 <div id="root">；不写任何 meta 令牌（服务端注入）
├─ components.json            地基路：shadcn/ui 配置（style new-york、baseColor neutral、cssVariables true、别名 @/components、@/lib/utils）
├─ vite.config.ts             地基路：加 @tailwindcss/vite；别名 @ → src，@fleet/core → ../../packages/core/src/index.ts
└─ src/
   ├─ main.tsx                地基路：QueryClientProvider + RouterProvider + Toaster
   ├─ app/
   │  ├─ router.tsx           地基路：路由表（见下）
   │  ├─ AppShell.tsx         地基路：侧栏 + 顶栏 + 提示条 + <Outlet />（页面层 design/骨架.md）
   │  ├─ AppSidebar.tsx       地基路
   │  ├─ PageHeader.tsx       地基路
   │  └─ ConnectionGate.tsx   地基路：连不上服务的整页提示
   ├─ styles/
   │  ├─ tokens.css           主控独占
   │  └─ globals.css          地基路
   ├─ components/
   │  ├─ ui/                  地基路：shadcn/ui 源码（button card badge input select switch toggle-group toggle alert-dialog popover calendar table tooltip skeleton separator chart sidebar sheet collapsible sonner）
   │  └─ *.tsx                地基路：业务共享组件（4.3）
   ├─ api/
   │  ├─ dataSource.ts        地基路：接口（4.4）
   │  ├─ liveSource.ts        地基路：真实数据源
   │  ├─ pickSource.ts        地基路
   │  ├─ queries.ts           地基路：TanStack Query 的钩子（4.4）
   │  └─ demo/                演示数据路（4.5）
   ├─ state/                  地基路：snapshotStore、workerStore、nowStore、overviewStore、taskFilterStore、sidebarStore
   ├─ lib/                    地基路：纯函数（4.6）+ 单测；utils.ts（shadcn 的 cn）
   ├─ features/
   │  ├─ overview/            总览路
   │  ├─ slots/               槽位路
   │  ├─ tasks/               任务表格路
   │  └─ worker/              任务详情路（第一版的详情和时间线迁移过来）
   └─ pages/
      ├─ OverviewPage.tsx     地基路建占位，总览路覆盖
      ├─ SlotsPage.tsx        地基路建占位，槽位路覆盖
      └─ TasksPage.tsx        地基路建占位，任务表格路覆盖
```

第一版的 `src/App.tsx`、`App.module.css`、`components/*.module.css`、`features/capacity/`、`features/projects/`、`state/selectionStore.ts`、`state/selectors.ts` 由地基路**删除**；第一版的 `features/worker/` 由任务详情路改写（先原样保留，地基路不动它，但要保证它不再被 import 时构建能过——即暂时从路由里不引用）。CSS Modules 最终全部退役（任务详情路负责 worker 目录下的那些）。

路由表（`router.tsx`，`createHashRouter`）：

| 路径 | 元素 | 顶栏标题 |
|---|---|---|
| `/` | 重定向到 `/overview` | — |
| `/overview` | `OverviewPage` | 总览 |
| `/slots` | `SlotsPage` | 槽位 |
| `/tasks` | `TasksPage` | 任务 |
| `/tasks/:id` | `TasksPage`（同一个组件，读 `id` 打开详情） | 任务 |
| `/w/:id` | 重定向到 `/tasks/:id` | — |
| `*` | 重定向到 `/overview` | — |

全部挂在 `AppShell` 下（`AppShell` 渲染 `<Outlet />`）。页面组件自己渲染 `PageHeader`（因为右侧内容每页不同），这是页面组件唯一接收外部信息的地方：`PageHeader` 接收 `title` 和 `right`。

### 4.2 区块清单

| 页 | # | 区块 | 组件 | 文件 | 标记 | 哪一路 |
|---|---|---|---|---|---|---|
| 骨架 | S1 | 左侧菜单 | `AppSidebar` | `app/AppSidebar.tsx` | `data-nav` | 地基 |
| 骨架 | S2 | 顶栏 | `PageHeader` | `app/PageHeader.tsx` | `data-page-header` | 地基 |
| 骨架 | S3 | 提示条（断线、配置出错） | `ShellBanners` | `app/AppShell.tsx` 内 | `data-banner` | 地基 |
| 骨架 | S4 | 连不上服务 | `ConnectionGate` | `app/ConnectionGate.tsx` | `data-connection-gate` | 地基 |
| 总览 | O1 | 实时卡片行 | `LiveCards` | `features/overview/LiveCards.tsx` | `data-live-cards` | 总览 |
| 总览 | O2 | 时间筛选条 | `RangeBar` | `features/overview/RangeBar.tsx` | `data-range-bar` | 总览 |
| 总览 | O3 | 统计卡片行 | `StatCards` | `features/overview/StatCards.tsx` | `data-stat-cards` | 总览 |
| 总览 | O4 | token 分布 | `TokenShareCard` | `features/overview/TokenShareCard.tsx` | `data-token-share` | 总览 |
| 总览 | O5 | 任务次数分布 | `TasksByProjectCard` | `features/overview/TasksByProjectCard.tsx` | `data-tasks-by-project` | 总览 |
| 总览 | O6 | token 趋势 | `TokenTrendCard` | `features/overview/TokenTrendCard.tsx` | `data-token-trend` | 总览 |
| 槽位 | L1 | 顶栏右侧公共排队 | `SharedQueuePill` | `features/slots/SharedQueuePill.tsx` | `data-shared-queue` | 槽位 |
| 槽位 | L2 | 全部停用提醒 | `AllDisabledNotice` | `features/slots/AllDisabledNotice.tsx` | `data-all-disabled` | 槽位 |
| 槽位 | L3 | 槽位表格 | `SlotsTable` | `features/slots/SlotsTable.tsx` | `data-slots-table` | 槽位 |
| 槽位 | L4 | 占用格子与提示卡 | `SlotMeter` | `features/slots/SlotMeter.tsx` | `data-slot-meter` | 槽位 |
| 槽位 | L5 | 停用确认框 | `DisablePoolDialog` | `features/slots/DisablePoolDialog.tsx` | `data-disable-dialog` | 槽位 |
| 任务 | T1 | 筛选条 | `TaskFilterBar` | `features/tasks/TaskFilterBar.tsx` | `data-task-filters` | 任务表格 |
| 任务 | T2 | 已选条件 | `ActiveFilterChips` | `features/tasks/ActiveFilterChips.tsx` | `data-active-filters` | 任务表格 |
| 任务 | T3 | 任务表格 | `TaskTable` | `features/tasks/TaskTable.tsx` | `data-task-table` | 任务表格 |
| 任务 | T4 | 详情面板 | `WorkerDetail` | `features/worker/WorkerDetail.tsx` | `data-detail` | 任务详情 |
| 任务 | T5 | 过程时间线 | `Timeline` | `features/worker/timeline/Timeline.tsx` | `data-timeline` | 任务详情 |

**最重要的区块**：总览的 O1 实时卡片和 O4 token 分布；槽位的 L3 表格；任务的 T3 表格和 T5 时间线。

区块组件只用具名导出，不接收业务参数，数据一律从 `state/` 或 `api/queries.ts` 读；例外（`PageHeader`、`WorkerDetail` 接收 `id`、`onClose`）写在页面层。

### 4.3 共享组件签名（地基路照写；各路只准 import，不准改）

第一版同名组件的行为照搬，样式从 CSS Modules 改成 Tailwind 类名：

| 文件 | 导出 | 签名与样式 |
|---|---|---|
| `components/StatusBadge.tsx` | `StatusBadge` | `{ status: RunStatus; retry?: RetryInfo \| null; queuePosition?: number \| null; shared?: boolean; size?: "sm" \| "md" }`。`<span data-status={status} className="inline-flex items-center gap-1 whitespace-nowrap">`：图标 + 状态词，颜色取 `lib/status.ts`。工作中且 `retry` 非空 → 图标 `RotateCw`、`text-st-warning`、文字「重试 {attempt}/{max}」；排队中有位置 → 「排队第 {n} 位」，`shared` 为 true 时 → 「公共排队第 {n} 位」。`sm`：图标 12px、`text-12`；`md`：图标 14px、`text-13`。工作中图标 `animate-spin-slow`。 |
| `components/VerdictTag.tsx` | `VerdictTag` | `{ verdict: Verdict }`。`pass` →「通过」`text-st-done border-st-done`；`fail` →「不通过」`text-st-failed border-st-failed`。`inline-flex h-[18px] items-center rounded-sm border px-1.5 text-11 font-semibold`（`px-1.5` = 6px）。 |
| `components/ColorDot.tsx` | `ColorDot` | `{ colorVar: string; size?: 6 \| 8 \| 10 }`，默认 8。`<span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width, height, background: colorVar }} />`。`colorVar` 由 `lib/colors.ts` 生成（形如 `var(--proj-3)`）。 |
| `components/RoleChip.tsx` | `RoleChip` | `{ label: string }`。`inline-flex h-[18px] items-center whitespace-nowrap rounded-sm border border-line-strong px-1.5 text-11 text-fg-2`。 |
| `components/Duration.tsx` | `Duration` | `{ ms?: number \| null; from?: string \| null; to?: string \| null }`。给了 `ms` 就直接格式化；否则按 `from`～`to`（`to` 为空时按 `useNow()` 实时走）。`font-mono tabular-nums`。都没有显示「—」。 |
| `components/MonoPath.tsx` | `MonoPath` | `{ path: string; max?: number }`，默认 48。`font-mono`，超长 `middleEllipsis`，`title` 放全文。 |
| `components/CopyButton.tsx` | `CopyButton` | `{ text: string; label: string; showText?: boolean }`。shadcn `Button` 的 `variant="ghost" size="sm"`，高 24px；图标 `Copy` 14px `text-fg-3`，`showText` 时图标后跟 `text` 本身（`font-mono text-12`）；点击写剪贴板后 1.5 秒内图标换成 `Check`（`text-st-done`）。`aria-label={label}`。 |
| `components/EmptyState.tsx` | `EmptyState` | `{ message: string; command?: string; action?: { label: string; onClick(): void }; icon?: LucideIcon }`。`data-empty`，`flex flex-col items-center justify-center gap-2 py-12 text-center`；`icon` 20px `text-fg-3`；`message` `text-13 text-fg-2`；`command` `rounded-sm bg-raised px-1.5 py-0.5 font-mono text-12 text-fg-1`；`action` 是 shadcn `Button variant="link"`（`text-brand`）。 |
| `components/UsageBreakdown.tsx` | `UsageBreakdown` | `{ usage: Usage }`。`<span data-usage-breakdown>`「输入 {in} · 输出 {out} · 缓存 {cacheRead}」，数字 `formatTokens`、`font-mono tabular-nums`；每一项内部不换行（`whitespace-nowrap`），项之间可换行；标签和数字之间是真正的空格；字号颜色继承父元素。 |
| `components/SectionCard.tsx` | `SectionCard` | `{ title?: string; right?: ReactNode; children: ReactNode; className?: string; "data-section"?: string }`。基于 shadcn `Card`：`rounded-lg border border-line bg-panel p-5`（无阴影）；有 `title` 或 `right` 时顶部一行 `flex items-center justify-between gap-3 mb-4`，标题 `text-14 font-semibold`。 |
| `components/StatCard.tsx` | `StatCard` | `{ label: string; value: string; valueClassName?: string; lines?: ReactNode[]; onClick?: () => void; ariaLabel?: string; loading?: boolean; "data-stat"?: string }`（`valueClassName` 只用来换数字颜色，缺省 `text-fg-1`）。`rounded-lg border border-line bg-panel p-5`；有 `onClick` 时渲染成 `<button>`（整卡可点：`text-left transition-colors hover:border-line-strong active:bg-hover cursor-pointer`）。内容：`label`（`text-12 text-fg-3`）→ `value`（`mt-1 text-28 font-semibold font-mono text-fg-1`，单行省略）→ 每条 `lines`（`mt-1 text-12 text-fg-2`）。`loading` 时 `value` 换成 `Skeleton` 80×28、`lines` 换成 120×12。 |
| `components/SegmentedControl.tsx` | `SegmentedControl` | `<T extends string>{ options: { value: T; label: string; disabled?: boolean }[]; value: T; onChange(v: T): void; ariaLabel: string; name: string; size?: "sm" \| "md" }`。基于 shadcn `ToggleGroup type="single"`（不允许取消选中：`onValueChange` 收到空值时忽略）。外框 `inline-flex rounded-md border border-line p-0.5`；每项 `h-7 px-3 text-12 text-fg-2 rounded-sm hover:bg-hover`（`sm` 时 `h-6 px-2`）；选中 `bg-brand-soft text-brand`；禁用 `text-fg-3 pointer-events-none`。每项带 `data-seg={name}:{value}` 和 `data-state`（Radix 自带 on/off）。 |
| `components/RangePicker.tsx` | `RangePicker` | `{ value: RangeState; onChange(v: RangeState): void; variant: "segmented" \| "select"; name: string }`，`RangeState = { kind: RangeKind; from?: string; to?: string }`。`segmented`：`SegmentedControl` 五项「今日 / 近 7 天 / 近 30 天 / 全部 / 自选」；`select`：shadcn `Select`，同五项，触发器宽 132px。选「自选」时弹出 shadcn `Popover` + `Calendar mode="range"`（`numberOfMonths={2}`，1024 以下 1 个月），选完起止两天才调用 `onChange({ kind: "custom", from, to })`（本地日期 `YYYY-MM-DD`）；取消（点弹层外）不改值。当前是自选时，「自选」那一项的文字换成「09-01 ~ 09-25」（跨年时带年份「2025-12-28 ~ 2026-01-03」）。日期格式化用 `lib/format.ts` 的 `formatLocalDate`。弹层根元素 `data-range-calendar`。 |
| `components/DimensionTabs.tsx` | `DimensionTabs` | `{ value: StatsDimension; onChange(v): void }`。`SegmentedControl size="sm" name="dimension"`，四项「模型 / 渠道 / 项目 / 角色」。 |
| `components/Banner.tsx` | `Banner` | `{ kind: "offline" \| "config" \| "warning"; children: ReactNode }`。`data-banner={kind}`，`flex h-8 items-center gap-2 border-b border-line bg-st-warning-soft px-4 text-12 text-fg-1`；图标 14px `text-st-warning`：offline `WifiOff`、config 和 warning `TriangleAlert`；文字单行省略。 |
| `components/SeriesLegend.tsx` | `SeriesLegend` | `{ items: { key: string; label: string; colorVar: string; hidden?: boolean }[]; onToggle?(key: string): void }`。`flex flex-wrap gap-x-4 gap-y-1 text-12`；每项是 `<button data-legend={key} aria-pressed={!hidden}>`：`ColorDot` + 文字（`text-fg-2`；`hidden` 时 `text-fg-3 line-through`）。没有 `onToggle` 时渲染成 `<span>`。 |
| `components/ErrorState.tsx` | `ErrorState` | `{ message: string; onRetry?: () => void }`。同 `EmptyState` 的布局，图标 `TriangleAlert` `text-st-warning`，文字「加载失败：{message}」，按钮「重试」。`data-error`。 |

### 4.4 数据层契约（地基路照写）

```ts
// api/dataSource.ts
import type { PoolView, ProjectInfo, Snapshot, StatsQuery, StatsResponse, TaskPage, TasksQuery,
  TimelineEvent, WorkerDetail } from "@fleet/core";
export type ConnectionState = "connecting" | "open" | "lost";
export interface WorkerHandlers {
  onDetail(detail: WorkerDetail): void;
  onEvents(events: TimelineEvent[]): void;
  onNotFound(): void;
  onError(message: string): void;
}
export interface DataSource {
  subscribeSnapshot(onSnapshot: (s: Snapshot) => void, onConnection: (c: ConnectionState) => void): () => void;
  subscribeWorker(id: string, after: number, handlers: WorkerHandlers): () => void;
  /** 演示数据源返回固定「当前时刻」（毫秒），真实数据源返回 null */
  fixedNow(): number | null;
  getStats(query: StatsQuery): Promise<StatsResponse>;
  getTasks(query: TasksQuery): Promise<TaskPage>;
  getProjects(): Promise<ProjectInfo[]>;
  setPoolEnabled(poolId: string, enabled: boolean): Promise<PoolView>;
  reorderPools(poolIds: readonly string[]): Promise<PoolView[]>;
}
```

- `liveSource.ts`：`createLiveDataSource(): DataSource`。两路 SSE 和第一版一样（1、2、4、8、10 秒退避重连）。四个普通请求用 `fetch`：GET 的查询参数按 `StatsQuery` / `TasksQuery` 的字段逐个拼（值为 `undefined` 的不拼）；非 2xx 时读响应体的 `error.message` 抛 `Error(message)`（读不到就「请求失败（状态码 N）」）。两个 PUT 请求带请求头 `x-fleet-token`，值从 `document.querySelector('meta[name="fleet-dashboard-token"]')?.getAttribute("content")` 取（取不到就不带，服务会回 401，照常抛错）。
- `pickSource.ts`：`pickDataSource(search)`：`?demo=busy|empty|failure|offline|disabled` 返回演示源，其他返回真实源。
- `queries.ts`（TanStack Query 钩子；`QueryClient` 默认 `retry: 1`、`refetchOnWindowFocus: false`、`staleTime: 5000`）：
  - `useDataSource(): DataSource`（从 React context 取，`main.tsx` 注入 `pickDataSource(location.search)` 的结果）。
  - `useStats(query: StatsQuery)`：键 `["stats", query]`，`placeholderData: keepPreviousData`（切换档位时不闪空）。
  - `useTasks(query: Omit<TasksQuery, "cursor">)`：`useInfiniteQuery`，键 `["tasks", query]`，`initialPageParam: undefined`，`getNextPageParam: (page) => page.nextCursor ?? undefined`。
  - `useProjects()`：键 `["projects"]`，`staleTime: 60_000`。
  - `useSetPoolEnabled()`、`useReorderPools()`：`useMutation`；失败时 `toast.error(error.message)`（sonner）。
  - `useLiveInvalidation()`：在 `AppShell` 里调用一次。订阅 `snapshotStore`，用 `lib/activity.ts` 的 `activitySignature(snapshot)` 判断「有任务开始或结束」；签名变了就节流地 `invalidateQueries`：`["stats"]` 最快 5 秒一次，`["tasks"]` 最快 2 秒一次，`["projects"]` 最快 30 秒一次（尾随节流：窗口内最后一次一定会执行）。
- `state/snapshotStore.ts`：`{ snapshot: Snapshot | null; connection: ConnectionState; everOpened: boolean }`，动作 `setSnapshot`、`setConnection`（第一次变成 `open` 时 `everOpened = true`）。`AppShell` 挂载时订阅数据源。
- `state/workerStore.ts`：照搬第一版（`open(id)`、`close()`、`setFilter`、按 seq 去重追加）。
- `state/nowStore.ts`：照搬第一版（`useNow()`，演示源固定时刻）。
- `state/overviewStore.ts`：`{ range: RangeState; dimension: StatsDimension }`，默认 `{ range: { kind: "all" }, dimension: "model" }`；动作 `setRange`、`setDimension`。只在内存里，刷新后回到默认。
- `state/taskFilterStore.ts`：`{ status: TaskStatusFilter; project?: string; pool?: string; role?: string; channel?: string; model?: string; range: RangeState; q: string; sort: TaskSortKey; order: "asc" | "desc" }`（channel、model 只能从总览点进来带上，筛选条上没有它们的下拉），默认 `{ status: "active", range: { kind: "all" }, q: "", sort: "createdAt", order: "desc" }`；动作 `set(partial)`、`reset()`、`applyFromOverview(partial)`（先 `reset()` 再套上 partial——从总览跳来时只保留带过来的条件）。只在内存里。
- `state/sidebarStore.ts`：`{ collapsed: boolean }`，存 `localStorage` 键 `fleet.sidebar`（`"collapsed"` / `"expanded"`）；窗口 < 1024px 时不管存的是什么都按收起显示（不写回存储）。

### 4.5 演示数据（演示数据路写，主控核对）

规格见 `design/演示数据.md`。对外只暴露：

| 文件 | 导出 | 用途 |
|---|---|---|
| `api/demo/scenarios.ts` | `DEMO_SCENARIOS`、`DemoScenarioName`、`buildDemoScenario(name)`、`DEMO_NOW_MS` | 五个场景的快照、详情、时间线、历史事实 |
| `api/demo/demoSource.ts` | `createDemoDataSource(name)` | 把场景包装成 `DataSource`（统计用核心层 `computeStats` 现算，任务列表用 `lib` 里的内存查询，改设置改内存状态并重推快照） |

### 4.6 纯函数（地基路写，带单测）

```ts
// lib/format.ts —— 第一版的 formatDuration、formatClock、formatTokens、formatCost、middleEllipsis、elapsedMs 照搬，另加：
formatLocalDate(date: string): string          // "2026-09-01" → "09-01"
formatRangeLabel(r: RangeState, nowMs: number): string // 自选时「09-01 ~ 09-25」，跨年带年份；其余返回档位名
formatCompact(n: number): string               // 同 formatTokens，给任务次数等非 token 的大数用：<1000 原样，否则 "1.2K"
formatPercent(part: number, total: number): string | null // total 为 0 返回 null；否则整数百分比 "96%"
formatBucketLabel(iso: string, g: StatsGranularity): string // 坐标轴刻度，本地时间：hour「14:00」、day「09-25」、week「09-22」
formatBucketTitle(iso: string, g: StatsGranularity): string // 悬停标题：hour「09-25 14:00」、day「09-25」、week「09-22 起一周」
formatLocalDateOfIso(iso: string): string       // ISO → 本地日期「2026-09-25」
// lib/status.ts —— 照搬第一版 STATUS_META，color 改成类名："text-st-running" 等
// lib/colors.ts
projectColorVar(colorIndex: number): string    // "var(--proj-N)"，N = ((i % 8) + 8) % 8
seriesColorVar(colorIndex: number | null): string // null → "var(--series-other)"；否则 "var(--series-N)"
// lib/tools.ts、lib/timelineView.ts —— 照搬第一版
// lib/activity.ts
activitySignature(s: Snapshot): string         // 进行中苦工的「编号:状态:运行序号」按编号排序后拼接，再拼上 live 的五个数
// lib/liveMerge.ts
mergeLiveSummaries(items: WorkerSummary[], live: readonly WorkerSummary[]): WorkerSummary[] // 同编号的用快照里那份（更新鲜），顺序不变
// lib/taskFilters.ts
activeFilterChips(f: TaskFilterState, lookups): { key: string; label: string }[] // 已选条件小标签的文字，见 design/任务.md T2
toTasksQuery(f: TaskFilterState): Omit<TasksQuery, "cursor"> // limit 固定 50；range 拆成 range/from/to；q 为空串时不带
// lib/slotMeter.ts —— 第一版 features/capacity 里容量格的排布纯函数（离散格 / 连续分段）搬到这里，槽位路用
```

## 5. 各页规格

- [design/骨架.md](design/骨架.md) —— S1～S4
- [design/总览.md](design/总览.md) —— O1～O6
- [design/槽位.md](design/槽位.md) —— L1～L5
- [design/任务.md](design/任务.md) —— T1～T5（T4、T5 的行为照 `design/工作区.md` R6～R8）
- [design/演示数据.md](design/演示数据.md) —— 演示数据的场景和数字

## 6. 文案原则

- 全部中文，遵守界面文案守则：删掉不影响理解的字就不写；不写说明腔、开发备注、「运行正常」一类无意义状态；只放标题不配副标题。
- 状态词只用：排队中、工作中、已完成、失败、已取消；附加标记：重试 N/M、排队第 N 位、公共排队第 N 位、自评不通过。失败原因的中文取 `@fleet/core` 的 `FAIL_REASON_LABELS`。
- 数字一律具体：`23 / 40`、`排队 4`、`3分12秒`、`682.2M`。为 0 的计数项不显示（除非规格明确要显示 0）。
- 菜单：总览、槽位、任务。时间档位：今日、近 7 天、近 30 天、全部、自选。维度：模型、渠道、项目、角色。合并项：其他。
- 本文件和页面层写死的文案逐字照抄，不许改写、不许加标点。

## 7. 质量门禁

```bash
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
pnpm exec vitest run apps/web
pnpm exec biome check apps/web
node scripts/check-tokens.mjs
pnpm --filter @fleet/web build      # 构建由主控统一跑
```

自查：

- 不准 `any`、不准 `as` 强转（shadcn 源码里原有的 `as` 允许保留）、不准 `@ts-ignore`、不准未使用的 import。
- 颜色、字号、间距、圆角只用第 2 章的类名；方括号里只准写 `var(--…)` 或第 2 章写明的像素值（如 `h-[18px]`）。
- 不在组件里 `new Date()` / `Date.now()`：当前时刻一律 `useNow()`。
- 所有可交互元素键盘可达、焦点可见；图标 `aria-hidden`，含义由文字或 `aria-label` 承担。
- 长文本都有省略或折叠；页面整体不出现横向滚动；网格子项里有横向滚动区的加 `min-w-0`。
- 输入框、下拉都是受控组件。

## 8. 文件写入边界与分路表

- **主控独占**：`src/styles/tokens.css`、本文件、`design/*.md`。
- **公共文件（只有地基路能写；其余各路一律不准碰）**：`index.html`、`components.json`、`vite.config.ts`、`package.json`（依赖）、`src/main.tsx`、`src/app/**`、`src/styles/globals.css`、`src/components/**`、`src/api/dataSource.ts`、`src/api/liveSource.ts`、`src/api/pickSource.ts`、`src/api/queries.ts`、`src/state/**`、`src/lib/**`、`scripts/check-tokens.mjs`、`pages/*.tsx` 的占位。
- 每路只写分给自己的文件；要拆子组件，只能放在自己的目录、以自己的区块组件名开头（如 `SlotsTable.Row.tsx` 不行，写成 `SlotsTableRow.tsx`）。
- 只能 import：`react`、`react-router`、`@tanstack/react-query`、`zustand`、`recharts`（只在 overview 路）、`lucide-react`（白名单）、`@fleet/core`、`@/components/**`、`@/api/queries`、`@/state/**`、`@/lib/**`。**不 import 其他路的文件**，唯一例外：`pages/TasksPage.tsx` 从 `@/features/worker/WorkerDetail` import `WorkerDetail`。

| 路 | 负责的文件 | 依赖 |
|---|---|---|
| 地基 | 上面列的全部公共文件；三个 `pages/*.tsx` 占位（只渲染 `PageHeader` 和一个带页面标记的空 `<div>`）；删除第一版的公共文件 | 本文件、`design/骨架.md` |
| 演示数据 | `src/api/demo/**` | 本文件、`design/演示数据.md`；等地基路的 `dataSource.ts` |
| 总览 | `src/features/overview/**`、`src/pages/OverviewPage.tsx` | 地基 |
| 槽位 | `src/features/slots/**`、`src/pages/SlotsPage.tsx` | 地基 |
| 任务表格 | `src/features/tasks/**`、`src/pages/TasksPage.tsx` | 地基 |
| 任务详情 | `src/features/worker/**`（第一版目录，改写成 Tailwind，去掉 CSS Modules） | 地基 |

占位的导出名（各路必须保持）：`pages/OverviewPage.tsx` → `OverviewPage`；`pages/SlotsPage.tsx` → `SlotsPage`；`pages/TasksPage.tsx` → `TasksPage`；`features/worker/WorkerDetail.tsx` → `WorkerDetail`（`{ id: string; onClose(): void }`）。

## 9. 哪些是编的

| 项 | 状态 |
|---|---|
| 四个池的编号、渠道、模型、容量（dsf 20、glmf 7、qwen27 5、luna 8） | **真实**，来自本机 `~/.fleet-studio/config.json`（2026-09-25） |
| 演示项目名（fleet-studio、wiki-forge、cloudmind、inferforge、onaho-wiki、ui-studio） | **编的**，借用本机真实项目名 |
| 30 天历史任务、用量、耗时 | **编的**，固定种子生成；数量级参照本机真实库（两天 85 个任务、单任务几十万到上百万 token） |
| 苦工标题、任务书、时间线、回报 | **编的**，按真实回报格式（SUMMARY / FILES / VERIFY / SELF_REPORT / BLOCKED）编写，沿用第一版演示数据 |

## 附录 数据

演示数据由演示数据路按 `design/演示数据.md` 写成代码并配单测；交互检查要核对的数字从它的单测里取。
