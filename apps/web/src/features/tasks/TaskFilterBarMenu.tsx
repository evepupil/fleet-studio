import { ListFilter } from "lucide-react";
import { useMemo } from "react";
import { useProjects } from "@/api/queries";
import { ColorDot } from "@/components/ColorDot";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { projectColorVar } from "@/lib/colors";
import { TASK_STATUS_OPTIONS, type TaskView } from "@/lib/taskFilters";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

const ALL_VALUE = "__all__";

interface ProjectOption {
  key: string;
  name: string;
  colorIndex: number;
}

function TaskFilterBarMenu({ view }: { view: TaskView }) {
  const filters = useTaskFilterStore((state) => state);
  const set = useTaskFilterStore((state) => state.set);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const projectsQuery = useProjects();
  const projects = useMemo(() => {
    const projectsByKey = new Map<string, ProjectOption>();
    for (const project of projectsQuery.data ?? []) {
      projectsByKey.set(project.key, {
        key: project.key,
        name: project.name,
        colorIndex: project.colorIndex,
      });
    }
    for (const project of snapshot?.projects ?? []) {
      if (!projectsByKey.has(project.key)) {
        projectsByKey.set(project.key, {
          key: project.key,
          name: project.name,
          colorIndex: project.colorIndex,
        });
      }
    }
    return Array.from(projectsByKey.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [projectsQuery.data, snapshot?.projects]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" data-filter-trigger className="shrink-0">
          <ListFilter aria-hidden="true" />
          筛选
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-filter-menu align="start">
        {view === "list" ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-filter-field="status">状态</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
              <DropdownMenuRadioGroup
                value={filters.status}
                onValueChange={(value) => {
                  const option = TASK_STATUS_OPTIONS.find((item) => item.value === value);
                  if (option !== undefined) set({ status: option.value });
                }}
              >
                {TASK_STATUS_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    data-filter-option={`status:${option.value}`}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-filter-field="project">项目</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
            <DropdownMenuRadioGroup
              value={filters.project ?? ALL_VALUE}
              onValueChange={(value) => set({ project: value === ALL_VALUE ? undefined : value })}
            >
              <DropdownMenuRadioItem value={ALL_VALUE} data-filter-option="project:__all__">
                全部项目
              </DropdownMenuRadioItem>
              {projects.map((project) => (
                <DropdownMenuRadioItem
                  key={project.key}
                  value={project.key}
                  data-filter-option={`project:${project.key}`}
                >
                  <ColorDot colorVar={projectColorVar(project.colorIndex)} size={8} />
                  <span className="max-w-[220px] truncate" title={project.name}>
                    {project.name}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-filter-field="pool">池</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
            <DropdownMenuRadioGroup
              value={filters.pool ?? ALL_VALUE}
              onValueChange={(value) => set({ pool: value === ALL_VALUE ? undefined : value })}
            >
              <DropdownMenuRadioItem value={ALL_VALUE} data-filter-option="pool:__all__">
                全部池
              </DropdownMenuRadioItem>
              {(snapshot?.pools ?? []).map((pool) => (
                <DropdownMenuRadioItem
                  key={pool.id}
                  value={pool.id}
                  data-filter-option={`pool:${pool.id}`}
                >
                  <span className="truncate">
                    <span className="font-mono">{pool.id}</span>{" "}
                    <span className="text-fg-3">{pool.label}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-filter-field="role">角色</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
            <DropdownMenuRadioGroup
              value={filters.role ?? ALL_VALUE}
              onValueChange={(value) => set({ role: value === ALL_VALUE ? undefined : value })}
            >
              <DropdownMenuRadioItem value={ALL_VALUE} data-filter-option="role:__all__">
                全部角色
              </DropdownMenuRadioItem>
              {(snapshot?.roles ?? []).map((role) => (
                <DropdownMenuRadioItem
                  key={role.id}
                  value={role.id}
                  data-filter-option={`role:${role.id}`}
                >
                  {role.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { TaskFilterBarMenu };
