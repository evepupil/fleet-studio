import type { PoolView } from "@fleet/core";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useReorderPools, useSetPoolEnabled } from "@/api/queries";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useSnapshotStore } from "@/state/snapshotStore";
import { DisablePoolDialog } from "./DisablePoolDialog";
import { SlotsTableRow } from "./SlotsTableRow";

const SKELETON_ROWS = [0, 1, 2, 3] as const;

/**
 * 十列表头：宽度和对齐写在 th 上（第一格 pl-4、最后一格 pr-4，数字列右对齐）。
 * 用完整类名映射，不拼接。
 */
const HEADERS: { label: string; className: string }[] = [
  { label: "优先级", className: "w-16 pl-4" },
  { label: "渠道 · 模型", className: "" },
  { label: "占用", className: "w-[252px]" },
  { label: "已用", className: "w-20 text-right" },
  { label: "点名排队", className: "w-20 text-right" },
  { label: "24 小时成功率", className: "w-28 text-right" },
  { label: "平均耗时", className: "w-24 text-right" },
  { label: "今日用量", className: "w-20 text-right" },
  { label: "启用", className: "w-16" },
  { label: "顺序", className: "w-[76px] pr-4" },
];

/** 快照还没到时画 4 行骨架，每格一个 Skeleton，行高同真行。 */
function SlotsTableSkeleton() {
  return (
    <tbody>
      {SKELETON_ROWS.map((row) => (
        <tr key={`skeleton-${row}`} className="h-14 border-b border-line">
          {HEADERS.map((header, columnIndex) => (
            <td key={header.label} className={`px-3 align-middle ${header.className}`}>
              {columnIndex === 1 ? (
                <Skeleton className="h-3.5 w-[140px]" />
              ) : columnIndex === 2 ? (
                <Skeleton className="h-4 w-[180px]" />
              ) : (
                <Skeleton className="h-3.5 w-10" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
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
    <section data-slots-table className="min-w-0">
      <div className="overflow-x-auto">
        {/* 原生 table：通栏、无外框卡片，行间只有 1px 细线；窄屏在自己的容器里横向滚动。 */}
        <table className="w-full min-w-[1120px] table-fixed border-collapse text-13">
          <thead>
            <tr className="h-8">
              {HEADERS.map((header) => (
                <th
                  key={header.label}
                  scope="col"
                  className={`border-b border-line px-3 text-left align-middle text-12 font-medium text-fg-3 ${header.className}`}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          {pools === null ? (
            <SlotsTableSkeleton />
          ) : (
            <tbody>
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
            </tbody>
          )}
        </table>
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
