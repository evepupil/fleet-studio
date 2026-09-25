import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

interface SegmentedControlProps<Value extends string> {
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  ariaLabel: string;
  name: string;
  size?: "sm" | "md";
}

function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  name,
  size = "md",
}: SegmentedControlProps<Value>) {
  const small = size === "sm";
  return (
    <ToggleGroup
      type="single"
      value={value}
      aria-label={ariaLabel}
      data-control={name}
      onValueChange={(nextValue: string) => {
        if (nextValue !== "") onChange(nextValue as Value);
      }}
      className={`inline-flex rounded-md border border-line bg-panel p-0.5 ${small ? "h-7" : "h-8"}`}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          data-seg={`${name}:${option.value}`}
          className={`rounded-sm text-12 text-fg-2 hover:bg-hover data-[state=on]:bg-brand-soft data-[state=on]:text-brand ${small ? "h-6 px-2" : "h-7 px-3"} disabled:pointer-events-none disabled:text-fg-3`}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { SegmentedControl };
