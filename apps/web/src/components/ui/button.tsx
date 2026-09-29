import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-12 font-medium whitespace-nowrap transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand hover:brightness-110 active:brightness-95",
        destructive: "bg-status-failed text-on-brand hover:brightness-110 active:brightness-95",
        outline: "border border-line bg-card text-fg-1 shadow-card hover:bg-raised",
        secondary: "bg-raised text-fg-1 hover:bg-hover",
        ghost: "text-fg-2 hover:bg-hover hover:text-fg-1",
        link: "h-auto px-0 text-brand hover:underline underline-offset-2",
      },
      size: {
        default: "h-7 px-2.5",
        sm: "h-6 px-2",
        xs: "h-6 px-2",
        lg: "h-8 px-3",
        icon: "size-7",
        "icon-sm": "size-6",
        "icon-xs": "size-6",
        "icon-lg": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
