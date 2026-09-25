import { z } from "zod";
import { RUNTIME_IDS, THINKING_LEVELS } from "../domain/status.js";

/** 池、角色编号：小写字母开头，由小写字母、数字和短横线组成，最长 32 个字符。 */
export const ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/** 池在 pi 下怎么指定模型：--provider <provider> --model <model> */
export const piPoolModelSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

/** 池在 opencode 下怎么指定模型：-m <model> [--variant <variant>] */
export const opencodePoolModelSchema = z.object({
  model: z.string().min(1),
  variant: z.string().min(1).optional(),
});

/** 模型池：一条通道上的一个模型，就是一份大家共用的容量。 */
export const poolConfigSchema = z
  .object({
    id: z.string().regex(ID_PATTERN),
    label: z.string().min(1),
    /** 同时在跑的苦工进程上限；0 表示暂停放行 */
    capacity: z.number().int().min(0).max(500),
    /** 单个项目在这个池里最多同时占几个；null 表示不限 */
    perProjectCap: z.number().int().min(1).nullable().default(null),
    /** 覆盖全局默认的运行超时（分钟）；null 表示沿用默认 */
    runTimeoutMin: z.number().positive().max(1440).nullable().default(null),
    /** 覆盖全局默认的排队超时（分钟）；null 表示沿用默认 */
    queueTimeoutMin: z.number().positive().max(1440).nullable().default(null),
    /**
     * 停用的池不再放行新的运行（在跑的照常跑完）；点名它派活会被拒绝。
     * 池在 pools 数组里的先后就是派活优先级，没有单独的优先级字段。
     */
    enabled: z.boolean().default(true),
    runtimes: z.object({
      pi: piPoolModelSchema.optional(),
      opencode: opencodePoolModelSchema.optional(),
    }),
  })
  .refine((pool) => pool.runtimes.pi !== undefined || pool.runtimes.opencode !== undefined, {
    message: "池至少要为一种运行时指定模型",
    path: ["runtimes"],
  });

/**
 * 角色在 pi 下的做法。
 * 提示词路径支持 ~ 开头（用户目录）和 builtin: 开头（fleet-studio 仓库根目录）。
 */
export const piRoleConfigSchema = z.object({
  appendSystemPrompt: z.string().min(1).optional(),
  excludeTools: z.array(z.string().min(1)).optional(),
  tools: z.array(z.string().min(1)).optional(),
});

/**
 * 角色在 opencode 下的做法。
 * 有 agent 就用 --agent；没有 agent 时把 promptFile（缺省取 pi 的提示词）拼在任务前面。
 */
export const opencodeRoleConfigSchema = z.object({
  agent: z.string().min(1).optional(),
  promptFile: z.string().min(1).optional(),
});

export const roleConfigSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  label: z.string().min(1),
  description: z.string().default(""),
  pi: piRoleConfigSchema.default({}),
  opencode: opencodeRoleConfigSchema.default({}),
});

/** 运行时可执行文件：[可执行文件, ...前置参数]；null 表示自动探测。 */
const runtimeCommandSchema = z.array(z.string().min(1)).min(1).nullable().default(null);

const runtimeSettingsSchema = z.object({
  command: runtimeCommandSchema,
});

/** 原始输出默认保留天数 */
export const DEFAULT_RAW_OUTPUT_RETENTION_DAYS = 7;

export const fleetConfigSchema = z
  .object({
    version: z.literal(1),
    port: z.number().int().min(1024).max(65535).default(4870),
    /**
     * 已废弃：第一版「已结束的苦工保留几天」。第二版起任务记录和时间线永久保留，
     * 读到这个字段且没写 rawOutputRetentionDays 时，把它当作 rawOutputRetentionDays。
     */
    retentionDays: z.number().int().min(1).max(3650).optional(),
    /** 原始输出（runs/<运行>/ 下的 out.jsonl、err.log、task.md）保留几天，默认 7 */
    rawOutputRetentionDays: z.number().int().min(1).max(3650).optional(),
    /** 快照里保留最近多少小时内结束的苦工 */
    snapshotWindowHours: z.number().int().min(1).max(168).default(24),
    defaults: z.object({
      /** 已废弃：第二版起不点名的派活按池的优先级挑选。读到时忽略，不再校验 */
      pool: z.string().optional(),
      runtime: z.enum(RUNTIME_IDS).default("pi"),
      role: z.string().regex(ID_PATTERN).default("worker"),
      runTimeoutMin: z.number().positive().max(1440).default(30),
      /** null 表示排队不限时 */
      queueTimeoutMin: z.number().positive().max(1440).nullable().default(null),
      /** null 表示沿用运行时自己的默认档位 */
      thinking: z.enum(THINKING_LEVELS).nullable().default(null),
    }),
    pools: z.array(poolConfigSchema).min(1),
    roles: z.array(roleConfigSchema).min(1),
    runtimes: z
      .object({
        pi: runtimeSettingsSchema.default({ command: null }),
        opencode: runtimeSettingsSchema.default({ command: null }),
      })
      .default({ pi: { command: null }, opencode: { command: null } }),
  })
  .superRefine((config, ctx) => {
    const poolIds = new Set<string>();
    config.pools.forEach((pool, index) => {
      if (poolIds.has(pool.id)) {
        ctx.addIssue({
          code: "custom",
          message: `池编号重复：${pool.id}`,
          path: ["pools", index, "id"],
        });
      }
      poolIds.add(pool.id);
    });
    const roleIds = new Set<string>();
    config.roles.forEach((role, index) => {
      if (roleIds.has(role.id)) {
        ctx.addIssue({
          code: "custom",
          message: `角色编号重复：${role.id}`,
          path: ["roles", index, "id"],
        });
      }
      roleIds.add(role.id);
    });
    if (!roleIds.has(config.defaults.role)) {
      ctx.addIssue({
        code: "custom",
        message: `默认角色不存在：${config.defaults.role}`,
        path: ["defaults", "role"],
      });
    }
  })
  .transform(({ retentionDays, rawOutputRetentionDays, ...rest }) => ({
    ...rest,
    rawOutputRetentionDays:
      rawOutputRetentionDays ?? retentionDays ?? DEFAULT_RAW_OUTPUT_RETENTION_DAYS,
  }));

/** 校验并补齐默认值之后的配置 */
export type FleetConfig = z.output<typeof fleetConfigSchema>;
/** 用户在 config.json 里可以写的形状 */
export type FleetConfigInput = z.input<typeof fleetConfigSchema>;
export type PoolConfig = z.output<typeof poolConfigSchema>;
export type RoleConfig = z.output<typeof roleConfigSchema>;
export type PiPoolModel = z.output<typeof piPoolModelSchema>;
export type OpencodePoolModel = z.output<typeof opencodePoolModelSchema>;
export type PiRoleConfig = z.output<typeof piRoleConfigSchema>;
export type OpencodeRoleConfig = z.output<typeof opencodeRoleConfigSchema>;
