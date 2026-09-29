import type { ReactNode } from "react";
import { ColorDot } from "@/components/ColorDot";

interface LabelProps {
  children: ReactNode;
  colorVar?: string;
  title?: string;
  "data-label"?: string;
  className?: string;
}

function Label({ children, colorVar, title, "data-label": dataLabel, className }: LabelProps) {
  return (
    <span
      data-label={dataLabel}
      title={title}
      className={`inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-sm border border-line bg-card px-1.5 text-12 text-fg-2 ${className ?? ""}`}
    >
      {colorVar ? <ColorDot colorVar={colorVar} size={6} /> : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export { Label };
