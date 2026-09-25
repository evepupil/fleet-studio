import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface SectionCardProps {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-section"?: string;
}

function SectionCard({
  title,
  right,
  children,
  className,
  "data-section": dataSection,
}: SectionCardProps) {
  return (
    <Card
      data-section={dataSection}
      className={`rounded-lg border border-line bg-panel p-5 shadow-none ${className ?? ""}`}
    >
      {title || right ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-14 font-semibold">{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </Card>
  );
}

export { SectionCard };
