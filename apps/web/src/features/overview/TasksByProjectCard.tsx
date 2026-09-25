import type { ShareItem } from "@fleet/core";
import { useNavigate } from "react-router";
import { Cell, Pie, PieChart } from "recharts";
import { useStats } from "@/api/queries";
import { ColorDot } from "@/components/ColorDot";
import { EmptyState } from "@/components/EmptyState";
import { SectionCard } from "@/components/SectionCard";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { overviewStatsQuery } from "@/features/overview/overviewStatsQuery";
import { seriesColorVar } from "@/lib/colors";
import { formatCompact, formatDuration, formatPercent, formatTokens } from "@/lib/format";
import { useOverviewStore } from "@/state/overviewStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

const PROJECT_ROW_CLASSES = {
  interactive:
    "cursor-pointer hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  other: "hover:bg-transparent",
};

function TasksByProjectCard() {
  const overviewState = useOverviewStore();
  const stats = useStats(overviewStatsQuery(overviewState));
  const applyFromOverview = useTaskFilterStore((state) => state.applyFromOverview);
  const navigate = useNavigate();
  const items = stats.data?.tasksByProject ?? [];
  const totalTasks = items.reduce((total, item) => total + item.tasks, 0);
  const loading = stats.isPending && stats.data === undefined;
  const chartConfig = Object.fromEntries(
    items.map((item) => [
      item.isOther ? "other" : item.key,
      { label: item.label, color: seriesColorVar(item.colorIndex) },
    ]),
  );

  function openItem(item: ShareItem): void {
    if (item.isOther) return;
    // 项目分布沿用当前时间范围，并重置任务页已有筛选。
    applyFromOverview({ status: "all", range: overviewState.range, project: item.key });
    navigate("/tasks");
  }

  return (
    <div data-tasks-by-project className="h-full min-w-0">
      <SectionCard data-section="tasks-by-project" title="任务次数分布" className="h-full">
        {loading ? (
          <div className="grid min-w-0 grid-cols-1 items-center gap-6 md:grid-cols-[160px_minmax(0,1fr)]">
            <Skeleton className="h-40 w-40 justify-self-center rounded-full" />
            <div className="space-y-2">
              {["one", "two", "three", "four", "five"].map((key) => (
                <Skeleton key={key} className="h-5 w-full" />
              ))}
            </div>
          </div>
        ) : items.length === 0 ? (
          <EmptyState message="这段时间没有任务" />
        ) : (
          <div className="grid min-w-0 grid-cols-1 items-center gap-6 md:grid-cols-[160px_minmax(0,1fr)]">
            <div
              role="img"
              aria-label={`任务次数分布，按项目，共 ${items.length} 项`}
              className="relative h-40 w-40 shrink-0 justify-self-center"
            >
              <ChartContainer config={chartConfig} className="h-40 w-40 aspect-square">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, name) =>
                          typeof value === "number" ? (
                            <span>
                              {String(name)}　{formatCompact(value)} 个　
                              {formatPercent(value, totalTasks) ?? "—"}
                            </span>
                          ) : null
                        }
                      />
                    }
                  />
                  <Pie
                    data={items}
                    dataKey="tasks"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={0}
                    stroke="var(--bg-panel)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {items.map((item) => (
                      <Cell
                        key={item.isOther ? "__other" : item.key}
                        fill={seriesColorVar(item.colorIndex)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-22 font-semibold text-fg-1">
                  {formatCompact(totalTasks)}
                </span>
                <span className="text-11 text-fg-3">任务</span>
              </div>
            </div>
            <Table className="table-fixed w-full text-13">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-12 font-medium text-fg-3">项目</TableHead>
                  <TableHead className="w-16 text-right text-12 font-medium text-fg-3">
                    任务数
                  </TableHead>
                  <TableHead className="w-[88px] text-right text-12 font-medium text-fg-3">
                    总耗时
                  </TableHead>
                  <TableHead className="hidden w-20 text-right text-12 font-medium text-fg-3 xl:table-cell">
                    token
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.isOther ? "__other" : item.key}
                    data-project-row={item.isOther ? "__other" : item.key}
                    role={item.isOther ? undefined : "button"}
                    tabIndex={item.isOther ? undefined : 0}
                    aria-label={item.isOther ? undefined : `查看 ${item.label} 的任务`}
                    className={
                      item.isOther ? PROJECT_ROW_CLASSES.other : PROJECT_ROW_CLASSES.interactive
                    }
                    onClick={item.isOther ? undefined : () => openItem(item)}
                    onKeyDown={
                      item.isOther
                        ? undefined
                        : (event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              openItem(item);
                            }
                          }
                    }
                  >
                    <TableCell className="max-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <ColorDot colorVar={seriesColorVar(item.colorIndex)} />
                        <span title={item.label} className="min-w-0 truncate">
                          {item.label}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="w-16 text-right font-mono tabular-nums">
                      {formatCompact(item.tasks)}
                    </TableCell>
                    <TableCell className="w-[88px] text-right font-mono tabular-nums">
                      {formatDuration(item.runMs)}
                    </TableCell>
                    <TableCell className="hidden w-20 text-right font-mono tabular-nums xl:table-cell">
                      {formatTokens(item.tokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export { TasksByProjectCard };
