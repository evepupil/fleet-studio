import { ColorDot } from "@/components/ColorDot";

interface SeriesLegendItem {
  key: string;
  label: string;
  colorVar: string;
  hidden?: boolean;
}

interface SeriesLegendProps {
  items: readonly SeriesLegendItem[];
  onToggle?: (key: string) => void;
}

function SeriesLegend({ items, onToggle }: SeriesLegendProps) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-12">
      {items.map((item) => {
        const content = (
          <>
            <ColorDot colorVar={item.colorVar} />
            <span
              className={`min-w-0 truncate text-fg-2 ${item.hidden ? "text-fg-3 line-through" : ""}`}
            >
              {item.label}
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {onToggle ? (
              <button
                type="button"
                data-legend={item.key}
                aria-pressed={!item.hidden}
                onClick={() => onToggle(item.key)}
                className="inline-flex max-w-full items-center gap-2"
              >
                {content}
              </button>
            ) : (
              <span className="inline-flex max-w-full items-center gap-2">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export { SeriesLegend };
