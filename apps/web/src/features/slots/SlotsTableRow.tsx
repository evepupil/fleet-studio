import type { PoolView } from "@fleet/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Duration } from "@/components/Duration";
import { UsageBreakdown } from "@/components/UsageBreakdown";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent, formatTokens } from "@/lib/format";
import { SlotMeter } from "./SlotMeter";

/** 停用行的第 2～8 列整体降一档灰。 */
const ROW_TONE: Record<"on" | "off", string> = {
  on: "text-fg-1",
  off: "text-fg-3",
};

interface SlotsTableRowProps {
  pool: PoolView;
  /** 显示顺序里的位置，从 0 开始；列里显示 1 起 */
  index: number;
  count: number;
  /** 请求进行中：只有这一个开关转圈/置灰 */
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
      className="h-16 border-b border-line transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] last:border-b-0 hover:bg-hover"
    >
      <TableCell className="px-3 py-3 align-middle font-mono text-13 text-fg-2">
        {pool.priority}
      </TableCell>
      <TableCell className={`min-w-[148px] px-3 py-3 align-middle ${tone}`}>
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
              className="ml-2 inline-flex h-[18px] shrink-0 items-center rounded-sm bg-hover px-1.5 text-11 text-fg-2"
            >
              已停用
            </span>
          )}
        </div>
        <div className="truncate text-12 text-fg-3">
          {pool.label} <span className="font-mono">{pool.id}</span>
        </div>
      </TableCell>
      <TableCell className="w-[262px] px-3 py-3 align-middle">
        <SlotMeter pool={pool} onOpenWorker={onOpenWorker} />
      </TableCell>
      <TableCell
        className={`px-3 py-3 text-right align-middle font-mono tabular-nums text-13 ${tone}`}
      >
        <span className={overCapacity ? "text-status-failed" : undefined}>{pool.running}</span>
        {` / ${pool.capacity}`}
      </TableCell>
      <TableCell
        className={`px-3 py-3 text-right align-middle font-mono tabular-nums text-13 ${tone}`}
      >
        {pool.queued === 0 ? <span className="text-fg-3">—</span> : pool.queued}
      </TableCell>
      <TableCell className={`px-3 py-3 text-right align-middle ${tone}`}>
        <div className="font-mono tabular-nums text-13">
          {percent === null ? <span className="text-fg-3">—</span> : percent}
        </div>
        {totalRecent === 0 ? null : (
          <div className="text-11 text-fg-3">
            完成 {pool.recent.completed} ·{" "}
            <span className={pool.recent.failed > 0 ? "text-status-failed" : undefined}>
              失败 {pool.recent.failed}
            </span>
          </div>
        )}
      </TableCell>
      <TableCell className={`px-3 py-3 text-right align-middle text-13 ${tone}`}>
        {pool.recent.avgRunMs === null ? "—" : <Duration ms={pool.recent.avgRunMs} />}
      </TableCell>
      <TableCell className={`w-[72px] px-3 py-3 text-right align-middle ${tone}`}>
        {usageEmpty ? (
          <span className="text-fg-3">—</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ml-auto block w-fit border-0 bg-transparent p-0 text-right font-mono tabular-nums text-13 text-fg-1"
              >
                {formatTokens(pool.usageToday.totalTokens)}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <UsageBreakdown usage={pool.usageToday} />
            </TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="px-3 py-3 align-middle">
        <Switch
          checked={pool.enabled}
          disabled={switchDisabled}
          data-pool-toggle={pool.id}
          aria-label={`启用 ${pool.id}`}
          className={togglePending ? "opacity-60" : undefined}
          onCheckedChange={(next) => onToggle(pool, next)}
        />
      </TableCell>
      <TableCell className="px-3 py-3 align-middle">
        <div className="flex items-center gap-1">
          {/* 首行的上移、末行的下移留成 invisible 占位：保住对齐，又不进 Tab 序列、不被读屏读到。 */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-move-up={pool.id}
            aria-label={`${pool.id} 上移一位`}
            disabled={moveDisabled}
            className={`h-7 w-7 ${index === 0 ? "invisible" : ""}`}
            onClick={() => onMove(pool.id, -1)}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-move-down={pool.id}
            aria-label={`${pool.id} 下移一位`}
            disabled={moveDisabled}
            className={`h-7 w-7 ${index === count - 1 ? "invisible" : ""}`}
            onClick={() => onMove(pool.id, 1)}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </tr>
  );
}

export { SlotsTableRow };
