import { Clock, RotateCw } from "lucide-react";
import { Duration } from "@/components/Duration";
import type { CardMeta } from "@/lib/board";

const TONE: Record<CardMeta["kind"], string> = {
  queue: "text-fg-2",
  elapsed: "text-fg-2",
  retry: "text-status-warning",
  duration: "text-fg-2",
  failure: "text-status-failed",
};

function TaskBoardCardMeta({ meta }: { meta: CardMeta }) {
  return (
    <span
      data-card-meta={meta.kind}
      className={`inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-sm border border-line bg-card px-1.5 text-12 ${TONE[meta.kind]}`}
    >
      {meta.kind === "elapsed" || meta.kind === "duration" ? (
        <Clock aria-hidden="true" className="size-3 shrink-0 text-fg-3" />
      ) : null}
      {meta.kind === "retry" ? <RotateCw aria-hidden="true" className="size-3 shrink-0" /> : null}
      {meta.kind === "queue" || meta.kind === "retry" ? meta.text : null}
      {meta.kind === "elapsed" ? <Duration from={meta.from} /> : null}
      {meta.kind === "duration" ? <Duration ms={meta.ms} /> : null}
      {meta.kind === "failure" ? <span className="truncate">{meta.text}</span> : null}
    </span>
  );
}

export { TaskBoardCardMeta };
