import { middleEllipsis } from "@/lib/format";

function MonoPath({ path, max = 48 }: { path: string; max?: number }) {
  return (
    <code title={path} className="font-mono">
      {middleEllipsis(path, max)}
    </code>
  );
}

export { MonoPath };
