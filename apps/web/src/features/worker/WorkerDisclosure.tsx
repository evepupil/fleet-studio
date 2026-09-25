import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface WorkerDisclosureProps {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * 折叠面板：标题整行可点，箭头旋转 90°，内容区直接出现不做高度动画（动效纪律，见 DESIGN.md 第 3 章）。
 * 第一版是共享的 Disclosure，第二版换成 shadcn 的 Collapsible，这里包一层把原来的
 * data-disclosure / data-open 标记保留下来（交互检查用）。
 */
export function WorkerDisclosure({
  id,
  title,
  meta,
  defaultOpen,
  children,
}: WorkerDisclosureProps) {
  const [open, setOpen] = useState(() => defaultOpen ?? false);
  const openFlag = open ? "true" : "false";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="block"
      data-disclosure={id}
      data-open={openFlag}
    >
      <CollapsibleTrigger className="flex h-8 w-full items-center gap-2 rounded-md text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-hover">
        <ChevronRight
          aria-hidden
          size={12}
          data-open={openFlag}
          className="shrink-0 text-fg-3 transition-transform duration-[var(--dur-base)] ease-[var(--ease)] data-[open=true]:rotate-90"
        />
        <span className="min-w-0 flex-1 text-left text-14 font-semibold text-fg-1">{title}</span>
        {meta !== undefined && (
          <span className="min-w-0 max-w-2/5 shrink-0 truncate text-right text-12 text-fg-3">
            {meta}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
