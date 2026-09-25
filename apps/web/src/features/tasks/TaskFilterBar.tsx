import type { TaskStatusFilter } from "@fleet/core";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProjects } from "@/api/queries";
import { ColorDot } from "@/components/ColorDot";
import { RangePicker } from "@/components/RangePicker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projectColorVar } from "@/lib/colors";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

const ALL_PROJECTS = "__all_projects__";
const ALL_POOLS = "__all_pools__";
const ALL_ROLES = "__all_roles__";

const STATUS_OPTIONS: { value: TaskStatusFilter; label: string }[] = [
  { value: "active", label: "进行中" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "工作中" },
  { value: "retrying", label: "重试中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
  { value: "all", label: "全部" },
];

function TaskFilterBar() {
  const filters = useTaskFilterStore((state) => state);
  const setFilters = useTaskFilterStore((state) => state.set);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const projects = useProjects();
  const [searchValue, setSearchValue] = useState(filters.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  function commitSearch(value: string): void {
    clearSearchTimer();
    setFilters({ q: value });
  }

  // 仓库被外部重置时同步输入框，并取消尚未提交的旧搜索。
  useEffect(() => {
    setSearchValue(filters.q);
    clearSearchTimer();
  }, [filters.q, clearSearchTimer]);

  useEffect(
    () => () => {
      clearSearchTimer();
    },
    [clearSearchTimer],
  );

  const selectedProject = projects.data?.find((project) => project.key === filters.project);
  const selectedPool = snapshot?.pools.find((pool) => pool.id === filters.pool);
  const selectedRole = snapshot?.roles.find((role) => role.id === filters.role);
  const selectedStatus = STATUS_OPTIONS.find((option) => option.value === filters.status);

  return (
    <section
      data-task-filters
      className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3"
    >
      <Select
        value={filters.status}
        onValueChange={(value) => {
          const next = STATUS_OPTIONS.find((option) => option.value === value);
          if (next !== undefined) setFilters({ status: next.value });
        }}
      >
        <SelectTrigger
          data-filter="status"
          aria-label="状态"
          className="h-8 w-[136px] bg-panel px-2 text-12"
        >
          <SelectValue>
            <span className="truncate">状态：{selectedStatus?.label ?? "进行中"}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.project ?? ALL_PROJECTS}
        onValueChange={(value) =>
          setFilters({ project: value === ALL_PROJECTS ? undefined : value })
        }
      >
        <SelectTrigger
          data-filter="project"
          aria-label="项目"
          className="h-8 w-[168px] bg-panel px-2 text-12"
        >
          <SelectValue>
            <span className="truncate">
              {filters.project === undefined
                ? "全部项目"
                : (selectedProject?.name ?? filters.project)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PROJECTS}>全部项目</SelectItem>
          {(projects.data ?? []).map((project) => (
            <SelectItem key={project.key} value={project.key}>
              <ColorDot colorVar={projectColorVar(project.colorIndex)} size={8} />
              <span className="truncate">{project.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.pool ?? ALL_POOLS}
        onValueChange={(value) => setFilters({ pool: value === ALL_POOLS ? undefined : value })}
      >
        <SelectTrigger
          data-filter="pool"
          aria-label="池"
          className="h-8 w-[144px] bg-panel px-2 text-12"
        >
          <SelectValue>
            <span className="truncate">
              {filters.pool === undefined ? "全部池" : (selectedPool?.id ?? filters.pool)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_POOLS}>全部池</SelectItem>
          {(snapshot?.pools ?? []).map((pool) => (
            <SelectItem key={pool.id} value={pool.id}>
              <span className="font-mono">{pool.id}</span>
              <span className="truncate text-fg-3">{pool.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.role ?? ALL_ROLES}
        onValueChange={(value) => setFilters({ role: value === ALL_ROLES ? undefined : value })}
      >
        <SelectTrigger
          data-filter="role"
          aria-label="角色"
          className="h-8 w-[128px] bg-panel px-2 text-12"
        >
          <SelectValue>
            <span className="truncate">
              {filters.role === undefined ? "全部角色" : (selectedRole?.label ?? filters.role)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ROLES}>全部角色</SelectItem>
          {(snapshot?.roles ?? []).map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div data-filter="range" className="inline-flex">
        <RangePicker
          value={filters.range}
          onChange={(range) => setFilters({ range })}
          variant="select"
          name="tasks-range"
        />
      </div>

      <div className="relative ml-auto w-full basis-full xl:w-[240px] xl:basis-auto">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-3"
        />
        <Input
          data-filter="q"
          aria-label="搜索标题"
          placeholder="搜索标题"
          value={searchValue}
          className="h-8 pl-8 pr-8 text-12"
          onChange={(event) => {
            const next = event.currentTarget.value;
            setSearchValue(next);
            clearSearchTimer();
            searchTimer.current = setTimeout(() => {
              setFilters({ q: next });
              searchTimer.current = null;
            }, 300);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitSearch(searchValue);
          }}
        />
        {searchValue.length > 0 ? (
          <button
            type="button"
            aria-label="清空搜索"
            className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            onClick={() => {
              setSearchValue("");
              commitSearch("");
            }}
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

export { TaskFilterBar };
