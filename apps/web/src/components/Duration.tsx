import { elapsedMs, formatDuration } from "@/lib/format";
import { useNow } from "@/state/nowStore";

interface DurationProps {
  ms?: number | null;
  from?: string | null;
  to?: string | null;
}

function Duration({ ms, from, to = null }: DurationProps) {
  const nowMs = useNow();
  const duration = ms ?? elapsedMs(from ?? null, to, nowMs);
  return (
    <span className="font-mono tabular-nums">
      {duration === null ? "—" : formatDuration(duration)}
    </span>
  );
}

export { Duration };
