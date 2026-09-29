import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  titleExtra?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  "data-section"?: string;
}

function Panel({
  title,
  titleExtra,
  right,
  children,
  className,
  bodyClassName,
  "data-section": dataSection,
}: PanelProps) {
  return (
    <section
      data-section={dataSection}
      className={`min-w-0 rounded-lg border border-line bg-card shadow-card ${className ?? ""}`}
    >
      {title || right ? (
        <header className="flex h-10 items-center gap-2 border-b border-line px-4">
          {title ? <h2 className="truncate text-13 font-medium text-fg-1">{title}</h2> : null}
          {titleExtra}
          <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
        </header>
      ) : null}
      <div className={bodyClassName ?? "p-4"}>{children}</div>
    </section>
  );
}

export { Panel };
