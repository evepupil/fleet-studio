import type { ReactNode } from "react";

function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-filter-bar
      className="flex h-[var(--filter-bar-h)] shrink-0 items-center gap-2 border-b border-line px-4 max-md:overflow-x-auto max-md:px-3"
    >
      {children}
    </div>
  );
}

export { FilterBar };
