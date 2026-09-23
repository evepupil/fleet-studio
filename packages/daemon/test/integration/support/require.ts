/**
 * 项目开了 noUncheckedIndexedAccess，数组下标访问和「找 A 后面紧跟的那个参数」这类查找
 * 天然带 undefined/null；测试里经常需要先拿到一个确定的值才能往下用（例如把 pid 传给
 * 期望 number 的函数），这里统一收口成一个函数，不满足就直接让测试失败并给出定位信息，
 * 不用到处写非空断言（! 或 as 强转）。
 */
export function requireDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}
