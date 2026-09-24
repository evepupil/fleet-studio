# fleet studio 看板 —— 站点层规格（唯一事实来源）

> 所有实现会话动手前先读完本文件，再读 `design/工作区.md` 里属于自己的那几节。本文件和 `design/工作区.md` 是契约，**实现会话不得修改**。
> 视觉令牌与状态画法的依据是 `docs/前端设计.md`；本文件把它落成可以照抄的工程规格。
> 规格故意写满：该有的都先摆上，删减是主控验收时的事。实现会话只负责按规格做出来，规格没写的按同一套令牌补齐，不要自己发挥。

---

## 0. 定位与参照

一个只在本机打开的开发者看板，给同时推进多个项目、每个项目派出一群便宜模型苦工的人用。只有一个页面：工作区。

用户来这里干这几件事：

1. 扫一眼每个模型池的容量条：被哪几个项目占了多少格、还有几个在排队、通道最近有没有在失败。
2. 把鼠标移到某一格上（或用键盘聚焦），看那个苦工是谁、属于哪个项目目录、跑了多久；点它直接打开详情。
3. 在左栏按项目找苦工，看每个苦工的状态、角色和正在干什么。
4. 打开一个苦工，看它收到的任务、实时时间线（读了什么、跑了什么命令、改了什么、说了什么、报了什么错）和最后交回的回报。
5. 失败时一眼看到失败原因。

目标观感：**Linear 侧栏的克制密度 + Nomad 容量条的「条和大数字分开摆」+ Temporal 事件行的内联信息**。参照和各自抄什么：

| 参照 | 抄什么 |
|---|---|
| Linear（linear.app，2024 改版的侧栏） | 整行圆角选中块；分组标题比内容暗一档；层级靠明暗而不靠字号；四到五级灰阶撑起全部层次 |
| HashiCorp Nomad Web UI（资源占用卡） | 容量条和大号数字分开摆；数字下面一行小字给补充数值；条本身只表达占用 |
| Temporal Web UI（Event History） | 重试用斜纹而不是加深颜色；事件行「图标 + 类型 + 内联摘要」；重试计数写成「3/8」 |
| Grafana（告警列表） | 状态 = 图标 + 彩色状态词；次要行给持续时长 |
| Vercel 旧版部署页 | 元信息「上面小灰字标签、下面数值」的两行网格 |

不抄：Buildkite 式的大卡片流和宽松留白；任何投影卡片；彩色的大图标；表情符号；渐变；页面标题和欢迎语；Temporal 的瀑布图（这一版不做）。

### 0.1 页面清单

| 页面 | 路由 | 用户来干什么 | 首屏核心动作 | 参照页 | 区块下限 | 分路 |
|---|---|---|---|---|---|---|
| 工作区 | `/`（选中苦工时地址栏 `#/w/<编号>`） | 见上 | 容量条（能悬浮、能点）和左栏苦工列表同时在首屏 | Linear 侧栏 + Nomad 资源卡 + Temporal 事件历史 | 8 个区域：顶栏、提示条、容量条、左栏工具条、项目与苦工列表、详情头与元信息、任务与回报、时间线 | 地基 + L1～L4 |

## 1. 技术栈（已锁定）

| 项 | 值 |
|---|---|
| 框架 | React 19 + Vite（已装），单页应用，无服务端渲染 |
| 语言 | TypeScript，仓库根 `tsconfig.base.json` 的最严格设置；前端 `apps/web/tsconfig.json` |
| 样式 | CSS 变量（`src/styles/tokens.css`，主控已写好）+ CSS Modules（`*.module.css`，与组件同目录）+ 全局 `src/styles/base.css` |
| 状态 | zustand（已装） |
| 交互原件 | `@radix-ui/react-tooltip`（提示卡）、`@radix-ui/react-collapsible`（折叠）。已装的 `@radix-ui/react-scroll-area` **不用** |
| 图标 | `lucide-react` 1.47.0，只用下方白名单 |
| 图表 | 不用图表库；容量条是普通 DOM 元素 |
| 单测 | Vitest，只测 `src/lib/` 和 `src/api/` 下的纯函数与演示数据 |
| 包管理 | pnpm（仓库根执行） |

