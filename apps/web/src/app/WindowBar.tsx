import { PanelLeft, Search } from "lucide-react";
import { Link } from "react-router";
import { Kbd } from "@/components/Kbd";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSearchStore } from "@/state/searchStore";
import { useSidebarStore } from "@/state/sidebarStore";
import { useSnapshotStore } from "@/state/snapshotStore";

function WindowBar() {
  const wide = useMediaQuery("(min-width: 1024px)");
  const mobile = useMediaQuery("(max-width: 799px)");
  const open = useSidebarStore((state) => state.open);
  const toggleSidebar = useSidebarStore((state) => state.toggle);
  const setDrawerOpen = useSidebarStore((state) => state.setDrawerOpen);
  const setSearchOpen = useSearchStore((state) => state.setOpen);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const queued = snapshot?.live.queued ?? 0;
  const slots = snapshot === null ? null : `${snapshot.live.slotsUsed}/${snapshot.live.slotsTotal}`;
  const shortcut =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac") ? "⌘K" : "Ctrl K";
  const search = () => setSearchOpen(true);

  return (
    <header
      data-window-bar
      className="relative flex h-[var(--window-bar-h)] shrink-0 items-center gap-2 px-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-sidebar-toggle
        aria-label={wide ? (open ? "收起侧栏" : "展开侧栏") : "打开侧栏"}
        aria-pressed={wide ? open : undefined}
        onClick={() => (wide ? toggleSidebar() : setDrawerOpen(true))}
      >
        <PanelLeft aria-hidden="true" className="size-4" />
      </Button>
      {mobile ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-search-trigger
          aria-label="搜索任务"
          aria-keyshortcuts="Control+K"
          onClick={search}
        >
          <Search aria-hidden="true" className="size-4" />
        </Button>
      ) : (
        <button
          type="button"
          data-search-trigger
          aria-label="搜索任务"
          aria-keyshortcuts="Control+K"
          onClick={search}
          className="absolute left-1/2 top-1/2 flex h-7 w-[320px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border border-line bg-card px-2 text-12 text-fg-3 shadow-card transition-colors hover:border-line-strong hover:text-fg-2"
        >
          <Search aria-hidden="true" className="size-3.5 shrink-0" />
          <span>搜索任务</span>
          <span className="ml-auto">
            <Kbd>{shortcut}</Kbd>
          </span>
        </button>
      )}
      {slots !== null ? (
        <Link
          to="/slots"
          data-occupancy
          aria-label={`槽位 ${slots}${queued > 0 ? `，排队 ${queued}` : ""}，打开槽位页`}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-12 text-fg-2 transition-colors hover:bg-hover hover:text-fg-1"
        >
          <span className="max-md:hidden">槽位</span>
          <span className="font-mono text-fg-1">{slots}</span>
          {queued > 0 ? (
            <>
              <span aria-hidden="true" className="max-md:hidden">
                ·
              </span>
              <span className="max-md:hidden">排队</span>
              <span className="font-mono text-fg-1 max-md:hidden">{queued}</span>
            </>
          ) : null}
        </Link>
      ) : null}
    </header>
  );
}

export { WindowBar };
