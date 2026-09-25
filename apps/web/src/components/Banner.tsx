import { TriangleAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

interface BannerProps {
  kind: "offline" | "config" | "warning";
  children: ReactNode;
  title?: string;
}

function Banner({ kind, children, title }: BannerProps) {
  const Icon = kind === "offline" ? WifiOff : TriangleAlert;
  return (
    <div
      data-banner={kind}
      role="status"
      title={title}
      className="flex h-8 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-line bg-status-warning-soft px-4 text-12 text-fg-1"
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-status-warning" />
      <div className="min-w-0 truncate">{children}</div>
    </div>
  );
}

export { Banner };
