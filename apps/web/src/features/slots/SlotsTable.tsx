import type { PoolView } from "@fleet/core";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useReorderPools, useSetPoolEnabled } from "@/api/queries";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSnapshotStore } from "@/state/snapshotStore";
import { DisablePoolDialog } from "./DisablePoolDialog";
import { SlotsTableRow } from "./SlotsTableRow";

const SKELETON_ROWS = [0, 1, 2, 3] as const;

const HEADERS = [
  { label: "优先级", className: "w-12" },
  { label: "渠道 · 模型", className: "min-w-[148px]" },
  { label: "占用", className: "w-[262px]" },
  { label: "已用", className: "w-20 text-right" },
  { label: "点名排队", className: "w-16 text-right" },
  { label: "24 小时成功率", className: "w-24 text-right" },
  { label: "平均耗时", className: "w-20 text-right" },
  { label: "今日用量", className: "w-[72px] text-right" },
  { label: "启用", className: "w-16" },
  { label: "顺序", className: "w-[88px]" },
] as const;

/** 快照还没到时画 4 行骨架，列宽和真表格对齐。 */
function SlotsTableSkeleton() {
  return (
    <TableBody>
      {SKELETON_ROWS.map((row) => (
        <TableRow key={`skeleton-${row}`} className="h-16 border-b border-line last:border-b-0">
          {HEADERS.map((header, columnIndex) => (
            <TableCell key={header.label} className={`px-3 py-3 align-middle ${header.className}`}>
              {columnIndex === 1 ? (
                <Skeleton className="h-3.5 w-[120px]" />
              ) : columnIndex === 2 ? (
                <Skeleton className="h-4 w-[180px]" />
              ) : (
                <Skeleton className="h-3.5 w-10" />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

/**
 * L3 槽位表格。显示用的顺序和启用状态 = 服务端快照叠上本地覆盖：
 * 覆盖只在「请求已成功、但新快照还没推来」的空窗期里起作用，一旦快照和覆盖一致就清掉，
 * 免得成功后开关闪回旧值。覆盖只活在组件状态里，不进全局仓库。
 */
function SlotsTable() {
  const navigate = useNavigate();
  const serverPools = useSnapshotStore((state) => state.snapshot?.pools ?? null);
  const connection = useSnapshotStore((state) => state.connection);
  const setEnabled = useSetPoolEnabled();
  const reorder = useReorderPools();

  const [enabledOverride, setEnabledOverride] = useState<Record<string, boolean>>({});
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [dialogPoolId, setDialogPoolId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // 快照和覆盖对上了就把覆盖丢掉：服务端已经是新样子，不需要再兜着。
  useEffect(() => {
    if (serverPools === null) {
      return;
    }
    setEnabledOverride((previous) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [id, value] of Object.entries(previous)) {
        const serverPool = serverPools.find((pool) => pool.id === id);
        if (serverPool !== undefined && serverPool.enabled === value) {
          changed = true;
          continue;
        }
        next[id] = value;
      }
      return changed ? next : previous;
    });
    if (orderOverride !== null) {
      const same =
        orderOverride.length === serverPools.length &&
        orderOverride.every((id, index) => serverPools[index]?.id === id);
      if (same) {
        setOrderOverride(null);
      }
    }
  }, [serverPools, orderOverride]);

  // 本地顺序只认快照里还存在的池；对不上就退回服务端顺序，绝不显示半个列表。
  const orderedPools = useMemo(() => {
    if (serverPools === null) {
      return null;
    }
    if (orderOverride === null) {
      return serverPools;
    }
    const byId = new Map(serverPools.map((pool) => [pool.id, pool] as const));
    const ordered = orderOverride.flatMap((id) => {
      const pool = byId.get(id);
      return pool === undefined ? [] : [pool];
    });
    return ordered.length === serverPools.length ? ordered : serverPools;
  }, [serverPools, orderOverride]);

  const pools: PoolView[] | null = useMemo(() => {
    if (orderedPools === null) {
      return null;
    }
    return orderedPools.map((pool, index) => ({
      ...pool,
      priority: index + 1,
      enabled: enabledOverride[pool.id] ?? pool.enabled,
    }));
  }, [orderedPools, enabledOverride]);

  const pendingPoolId = setEnabled.isPending ? (setEnabled.variables?.poolId ?? null) : null;
  const dialogPool =
    dialogPoolId === null ? null : (pools?.find((pool) => pool.id === dialogPoolId) ?? null);
  const interactive = connection === "open";

  function enablePool(poolId: string): void {
    setEnabled.mutate(
      { poolId, enabled: true },
      {
        onSuccess: (updated) => {
          setEnabledOverride((previous) => ({ ...previous, [updated.id]: updated.enabled }));
        },
        onError: () => {
          setEnabledOverride((previous) => {
            const next = { ...previous };
            delete next[poolId];
            return next;
          });
        },
      },
    );
  }

  function handleToggle(pool: PoolView, next: boolean): void {
    if (next) {
      enablePool(pool.id);
      return;
    }
    // 停用要先问一句：还在跑的会跑完，点名的会一直排队。
    setDialogError(null);
    setDialogPoolId(pool.id);
  }

  function handleConfirmDisable(): void {
    if (dialogPoolId === null) {
      return;
    }
    setEnabled.mutate(
      { poolId: dialogPoolId, enabled: false },
      {
        onSuccess: (updated) => {
          setEnabledOverride((previous) => ({ ...previous, [updated.id]: updated.enabled }));
          setDialogPoolId(null);
          setDialogError(null);
        },
        onError: (error) => {
          setDialogError(error instanceof Error ? error.message : "修改模型池失败");
        },
      },
    );
  }

  function handleMove(poolId: string, direction: -1 | 1): void {
    if (pools === null) {
      return;
    }
    const current = pools.map((pool) => pool.id);
    const index = current.indexOf(poolId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= current.length) {
      return;
    }
    const next = [...current];
    const moved = next[index];
    const displaced = next[target];
    if (moved === undefined || displaced === undefined) {
      return;
    }
    next[index] = displaced;
    next[target] = moved;
    setOrderOverride(next);
    reorder.mutate(next, {
      onSuccess: (updated) => {
        setOrderOverride(updated.map((pool) => pool.id));
      },
      onError: () => {
        setOrderOverride(null);
      },
    });
  }

  return (
    <section
      data-slots-table
      className="min-w-0 overflow-hidden rounded-lg border border-line bg-panel"
    >
      <div className="overflow-x-auto">
        <Table className="table-fixed w-full min-w-[960px]">
          <TableHeader className="[&_tr]:border-b [&_tr]:border-line">
            <TableRow className="h-10 border-b border-line hover:bg-transparent">
              {HEADERS.map((header) => (
                <TableHead
                  key={header.label}
                  // TableHead 内建类里有 `text-foreground`，而 twMerge 把自定义的 `text-12` 和 `text-fg-*`
                  // 都归到「文字颜色」组，同组只留最后一个 —— 写 `text-12 … text-fg-3` 字号会被吃掉。
                  // 所以字号留在 th 上（只有它，不会和颜色撞组），颜色交给里面的 span。
                  className={`h-10 px-3 text-12 font-medium ${header.className}`}
                >
                  <span className="text-fg-3">{header.label}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {pools === null ? (
            <SlotsTableSkeleton />
          ) : (
            <TableBody>
              {pools.map((pool, index) => (
                <SlotsTableRow
                  key={pool.id}
                  pool={pool}
                  index={index}
                  count={pools.length}
                  togglePending={pendingPoolId === pool.id}
                  orderPending={reorder.isPending}
                  interactive={interactive}
                  onToggle={handleToggle}
                  onMove={handleMove}
                  onOpenWorker={(workerId) => {
                    navigate(`/tasks/${workerId}`);
                  }}
                />
              ))}
            </TableBody>
          )}
        </Table>
      </div>
      {pools !== null && pools.length === 0 ? <EmptyState message="还没有配置模型池" /> : null}
      <DisablePoolDialog
        pool={dialogPool}
        pending={setEnabled.isPending}
        error={dialogError}
        onCancel={() => {
          setDialogPoolId(null);
          setDialogError(null);
        }}
        onConfirm={handleConfirmDisable}
      />
    </section>
  );
}

export { SlotsTable };
