import type { Usage } from "@fleet/core";
import { formatTokens } from "../lib/format";
import styles from "./UsageBreakdown.module.css";

const { item, number } = styles;

export interface UsageBreakdownProps {
  usage: Usage;
}

/**
 * 用量拆分成「输入 · 输出 · 缓存」三项：容量条第 3 列第 5 行和苦工详情「用量」的补充行共用。
 * 字号和颜色不在这里定，跟随调用处的上下文。「缓存」只算缓存读（cacheReadTokens），不含缓存写。
 * 每一项（标签 + 数字）内部不换行，项与项之间的分隔符是普通行内文本，允许在那里折行——
 * 不用 flex，靠浏览器默认的行内排版规则就够了。
 */
export function UsageBreakdown({ usage }: UsageBreakdownProps) {
  return (
    <span data-usage-breakdown>
      <span className={item}>
        输入 <span className={number}>{formatTokens(usage.inputTokens)}</span>
      </span>
      {" · "}
      <span className={item}>
        输出 <span className={number}>{formatTokens(usage.outputTokens)}</span>
      </span>
      {" · "}
      <span className={item}>
        缓存 <span className={number}>{formatTokens(usage.cacheReadTokens)}</span>
      </span>
    </span>
  );
}
