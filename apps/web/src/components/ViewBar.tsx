import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

interface ViewBarProps {
  icon?: LucideIcon;
  title: ReactNode;
  documentTitle: string;
  children?: ReactNode;
  right?: ReactNode;
}

function ViewBar({ icon: Icon, title, documentTitle, children, right }: ViewBarProps) {
  useEffect(() => {
    document.title = `${documentTitle} · fleet studio`;
  }, [documentTitle]);

  return (
    <div
      data-view-bar
      className="flex h-[var(--view-bar-h)] shrink-0 items-center gap-3 border-b border-line px-4 max-md:px-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-fg-3" /> : null}
        <h1 className="flex min-w-0 items-center gap-1.5 truncate text-13 font-medium text-fg-1">
          {title}
        </h1>
      </div>
      {children}
      <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}

export { ViewBar };
