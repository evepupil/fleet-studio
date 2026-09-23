import { TriangleAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Banner.module.css";

const { root, icon, text } = styles;

export interface BannerProps {
  kind: "offline" | "config";
  children: ReactNode;
}

/** 断线或配置出错时顶栏下方的提示条；文字单行省略，字符串类的 children 会把全文放进 title。 */
export function Banner({ kind, children }: BannerProps) {
  const Icon = kind === "offline" ? WifiOff : TriangleAlert;
  const title = typeof children === "string" ? children : undefined;
  return (
    <div className={root} data-banner={kind}>
      <Icon aria-hidden size={14} className={icon} />
      <span className={text} title={title}>
        {children}
      </span>
    </div>
  );
}
