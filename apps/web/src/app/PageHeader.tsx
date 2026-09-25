import type { ReactNode } from "react";
import { useEffect } from "react";

interface PageHeaderProps {
  title: string;
  right?: ReactNode;
}

function PageHeader({ title, right }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · fleet studio`;
  }, [title]);

  return (
    <header
      data-page-header
      className="sticky top-0 z-[var(--z-sticky)] flex h-[var(--header-h)] shrink-0 items-center gap-4 border-b border-line bg-panel px-6 max-[799px]:px-4"
    >
      <h1 className="truncate text-16 font-semibold text-fg-1">{title}</h1>
      {right ? <div className="ml-auto flex items-center gap-3">{right}</div> : null}
    </header>
  );
}

export { PageHeader };
