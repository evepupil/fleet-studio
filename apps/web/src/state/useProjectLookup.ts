import { useMemo } from "react";
import { useProjects } from "@/api/queries";
import { useSnapshotStore } from "@/state/snapshotStore";

interface ProjectLookupValue {
  name: string;
  colorIndex: number | undefined;
}

export function useProjectLookup(): (projectKey: string) => ProjectLookupValue {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const projectsQuery = useProjects();
  const lookup = useMemo(() => {
    const projects = new Map<string, ProjectLookupValue>();
    for (const project of snapshot?.projects ?? []) {
      projects.set(project.key, { name: project.name, colorIndex: project.colorIndex });
    }
    for (const project of projectsQuery.data ?? []) {
      if (!projects.has(project.key)) {
        projects.set(project.key, { name: project.name, colorIndex: project.colorIndex });
      }
    }
    return projects;
  }, [snapshot?.projects, projectsQuery.data]);

  return useMemo(
    () => (projectKey: string) =>
      lookup.get(projectKey) ?? {
        name: projectKey.split(/[\\/]/).at(-1) ?? projectKey,
        colorIndex: undefined,
      },
    [lookup],
  );
}
