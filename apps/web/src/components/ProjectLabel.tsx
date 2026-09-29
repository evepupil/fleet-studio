import { Label } from "@/components/Label";
import { projectColorVar } from "@/lib/colors";
import { useProjectLookup } from "@/state/useProjectLookup";

function ProjectLabel({ projectKey }: { projectKey: string }) {
  const lookup = useProjectLookup();
  const project = lookup(projectKey);
  return (
    <Label
      data-label="project"
      {...(project.colorIndex === undefined
        ? {}
        : { colorVar: projectColorVar(project.colorIndex) })}
      title={project.name}
    >
      {project.name}
    </Label>
  );
}

export { ProjectLabel };