**不引入任何新依赖**：没有路由库、日期库、图表库、动画库、UI 框架、Tailwind、CSS-in-JS、虚拟列表库。

可用图标白名单（已在本机 1.47.0 逐个确认存在，只用这些）：`Clock`、`LoaderCircle`、`CircleCheck`、`CircleX`、`CircleSlash`、`CircleDot`、`RotateCw`、`TriangleAlert`、`ChevronRight`、`ChevronDown`、`FileText`、`SquareTerminal`、`Terminal`、`Pencil`、`FilePlus`、`Search`、`Globe`、`Wrench`、`MessageSquare`、`Brain`、`WifiOff`、`ArrowDown`、`ArrowLeft`、`Copy`、`Check`、`Info`。需要别的形状用内联 SVG 手写。

## 2. 设计令牌

- 全部令牌已由主控写在 `src/styles/tokens.css`，数值来源是 `docs/前端设计.md` 第 3 节。**这个文件谁都不准改。**
- 组件样式里只能用 `var(--…)`，不得出现任何十六进制、`rgb()`、`hsl()` 色值（门禁 `scripts/check-tokens.mjs` 会拦截）。
- 字号一律用成对的 `font-size: var(--fs-13); line-height: var(--lh-13);`。间距、圆角、时长只用令牌。
- 项目色通过 `colorIndex` 取：`var(--proj-<colorIndex 对 8 取模>)`，统一调用 `src/lib/projectColor.ts`，不要在组件里拼字符串。
- 数字、时间、时长、编号、路径、命令、工具名用 `var(--font-mono)`；需要纵向对齐的列加 `font-variant-numeric: tabular-nums`。

## 3. 动效纪律

这是工具类界面：**不做入场动画、不做数字滚动、不做闪烁高亮、不做骨架屏的闪光扫过。** 只允许：

- 悬停和按下的底色变化：`transition: background-color var(--dur-fast) var(--ease)`。
- 折叠展开：箭头旋转 90°，`transform var(--dur-base) var(--ease)`；内容区不做高度动画，直接出现。
- 工作中图标 `LoaderCircle` 每 1.2 秒匀速转一圈（`animation: spin 1.2s linear infinite`）。
- `@media (prefers-reduced-motion: reduce)`：关闭旋转，工作中图标换成直径 8px 的实心圆点（颜色 `--st-running`）。

## 4. 文件结构与共享组件

### 4.1 目录

```text
apps/web/src/
├─ main.tsx                 入口（已存在，地基路改写）
├─ App.tsx                  页面骨架
├─ App.module.css
├─ styles/
│  ├─ tokens.css            主控已写好，不准改
│  └─ base.css              地基路写
├─ api/
│  ├─ dataSource.ts         DataSource 接口与类型
│  ├─ liveSource.ts         真实数据源（fetch + EventSource）
│  ├─ pickSource.ts         按地址参数选数据源
│  └─ demo/
│     ├─ records.ts         主控写：演示用的项目、苦工、运行记录
│     ├─ timelines.ts       主控写：演示用的时间线草稿
│     ├─ scenarios.ts       主控写：四个演示场景的组装
│     ├─ demoSource.ts      地基路写：把场景包装成 DataSource
│     └─ scenarios.test.ts  主控写：演示数据一致性单测
├─ state/
│  ├─ snapshotStore.ts      快照与连接状态
│  ├─ selectionStore.ts     选中苦工、展开的项目、左栏筛选
│  ├─ workerStore.ts        选中苦工的详情、时间线、时间线筛选
│  ├─ nowStore.ts           全页唯一的 1 秒时钟
│  └─ selectors.ts          派生数据（按项目分组、排序、计数）
├─ lib/
│  ├─ format.ts             时长、时间、token、费用、路径省略
│  ├─ status.ts             状态 → 中文词、图标、颜色变量
│  ├─ projectColor.ts       colorIndex → CSS 变量
│  ├─ tools.ts              工具名 → 图标
│  ├─ timelineView.ts       时间线事件 → 显示行
│  └─ *.test.ts             上述纯函数的单测
├─ components/              共享组件（地基路写），见 4.3
└─ features/
   ├─ capacity/             L1：容量条
   ├─ projects/             L2：左栏
   └─ worker/               L3：详情；L4：worker/timeline/ 时间线
```

