import { X } from "lucide-react";
import { useProjects } from "@/api/queries";
import { Button } from "@/components/ui/button";
import type { TaskFilterChip } from "@/lib/taskFilters";
import { activeFilterChips } from "@/lib/taskFilters";
import { useNow } from "@/state/nowStore";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

function chipDataKey(key: TaskFilterChip["key"]): string {
  return key === "query" ? "q" : key;
}

function chipText(key: TaskFilterChip["key"], rawLabel: string): string {
  const prefixByKey: Partial<Record<TaskFilterChip["key"], string>> = {
    status: "状态：",
    project: "项目：",
    pool: "池：",
    role: "角色：",
    channel: "渠道：",
    model: "模型：",
    range: "时间：",
    query: "搜索：",
  };
  const prefix = prefixByKey[key];
  let label = rawLabel;

  if (key === "status") {
    const statusLabels: Readonly<Record<string, string>> = {
      运行中: "工作中",
      自动重试: "重试中",
      全部状态: "全部",
    };
    label = statusLabels[label] ?? label;
  }
  if (key === "range" && label === "今天") label = "今日";
  if (key === "query") {
    const query = label.startsWith("搜索：") ? label.slice(3) : label;
    const characters = Array.from(query);
    label = characters.length > 16 ? `${characters.slice(0, 16).join("")}…` : query;
  }
  if (prefix === undefined || label.startsWith(prefix)) return label;
  return `${prefix}${label}`;
}

function removeChip(
  chip: TaskFilterChip,
  setFilters: ReturnType<typeof useTaskFilterStore.getState>["set"],
): void {
  switch (chip.key) {
    case "status":
      setFilters({ status: "active" });
      break;
    case "project":
      setFilters({ project: undefined });
      break;
    case "pool":
      setFilters({ pool: undefined });
      break;
    case "role":
      setFilters({ role: undefined });
      break;
    case "channel":
      setFilters({ channel: undefined });
      break;
    case "model":
      setFilters({ model: undefined });
      break;
    case "range":
      setFilters({ range: { kind: "all" } });
      break;
    case "query":
      setFilters({ q: "" });
      break;
    case "sort":
      setFilters({ sort: "createdAt", order: "desc" });
      break;
  }
}

function ActiveFilterChips() {
  const filters = useTaskFilterStore((state) => state);
  const setFilters = useTaskFilterStore((state) => state.set);
  const resetFilters = useTaskFilterStore((state) => state.reset);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const projects = useProjects();
  const nowMs = useNow();

  const projectNames = new Map<string, string>();
  for (const project of projects.data ?? []) projectNames.set(project.key, project.name);
  const poolNames = new Map<string, string>();
  const roleNames = new Map<string, string>();
  const channelNames = new Map<string, string>();
  const modelNames = new Map<string, string>();
  for (const pool of snapshot?.pools ?? []) {
    poolNames.set(pool.id, pool.id);
    channelNames.set(pool.channel, pool.channel);
    modelNames.set(pool.modelName, pool.modelName);
  }
  for (const role of snapshot?.roles ?? []) roleNames.set(role.id, role.label);

  const chips = activeFilterChips(filters, {
    projects: projectNames,
    pools: poolNames,
    roles: roleNames,
    channels: channelNames,
    models: modelNames,
    nowMs,
  });

  const visibleChips = chips.filter((chip) => chip.key !== "sort");

  if (visibleChips.length === 0) return null;

  return (
    <div data-active-filters className="flex flex-wrap items-center gap-2">
      {visibleChips.map((chip) => {
        const label = chipText(chip.key, chip.label);
        return (
          <span
            key={chip.key}
            data-chip={chipDataKey(chip.key)}
            className="inline-flex h-6 items-center gap-1 rounded-sm bg-brand-soft pl-2 pr-1 text-12 text-fg-1"
          >
            {label}
            <button
              type="button"
              aria-label={`去掉 ${label}`}
              className="rounded-sm p-0.5 text-fg-3 hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => removeChip(chip, setFilters)}
            >
              <X aria-hidden="true" size={12} />
            </button>
          </span>
        );
      })}
      <Button
        type="button"
        variant="link"
        size="sm"
        data-clear-filters
        className="text-brand"
        onClick={resetFilters}
      >
        清除筛选
      </Button>
    </div>
  );
}

export { ActiveFilterChips };
