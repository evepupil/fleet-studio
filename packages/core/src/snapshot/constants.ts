/**
 * 快照汇总模块共用的小常量。单独放一个文件方便调整口径时一眼找到出处。
 */

/** 池健康窗口：看最近多少分钟内的完成 / 失败 / 重试来判断通道是否出问题。 */
export const HEALTH_WINDOW_MINUTES = 10;

/** 快照里苦工列表最多携带多少条，超出时按"非终态全留、终态挑最近结束的"裁剪。 */
export const SNAPSHOT_WORKER_LIMIT = 300;

/** 池最近战绩窗口：看最近多少小时内结束的运行，用来给看板显示平均时长。 */
export const RECENT_WINDOW_HOURS = 24;