### 4.2 区域清单

工作区（规格见 `design/工作区.md`）：

| # | 区域 | 组件 | 文件 | 标记 | 哪一路 |
|---|---|---|---|---|---|
| R1 | 顶栏 | `AppBar` | `components/AppBar.tsx` | `data-appbar` | 地基 |
| R2 | 提示条 | `Banner` | `components/Banner.tsx` | `data-banner` | 地基 |
| R3 | 容量条 | `CapacityStrip` | `features/capacity/CapacityStrip.tsx` | `data-capacity` | L1 |
| R4 | 左栏工具条 | `ListToolbar` | `features/projects/ListToolbar.tsx` | `data-list-toolbar` | L2 |
| R5 | 项目与苦工列表 | `ProjectList` | `features/projects/ProjectList.tsx` | `data-project-list` | L2 |
| R6 | 详情头与元信息 | `WorkerDetail` 内的 `DetailHeader`、`MetaGrid` | `features/worker/*.tsx` | `data-detail` | L3 |
| R7 | 任务与回报 | `TaskSection`、`ReportCard` | `features/worker/*.tsx` | `data-task`、`data-report` | L3 |
| R8 | 时间线 | `Timeline` | `features/worker/timeline/Timeline.tsx` | `data-timeline` | L4 |

**最重要的区域是 R3 容量条和 R8 时间线**：前者是这个产品存在的理由，后者是用户停留最久的地方，它们的规格允许写得最长。

每个区域组件**只用具名导出**，不接收业务参数，数据一律从 `state/` 读；例外写在页面层规格里。

### 4.3 共享组件签名（地基路照写，各路只准 import，不准改）

