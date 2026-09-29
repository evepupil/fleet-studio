import type { PoolView } from "@fleet/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Duration } from "@/components/Duration";
import { UsageBreakdown } from "@/components/UsageBreakdown";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent, formatTokens } from "@/lib/format";
import { SlotMeter } from "./SlotMeter";

/** 停用行的第 2～8 列整体降一档灰；用完整类名映射，不拼接类名。 */
const ROW_TONE: Record<"on" | "off", string> = {
  on: "text-fg-1",
  off: "text-fg-3",
};

interface SlotsTableRowProps {
  pool: PoolView;
  /** 显示顺序里的位置，从 0 开始；列里显示 1 起 */
  index: number;
  count: number;
  /** 请求进行中：只有这一个开关置灰 */
  togglePending: boolean;
  /** 有排序请求在飞：所有上下移动按钮一起禁用 */
  orderPending: boolean;
  /** 断线时开关和按钮都不可用 */
  interactive: boolean;
  onToggle(pool: PoolView, next: boolean): void;
  onMove(poolId: string, direction: -1 | 1): void;
  onOpenWorker(workerId: string): void;
}

function SlotsTableRow({
  pool,
  index,
  count,
  togglePending,
  orderPending,
  interactive,
  onToggle,
  onMove,
  onOpenWorker,
}: SlotsTableRowProps) {
  const tone = ROW_TONE[pool.enabled ? "on" : "off"];
  const totalRecent = pool.recent.completed + pool.recent.failed;
  const percent = formatPercent(pool.recent.completed, totalRecent);
  const overCapacity = pool.running > pool.capacity;
  const usageEmpty = pool.usageToday.totalTokens === 0;
  const switchDisabled = togglePending || !interactive;
  const moveDisabled = orderPending || !interactive;

  return (
    <tr
      data-pool-row={pool.id}
      data-enabled={pool.enabled ? "true" : "false"}
      className="h-14 border-b border-line transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-hover"
    >
      <td className="pl-4 pr-3 align-middle font-mono text-13 text-fg-2">{pool.priority}</td>
      <td className={`min-w-0 px-3 align-middle ${tone}`}>
        <div className="flex items-center">
          <span
            className="truncate font-mono text-13"
            title={`${pool.channel} · ${pool.modelName}`}
          >
            {pool.channel} · {pool.modelName}
          </span>
          {pool.enabled ? null : (
            <span
              data-disabled-tag
              className="ml-2 inline-flex h-5 shrink-0 items-center rounded-sm border border-line bg-raised px-1.5 text-12 text-fg-2"
            >
              已停用
            </span>
          )}
        </div>
        <div className="truncate text-12 text-fg-3">
          {pool.label} <span className="font-mono">{pool.id}</span>
        </div>
      </td>
      <td className="min-w-0 px-3 align-middle">
        <SlotMeter pool={pool} onOpenWorker={onOpenWorker} />
      </td>
      <td className={`px-3 text-right align-middle font-mono tabular-nums text-13 ${tone}`}>
        {/* 超出容量的那个数描红：一眼看出超卖。 */}
        <span className={overCapacity ? "text-status-failed" : undefined}>{pool.running}</span>
        {` / ${pool.capacity}`}
      </td>
      <td className={`px-3 text-right align-middle font-mono tabular-nums text-13 ${tone}`}>
        {pool.queued === 0 ? <span className="text-fg-3">—</span> : pool.queued}
      </td>
      <td className={`px-3 text-right align-middle ${tone}`}>
        <div className="font-mono tabular-nums text-13">
          {percent === null ? <span className="text-fg-3">—</span> : percent}
        </div>
        {totalRecent === 0 ? null : (
          <div className="text-12 text-fg-3">
            完成 {pool.recent.completed} ·{" "}
            <span className={pool.recent.failed > 0 ? "text-status-failed" : undefined}>
              失败 {pool.recent.failed}
            </span>
          </div>
        )}
      </td>
      <td className={`whitespace-nowrap px-3 text-right align-middle text-13 ${tone}`}>
        {pool.recent.avgRunMs === null ? "—" : <Duration ms={pool.recent.avgRunMs} />}
      </td>
      <td className={`px-3 text-right align-middle ${tone}`}>
        {usageEmpty ? (
          <span className="text-fg-3">—</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* 无边框的数字按钮：悬停出用量拆分（输入 / 输出 / 缓存）。 */}
              <button
                type="button"
                className="block w-full border-0 bg-transparent p-0 text-right font-mono tabular-nums text-13 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {formatTokens(pool.usageToday.totalTokens)}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <UsageBreakdown usage={pool.usageToday} />
            </TooltipContent>
          </Tooltip>
        )}
      </td>
      <td className="px-3 align-middle">
        <Switch
          checked={pool.enabled}
          disabled={switchDisabled}
          data-pool-toggle={pool.id}
          aria-label={`启用 ${pool.id}`}
          className={togglePending ? "opacity-60" : undefined}
          onCheckedChange={(next) => onToggle(pool, next)}
        />
      </td>
      <td className="pr-4 pl-3 align-middle">
        <div className="flex items-center gap-1">
          {/* 首行的上移、末行的下移留成 invisible 占位：保住对齐，又不进 Tab 序列、不被读屏读到。 */}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            data-move-up={pool.id}
            aria-label={`${pool.id} 上移一位`}
            disabled={moveDisabled}
            className={index === 0 ? "invisible" : undefined}
            onClick={() => onMove(pool.id, -1)}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            data-move-down={pool.id}
            aria-label={`${pool.id} 下移一位`}
            disabled={moveDisabled}
            className={index === count - 1 ? "invisible" : undefined}
            onClick={() => onMove(pool.id, 1)}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export { SlotsTableRow };
