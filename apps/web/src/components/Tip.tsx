import {
  TooltipProvider as RadixTooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";
import styles from "./Tip.module.css";

const { content: contentClass } = styles;

export interface TipProviderProps {
  children: ReactNode;
}

/** 挂在 App 根部一次：悬停延迟 150ms，同批多个提示卡之间不用再等延迟。 */
export function TipProvider({ children }: TipProviderProps) {
  return (
    <RadixTooltipProvider delayDuration={150} skipDelayDuration={0}>
      {children}
    </RadixTooltipProvider>
  );
}

export interface TipProps {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  /** 不传就是未受控（纯悬停）；键盘聚焦场景由调用方传 true 强制展开 */
  open?: boolean;
}

/** 悬浮提示卡：无箭头，Portal 到 body 避免被滚动容器裁切。 */
export function Tip({ content, children, side = "top", open }: TipProps) {
  const controlled = open === undefined ? {} : { open };
  return (
    <Tooltip {...controlled}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side={side} sideOffset={6} className={contentClass}>
          {content}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