| 文件 | 导出 | 签名与样式 |
|---|---|---|
| `components/StatusBadge.tsx` | `StatusBadge` | `{ status: RunStatus; retry?: RetryInfo \| null; queuePosition?: number \| null; size?: "sm" \| "md" }`。渲染 `<span data-status={status}>`：图标 + 状态词，颜色取 `lib/status.ts`。工作中且 `retry` 非空 → 图标 `RotateCw`、颜色 `--st-warning`、文字「重试 {attempt}/{max}」；排队中且有位置 → 文字「排队第 {n} 位」。`sm`：图标 12px、字 `--fs-12`；`md`：图标 14px、字 `--fs-13`。图标与文字间距 `--sp-1`。 |
| `components/VerdictTag.tsx` | `VerdictTag` | `{ verdict: Verdict }`。`pass` → 文字「通过」、颜色 `--st-done`；`fail` → 文字「不通过」、颜色 `--st-failed`。1px 同色边框、圆角 `--r-sm`、高 18px、左右内边距 6px、字 `--fs-11` 字重 600。 |
| `components/ProjectDot.tsx` | `ProjectDot` | `{ colorIndex: number; size?: 6 \| 8 \| 10 }`，默认 8。圆点，背景 `projectColorVar(colorIndex)`，`aria-hidden`。 |
| `components/RoleChip.tsx` | `RoleChip` | `{ label: string }`。高 18px、左右内边距 6px、1px `--line-strong` 边框、圆角 `--r-sm`、字 `--fs-11`、颜色 `--text-2`、不换行。 |
| `components/Duration.tsx` | `Duration` | `{ from: string \| null; to?: string \| null }`。等宽 + `tabular-nums`。`to` 为空时按 `nowStore` 实时刷新；`from` 为空显示「—」。文字由 `formatDuration` 生成。 |
| `components/MonoPath.tsx` | `MonoPath` | `{ path: string; max?: number }`，默认 48。等宽字体，超长用 `middleEllipsis` 中间省略，`title` 放全文。 |
| `components/Tip.tsx` | `Tip`、`TipProvider` | `Tip`: `{ content: ReactNode; children: ReactElement; side?: "top" \| "bottom" \| "left" \| "right"; open?: boolean }`，基于 Radix Tooltip；卡片背景 `--bg-overlay`、阴影 `--shadow-overlay`、圆角 `--r-lg`、内边距 `--sp-3`、最大宽 320px、`z-index: var(--z-tooltip)`、无箭头。`TipProvider` 包在 App 根部，`delayDuration=150`、`skipDelayDuration=0`。 |
| `components/Disclosure.tsx` | `Disclosure` | `{ id: string; title: ReactNode; meta?: ReactNode; defaultOpen?: boolean; children: ReactNode }`，基于 Radix Collapsible。标题行高 32px：`ChevronRight` 12px（展开时旋转 90°）+ 标题 + 右侧 `meta`（`--text-3`、单行省略）；整行可点，悬停 `--bg-hover`，圆角 `--r-md`。根元素带 `data-disclosure={id}` 和 `data-open`。 |
| `components/FilterChips.tsx` | `FilterChips` | `<T extends string>{ options: { value: T; label: string; count?: number; disabled?: boolean }[]; value: T; onChange(value: T): void; ariaLabel: string; name: string }`。`role="radiogroup"`，每个选项 `role="radio"` + `aria-checked`，左右方向键切换。单个小片高 24px、左右内边距 `--sp-2`、圆角 `--r-sm`、字 `--fs-12`；未选：透明底、`--text-2`、1px `--line` 边；选中：`--accent-soft` 底、`--text-1`、边框透明；禁用：`--text-3`、无边框、不可点。`count` 用等宽字体跟在标签后，间距 `--sp-1`。每个小片带 `data-filter={value}`。 |
| `components/EmptyState.tsx` | `EmptyState` | `{ message: string; command?: string; action?: { label: string; onClick(): void } }`。区域内垂直水平居中；`message` 为 `--fs-13` `--text-2`；`command` 为下一行等宽 `--fs-12` `--text-1`，外面 `--bg-raised` 底、圆角 `--r-sm`、内边距 `2px 6px`；`action` 为文字按钮（`--accent` 色，悬停下划线）。根元素 `data-empty`。 |
| `components/Skeleton.tsx` | `Skeleton` | `{ width?: number \| string; height: number; radius?: "sm" \| "md" }`。纯色块 `--bg-hover`，无动画。 |
| `components/Banner.tsx` | `Banner` | `{ kind: "offline" \| "config"; children: ReactNode }`。高 `--banner-h`、左右内边距 `--sp-4`、背景 `--st-warning-soft`、下边 1px `--line`；图标 `WifiOff`（offline）或 `TriangleAlert`（config）14px `--st-warning`；文字 `--fs-12` `--text-1`，单行省略。根元素 `data-banner={kind}`。 |
| `components/AppBar.tsx` | `AppBar` | 无参数。见页面层 R1。 |
| `components/UsageBreakdown.tsx` | `UsageBreakdown` | `{ usage: Usage }`。渲染 `<span data-usage-breakdown>`，内容「输入 {in} · 输出 {out} · 缓存 {cacheRead}」：三个数字都用 `formatTokens`，等宽 + `tabular-nums`；「缓存」只算缓存读（`cacheReadTokens`）。「输入 {in}」这样的每一项内部不断开，项与项之间可以换行；标签和数字之间是真正的空格字符（交互检查按 `textContent` 找「输入 1.1M」这样的子串）；分隔符「 · 」。**字号和颜色继承父元素，组件自己不定**，由调用处决定。容量条第 3 列第 5 行和苦工详情「用量」的补充行共用它。 |
| `components/CopyButton.tsx` | `CopyButton` | `{ text: string; label: string }`。24px 方形幽灵按钮，图标 `Copy` 14px `--text-3`；点击写剪贴板后 1.5 秒内图标换成 `Check`（`--st-done`）。`aria-label={label}`。 |

