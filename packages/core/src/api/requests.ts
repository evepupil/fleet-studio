import { z } from "zod";
import { ID_PATTERN } from "../config/schema.js";
import { RUN_STATUSES, RUNTIME_IDS, THINKING_LEVELS } from "../domain/status.js";

/** 单次任务或追加指令的最大字符数 */
export const PROMPT_MAX_CHARS = 200_000;
/** 一次等待请求最长挂多久（秒）；命令行会循环发请求直到自己的超时 */
export const WAIT_MAX_SECONDS = 60;

/** POST /api/workers：派一个苦工 */
export const submitRequestSchema = z.object({
  /** 苦工归属的项目目录（绝对路径） */
  projectPath: z.string().min(1),
  /** 苦工实际干活的目录（绝对路径） */
  cwd: z.string().min(1),
  prompt: z.string().min(1).max(PROMPT_MAX_CHARS),
  title: z.string().trim().min(1).max(200).optional(),
  role: z.string().min(1).optional(),
  runtime: z.enum(RUNTIME_IDS).optional(),
  pool: z.string().min(1).optional(),
  thinking: z.enum(THINKING_LEVELS).optional(),
  timeoutMin: z.number().positive().max(1440).optional(),
  /** null 表示这次派活排队不限时 */
  queueTimeoutMin: z.number().positive().max(1440).nullable().optional(),
});
export type SubmitRequest = z.output<typeof submitRequestSchema>;

/** POST /api/workers/:id/messages：对已结束的苦工追加指令 */
export const sendRequestSchema = z.object({
  prompt: z.string().min(1).max(PROMPT_MAX_CHARS),
  timeoutMin: z.number().positive().max(1440).optional(),
});
export type SendRequest = z.output<typeof sendRequestSchema>;

/** PATCH /api/pools/:id：调整容量 */
export const poolPatchSchema = z
  .object({
    capacity: z.number().int().min(0).max(500).optional(),
    perProjectCap: z.number().int().min(1).nullable().optional(),
  })
  .refine((patch) => patch.capacity !== undefined || patch.perProjectCap !== undefined, {
    message: "至少要改一项",
  });
export type PoolPatch = z.output<typeof poolPatchSchema>;

/** GET /api/wait?ids=a,b&mode=all&timeoutSec=30 */
export const waitQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((raw) =>
      raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    )
    .pipe(z.array(z.string()).min(1).max(100)),
  mode: z.enum(["all", "any"]).default("all"),
  timeoutSec: z.coerce.number().int().min(0).max(WAIT_MAX_SECONDS).default(30),
});
export type WaitQuery = z.output<typeof waitQuerySchema>;

/** GET /api/workers?project=&status=&limit= */
export const listWorkersQuerySchema = z.object({
  /** 项目目录（任意大小写、斜杠方向均可，服务会归一化） */
  project: z.string().min(1).optional(),
  status: z.enum(RUN_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListWorkersQuery = z.output<typeof listWorkersQuerySchema>;

/** PUT /api/pools/:id/enabled：启用或停用一个池（命令行令牌或看板令牌都可以） */
export const poolEnabledRequestSchema = z.object({
  enabled: z.boolean(),
});
export type PoolEnabledRequest = z.output<typeof poolEnabledRequestSchema>;

/**
 * PUT /api/pools/order：按给出的顺序重排全部池（先后即派活优先级）。
 * 必须恰好是当前全部池编号的一个排列，否则 409 conflict（配置在别处被改过）。
 */
export const poolOrderRequestSchema = z.object({
  poolIds: z.array(z.string().regex(ID_PATTERN)).min(1),
});
export type PoolOrderRequest = z.output<typeof poolOrderRequestSchema>;

/** 时间范围档位：今日、近 7 天、近 30 天、全部、自选起止日期。按服务所在机器的本地时间理解。 */
export const RANGE_KINDS = ["today", "7d", "30d", "all", "custom"] as const;
export type RangeKind = (typeof RANGE_KINDS)[number];

/** 本地日期，例如 2026-09-25 */
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

/** 统计和任务列表共用的时间范围参数；custom 时 from、to 必填（本地日期，两头都含），且 from ≤ to */
const rangeShape = {
  range: z.enum(RANGE_KINDS).default("all"),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
};

function checkCustomRange(
  value: { range: RangeKind; from?: string | undefined; to?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.range !== "custom") {
    return;
  }
  if (value.from === undefined || value.to === undefined) {
    ctx.addIssue({ code: "custom", message: "自选日期要同时给出 from 和 to", path: ["from"] });
    return;
  }
  if (value.from > value.to) {
    ctx.addIssue({ code: "custom", message: "from 不能晚于 to", path: ["from"] });
  }
}

/** 统计的分组维度 */
export const STATS_DIMENSIONS = ["model", "channel", "project", "role"] as const;
export type StatsDimension = (typeof STATS_DIMENSIONS)[number];

/** GET /api/stats?range=&from=&to=&dimension= */
export const statsQuerySchema = z
  .object({
    ...rangeShape,
    dimension: z.enum(STATS_DIMENSIONS).default("model"),
  })
  .superRefine(checkCustomRange);
export type StatsQuery = z.output<typeof statsQuerySchema>;

/**
 * 任务列表的状态筛选。active = 排队中 + 工作中；retrying = 工作中且正在自动重试；all = 不筛。
 * 其余和运行状态同名，按苦工最新一次运行的状态筛。
 */
export const TASK_STATUS_FILTERS = [
  "active",
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
  "all",
] as const;
export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

/** 任务列表的排序键：创建时间（表格里的「开始时间」列）、真正在跑的总时长、token 合计 */
export const TASK_SORT_KEYS = ["createdAt", "runMs", "tokens"] as const;
export type TaskSortKey = (typeof TASK_SORT_KEYS)[number];

/** 任务列表每页默认条数 */
export const TASK_PAGE_SIZE = 50;

/**
 * GET /api/tasks?status=&project=&pool=&role=&channel=&model=&range=&from=&to=&q=&sort=&order=&cursor=&limit=
 * 时间范围按任务创建时间筛；q 在标题里做不区分大小写的包含匹配；cursor 是上一页返回的 nextCursor，原样传回。
 */
export const tasksQuerySchema = z
  .object({
    ...rangeShape,
    status: z.enum(TASK_STATUS_FILTERS).default("active"),
    /** 项目的 key（ProjectInfo.key） */
    project: z.string().min(1).optional(),
    pool: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    /** 渠道名（苦工记录的 channel），总览「按渠道」的排名点进来时用 */
    channel: z.string().min(1).optional(),
    /** 不带渠道的模型名（苦工记录的 modelName），总览「按模型」的排名点进来时用 */
    model: z.string().min(1).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    sort: z.enum(TASK_SORT_KEYS).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(TASK_PAGE_SIZE),
  })
  .superRefine(checkCustomRange);
export type TasksQuery = z.output<typeof tasksQuerySchema>;

/** GET /api/workers/:id/timeline?after=&limit=：返回 seq > after 的事件 */
export const timelineQuerySchema = z.object({
  after: z.coerce.number().int().min(-1).default(-1),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
export type TimelineQuery = z.output<typeof timelineQuerySchema>;
