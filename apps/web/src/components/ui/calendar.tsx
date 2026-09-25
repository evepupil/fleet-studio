// biome-ignore-all lint/complexity/useLiteralKeys: DayPicker modifiers require index-signature access.
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { type DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaults = getDefaultClassNames();
  return (
    <div data-slot="calendar">
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("group/calendar w-fit bg-background p-3", className)}
        captionLayout={captionLayout}
        classNames={{
          root: cn("w-fit", defaults.root),
          months: cn("flex flex-col gap-4 lg:flex-row", defaults.months),
          month: cn("flex w-full flex-col gap-4", defaults.month),
          nav: cn("absolute inset-x-0 top-0 flex items-center justify-between", defaults.nav),
          button_previous: cn(
            buttonVariants({ variant: buttonVariant }),
            "size-8 p-0 aria-disabled:opacity-50",
            defaults.button_previous,
          ),
          button_next: cn(
            buttonVariants({ variant: buttonVariant }),
            "size-8 p-0 aria-disabled:opacity-50",
            defaults.button_next,
          ),
          month_caption: cn("flex h-8 items-center justify-center", defaults.month_caption),
          dropdowns: cn(
            "flex h-8 items-center justify-center gap-2 text-13 font-medium",
            defaults.dropdowns,
          ),
          dropdown_root: cn("relative rounded-md border border-input", defaults.dropdown_root),
          dropdown: cn("absolute inset-0 bg-popover opacity-0", defaults.dropdown),
          caption_label: cn("font-medium", defaults.caption_label),
          month_grid: cn("w-full border-collapse", defaults.month_grid),
          weekdays: cn("flex", defaults.weekdays),
          weekday: cn("flex-1 text-11 font-normal text-muted-foreground", defaults.weekday),
          week: cn("mt-1 flex w-full", defaults.week),
          day: cn("relative aspect-square h-full w-full p-0 text-center", defaults.day),
          range_start: cn("rounded-l-md bg-brand-soft", defaults.range_start),
          range_middle: cn("rounded-none bg-brand-soft", defaults.range_middle),
          range_end: cn("rounded-r-md bg-brand-soft", defaults.range_end),
          today: cn("rounded-md bg-hover text-fg-1", defaults.today),
          outside: cn("text-fg-3", defaults.outside),
          disabled: cn("text-fg-3 opacity-50", defaults.disabled),
          hidden: cn("invisible", defaults.hidden),
          ...classNames,
        }}
        components={{
          Chevron: ({ className: iconClass, orientation, ...iconProps }) => {
            if (orientation === "left") {
              return (
                <ChevronLeft
                  aria-hidden="true"
                  className={cn("size-4", iconClass)}
                  {...iconProps}
                />
              );
            }
            if (orientation === "right") {
              return (
                <ChevronRight
                  aria-hidden="true"
                  className={cn("size-4", iconClass)}
                  {...iconProps}
                />
              );
            }
            return (
              <ChevronDown aria-hidden="true" className={cn("size-4", iconClass)} {...iconProps} />
            );
          },
          DayButton: CalendarDayButton,
          ...components,
        }}
        {...props}
      />
    </div>
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaults = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);
  const focused = modifiers["focused"];
  React.useEffect(() => {
    if (focused) {
      ref.current?.focus();
    }
  }, [focused]);
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers["selected"] &&
        !modifiers["range_start"] &&
        !modifiers["range_end"] &&
        !modifiers["range_middle"]
      }
      data-range-start={modifiers["range_start"]}
      data-range-end={modifiers["range_end"]}
      data-range-middle={modifiers["range_middle"]}
      className={cn(
        "flex aspect-square size-8 min-w-8 flex-col p-0 text-13 font-normal data-[range-start=true]:rounded-l-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-brand-soft data-[range-middle=true]:text-fg-1 data-[range-start=true]:bg-brand data-[range-end=true]:bg-brand data-[selected-single=true]:bg-brand data-[selected-single=true]:text-on-brand",
        defaults.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