### 4.4 数据层契约（地基路照写，各路只准读 store）

```ts
// api/dataSource.ts
export type ConnectionState = "connecting" | "open" | "lost";
export interface WorkerHandlers {
  onDetail(detail: WorkerDetail): void;
  /** 按 seq 升序的新事件 */
  onEvents(events: TimelineEvent[]): void;
  onNotFound(): void;
  onError(message: string): void;
}
export interface DataSource {
  subscribeSnapshot(onSnapshot: (s: Snapshot) => void, onConnection: (c: ConnectionState) => void): () => void;
  /** 订阅单个苦工：先给详情，再给 seq > after 的历史事件，之后持续推增量 */
  subscribeWorker(id: string, after: number, handlers: WorkerHandlers): () => void;
  /** 演示数据源返回固定的「当前时刻」（毫秒），真实数据源返回 null */
  fixedNow(): number | null;
}
```

- `liveSource.ts`：`createLiveDataSource(): DataSource`。全局流 `EventSource(API_PATHS.stream)` 监听 `snapshot` 事件；出错关闭后按 1、2、4、8、10、10…秒退避重连，期间连接状态为 `lost`，收到首个快照变为 `open`。单苦工：先 `fetch(API_PATHS.worker(id))`（404 → `onNotFound`，其他失败 → `onError`），再开 `EventSource(API_PATHS.workerStream(id) + "?after=" + after)`，监听 `worker`（→ `onDetail`）和 `timeline`（→ `onEvents`）；断线同样退避重连，重连时 `after` 取已收到的最大 `seq`。所有 JSON 用类型守卫做最基本校验（是对象、有必需字段），不合格的消息丢弃。
- `pickSource.ts`：`pickDataSource(search: string): DataSource`。`?demo=busy|empty|failure|offline` 返回演示源，其他值或没有参数返回真实源。
- `snapshotStore.ts`：`useSnapshotStore`，状态 `{ snapshot: Snapshot | null; connection: ConnectionState }`，动作 `setSnapshot`、`setConnection`。
- `selectionStore.ts`：`useSelectionStore`，状态 `{ selectedId: string | null; expanded: Record<string, boolean>; listFilter: "active" | "all" }`，动作 `select(id | null)`、`toggleProject(key)`、`setListFilter(filter)`。选中编号和地址栏 `#/w/<编号>` 双向同步（`history.replaceState`，并监听 `hashchange`）；`expanded` 存 `localStorage` 键 `fleet.expanded`（JSON）；没有记录的项目默认：有排队中或工作中苦工的展开，否则收起。
- `workerStore.ts`：`useWorkerStore`，状态 `{ id: string | null; detail: WorkerDetail | null; events: TimelineEvent[]; status: "idle" | "loading" | "ready" | "notFound" | "error"; error: string | null; filter: TimelineFilter }`，动作 `open(id)`（关闭上一个订阅，清空，`status = "loading"`）、`close()`、`setFilter(filter)`。事件按 `seq` 去重追加（`seq` 小于等于已有最大值的丢弃）。
- `nowStore.ts`：`useNow(): number`。全页唯一一个 1 秒定时器；数据源的 `fixedNow()` 不为 null 时恒返回它（演示截图需要固定时刻）。
- `selectors.ts`：`selectProjectGroups(snapshot, listFilter): ProjectGroup[]`，其中 `ProjectGroup = { project: ProjectView; workers: WorkerSummary[] }`；组的顺序同 `snapshot.projects`；组内排序：工作中（按 `startedAt` 升序）→ 排队中（按 `queuePosition` 升序）→ 其余（按 `endedAt` 倒序）；`listFilter === "active"` 时只留排队中和工作中的苦工，并去掉因此变空的组。另导出 `selectWorker(snapshot, id)`、`countActive(snapshot)`、`countAll(snapshot)`、`selectProjectByKey(snapshot, key)`。

