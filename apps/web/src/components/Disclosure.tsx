import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import styles from "./Disclosure.module.css";

const { root, trigger, chevron, title: titleClass, meta: metaClass } = styles;

export interface DisclosureProps {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** 折叠面板：标题整行可点，箭头旋转 90°，内容区直接出现不做高度动画。 */
export function Disclosure({ id, title, meta, defaultOpen, children }: DisclosureProps) {
  const [open, setOpen] = useState(() => defaultOpen ?? false);
  const openFlag = open ? "true" : "false";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={root}
      data-disclosure={id}
      data-open={openFlag}
    >
      <CollapsibleTrigger className={trigger}>
        <ChevronRight aria-hidden size={12} className={chevron} data-open={openFlag} />
        <span className={titleClass}>{title}</span>
        {meta !== undefined && <span className={metaClass}>{meta}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
