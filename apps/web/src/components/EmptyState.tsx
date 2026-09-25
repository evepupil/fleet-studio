import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  message: string;
  command?: string;
  action?: { label: string; onClick(): void };
  icon?: LucideIcon;
}

function EmptyState({ message, command, action, icon: Icon }: EmptyStateProps) {
  return (
    <section
      data-empty
      className="flex flex-col items-center justify-center gap-2 py-12 text-center"
    >
      {Icon ? <Icon aria-hidden="true" className="size-5 text-fg-3" /> : null}
      <p className="text-13 text-fg-2">{message}</p>
      {command ? (
        <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-12 text-fg-1">
          {command}
        </code>
      ) : null}
      {action ? (
        <Button type="button" variant="link" onClick={action.onClick} className="text-brand">
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}

export { EmptyState };
