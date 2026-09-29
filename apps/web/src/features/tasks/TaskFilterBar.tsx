import { X } from "lucide-react";
import { useProjects } from "@/api/queries";
import { FilterBar } from "@/components/FilterBar";
import { RangePicker } from "@/components/RangePicker";
import { Button } from "@/components/ui/button";
import { TaskFilterBarMenu } from "@/features/tasks/TaskFilterBarMenu";
import { TaskFilterBarSearch } from "@/features/tasks/TaskFilterBarSearch";
import type { TaskView } from "@/lib/taskFilters";
import { activeFilterChips, chipResetPatch, hasActiveFilters } from "@/lib/taskFilters";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

function TaskFilterBar({ view }: { view: TaskView }) {
  const filters = useTaskFilterStore((state) => state);
  const set = useTaskFilterStore((state) => state.set);
  const reset = useTaskFilterStore((state) => state.reset);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const projectsQuery = useProjects();
  const projects = new Map<string, string>();
  for (const project of projectsQuery.data ?? []) {
    projects.set(project.key, project.name);
  }
  for (const project of snapshot?.projects ?? []) {
    if (!projects.has(project.key)) projects.set(project.key, project.name);
  }
  const pools = new Map<string, string>();
  for (const pool of snapshot?.pools ?? []) {
    pools.set(pool.id, pool.id);
  }
  const roles = new Map<string, string>();
  for (const role of snapshot?.roles ?? []) {
    roles.set(role.id, role.label);
  }
  const chips = activeFilterChips(filters, { projects, pools, roles }, view);

  return (
    <FilterBar>
      <TaskFilterBarMenu view={view} />
      <div data-active-filters className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {chips.map((chip) => (
          <span
            key={chip.key}
            data-chip={chip.key}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-line bg-card pl-2 pr-0.5 text-12 text-fg-1 shadow-card"
          >
            <span className="max-w-[200px] truncate" title={chip.label}>
              {chip.label}
            </span>
            <button
              type="button"
              aria-label={`去掉 ${chip.label}`}
              className="grid size-5 place-items-center rounded-sm text-fg-3 transition-colors hover:bg-hover hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => set(chipResetPatch(chip.key))}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ))}
        {hasActiveFilters(filters, view) ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            data-clear-filters
            className="shrink-0"
            onClick={reset}
          >
            清除筛选
          </Button>
        ) : null}
      </div>
      {view === "list" ? (
        <div data-filter="range" className="shrink-0">
          <RangePicker
            variant="select"
            name="tasks-range"
            value={filters.range}
            onChange={(range) => set({ range })}
          />
        </div>
      ) : null}
      <TaskFilterBarSearch />
    </FilterBar>
  );
}

export { TaskFilterBar };