### 4.5 纯函数（地基路写，带单测）

```ts
// lib/format.ts
formatDuration(ms: number): string        // <60 秒「45秒」；<1 时「3分12秒」；否则「1时05分」；负数按 0
formatClock(iso: string, nowMs: number): string // 与 now 同一天「12:03:04」；否则「09-22 12:03」（本地时区）
formatTokens(n: number): string           // <1000 原样；<1e6「4.2K」；否则「1.3M」（一位小数，去掉 .0）
formatCost(usd: number | null): string | null // null 或 0 返回 null；<0.01「<$0.01」；否则「$0.84」
middleEllipsis(text: string, max: number): string // 超长时保留开头和结尾，中间「…」
elapsedMs(from: string | null, to: string | null, nowMs: number): number | null
// lib/status.ts
STATUS_META: Record<RunStatus, { label: string; icon: LucideIcon; color: string }> // color 是 "var(--st-…)"
// lib/projectColor.ts
projectColorVar(colorIndex: number): string    // "var(--proj-N)"，N = ((colorIndex % 8) + 8) % 8
// lib/tools.ts
toolIcon(tool: string): LucideIcon // read/Read→FileText；bash/Bash→SquareTerminal；edit/Edit→Pencil；write/Write→FilePlus；grep/glob/find/web_search→Search；fetch_content/webfetch→Globe；其他→Wrench
// lib/timelineView.ts
export type TimelineFilter = "all" | "tools" | "text" | "issues";
export type TimelineRow = …（见页面层 R8 第 3 节，照抄）
buildTimelineRows(events: TimelineEvent[]): TimelineRow[]
filterTimelineRows(rows: TimelineRow[], filter: TimelineFilter): TimelineRow[]
countTimelineRows(rows: TimelineRow[]): Record<TimelineFilter, number>
```

## 5. 各区域详细规格

- [design/工作区.md](design/工作区.md) —— R1～R8 全部区域

## 6. 文案原则

- 全部中文，遵守全局界面文案守则：删掉不影响理解的字就不写；不写说明腔、不写开发备注、不写「运行正常」一类无意义状态。
- 状态词只用：排队中、工作中、已完成、失败、已取消；附加标记：重试 N/M、排队第 N 位、自评不通过。失败原因的中文取 `@fleet/core` 的 `FAIL_REASON_LABELS`。
- 数字一律具体：`18 / 20`、`排队 4`、`3分12秒`。为 0 的计数项不显示（「失败 0」不写）。
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

- 不准用 `any`，不准用 `as` 强转，不准 `// @ts-ignore`；不准有未使用的 import。
- 组件里不写死业务数字和文案以外的魔法数；尺寸、颜色、间距只用令牌。
- 不在组件里直接 `new Date()` / `Date.now()`：当前时刻一律来自 `useNow()`。
- 所有可交互元素键盘可达、有 `:focus-visible` 焦点环（`outline: 2px solid var(--accent); outline-offset: 2px`）。
- 所有图标 `aria-hidden`，含义由相邻文字或 `aria-label` 承担。
- 长文本都有省略或折叠处理；页面整体不出现横向滚动。

## 8. 文件写入边界与分路表

- **维护期（M2 完成后）：** 公共文件的增改由主控在任务书里指定由哪一路来做，不再限定地基路；下面的边界只约束并行开发期。
- **公共文件（只有地基路能写，其余各路一律不准碰）：** `src/main.tsx`、`src/App.tsx`、`src/App.module.css`、`src/styles/base.css`、`src/api/dataSource.ts`、`src/api/liveSource.ts`、`src/api/pickSource.ts`、`src/api/demo/demoSource.ts`、`src/state/**`、`src/lib/**`、`src/components/**`、仓库根 `vitest.config.ts`（只加一条 `apps/web/src/**/*.test.ts` 进 include）。
- **主控独占：** `src/styles/tokens.css`、`src/api/demo/records.ts`、`src/api/demo/timelines.ts`、`src/api/demo/scenarios.ts`、`src/api/demo/scenarios.test.ts`、本文件、`design/工作区.md`。
- 每路只写分给自己的文件；要拆子组件，只能放在自己的目录、以自己的区域名开头。
- 只能 import：`react`、`zustand`、`@radix-ui/react-tooltip`、`@radix-ui/react-collapsible`、`lucide-react`（白名单图标）、`@fleet/core`（类型、`STATUS_LABELS`、`FAIL_REASON_LABELS`、`API_PATHS`、`SSE_EVENTS`）、本项目的 `components/`、`state/`、`lib/`。**不 import 其他路的文件。**

