import { z } from "zod";
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

/** GET /api/workers/:id/timeline?after=&limit=：返回 seq > after 的事件 */
export const timelineQuerySchema = z.object({
  after: z.coerce.number().int().min(-1).default(-1),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
export type TimelineQuery = z.output<typeof timelineQuerySchema>;
