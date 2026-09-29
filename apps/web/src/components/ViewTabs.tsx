import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";

interface ViewTabItem {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

interface ViewTabsProps {
  items: ViewTabItem[];
  ariaLabel: string;
}

function ViewTabs({ items, ariaLabel }: ViewTabsProps) {
  return (
    <nav aria-label={ariaLabel} className="flex items-center gap-0.5">
      {items.map(({ key, label, to, icon: Icon, end }) => (
        <NavLink
          key={key}
          to={to}
          {...(end === undefined ? {} : { end })}
          data-view-tab={key}
          className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-12 font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg-1 aria-[current=page]:bg-selected aria-[current=page]:text-fg-1"
        >
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="max-md:sr-only">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export { ViewTabs };
