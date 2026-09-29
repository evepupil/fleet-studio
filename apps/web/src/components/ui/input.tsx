import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-md border border-line bg-card px-2 text-12 text-fg-1 shadow-card outline-none placeholder:text-fg-3 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-soft disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