| 路 | 负责的文件 |
|---|---|
| 地基 | 上面列的全部公共文件；`App.tsx` 里为 R3～R8 各放一个从各路目录 import 的组件（地基路先建占位文件：只渲染一个带对应 `data-*` 标记的空 `<section>`，由各路覆盖） |
| L1 | `src/features/capacity/**` |
| L2 | `src/features/projects/**` |
| L3 | `src/features/worker/*`（不含 `timeline/` 子目录） |
| L4 | `src/features/worker/timeline/**` |

占位文件的导出名（各路必须保持）：`features/capacity/CapacityStrip.tsx` → `CapacityStrip`；`features/projects/ListToolbar.tsx` → `ListToolbar`；`features/projects/ProjectList.tsx` → `ProjectList`；`features/worker/WorkerDetail.tsx` → `WorkerDetail`；`features/worker/timeline/Timeline.tsx` → `Timeline`（由 L3 的 `WorkerDetail` 渲染，L3 只负责在正确位置放 `<Timeline />`）。

## 9. 哪些是编的

| 项 | 状态 |
|---|---|
| 演示场景里的项目名 | **编的**，借用本机真实项目名（wiki-forge、cloudmind、inferforge、onaho-wiki、ui-studio），让截图贴近真实使用 |
| 演示苦工的标题、任务、时间线、回报 | **编的**，按 pi-fleet 真实回报格式（SUMMARY / FILES / VERIFY / SELF_REPORT / BLOCKED）编写 |
| 池 `dsf` 容量 20、模型 `mcgrox/deepseek-v4.1-flash` | **真实**，来自 `@fleet/core` 默认配置 |
| 池 `glm` 容量 8、模型 `glm/glm-5.2` | **编的**，演示多池 |
| 用量数字、费用 | **编的**，数量级参照 pi 真实抓包（单次请求输入数百到数万 token）；演示里 dsf 费用为 0，与真实通道一致 |
| 失败说明「通道连续 8 次请求失败：Connection error.」 | **真实**，与 pi 适配器放弃重试时的说明一致 |

## 附录 数据

演示数据由主控直接写成代码并配单测（B 方案），实现路不需要自己编任何数据：

| 文件 | 导出 | 用途 |
|---|---|---|
| `api/demo/records.ts` | `DEMO_NOW`、`demoConfig`、`demoProjects`、`demoWorkers`、`demoRuns` | 演示用的配置和全部记录；`DEMO_NOW` 是固定的当前时刻 |
| `api/demo/timelines.ts` | `demoDrafts` | 按运行编号给出的时间线草稿 |
| `api/demo/scenarios.ts` | `DemoScenario`、`DEMO_SCENARIOS`、`buildDemoScenario(name)` | 用 `@fleet/core` 的 `buildSnapshot`、`queuePositions`、`buildWorkerDetail`、`assembleTimeline` 组装出四个场景：`{ snapshot; details: Map<id, WorkerDetail>; timelines: Map<id, TimelineEvent[]>; connection: ConnectionState }` |

`demoSource.ts`（地基路写）只做包装：`subscribeSnapshot` 立即回调场景快照和连接状态（`offline` 场景先 `open` 后 300 毫秒变 `lost`）；`subscribeWorker` 找得到就依次回调详情和全部事件，找不到回调 `onNotFound`；`fixedNow()` 返回 `DEMO_NOW` 的毫秒数。
