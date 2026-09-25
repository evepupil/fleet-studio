import type { Snapshot } from "@fleet/core";

export function activitySignature(snapshot: Snapshot): string {
  const activeWorkers = snapshot.workers
    .filter((worker) => worker.status === "queued" || worker.status === "running")
    .map((worker) => `${worker.id}:${worker.status}:${worker.runSeq}`)
    .sort();
  const { slotsUsed, slotsTotal, running, queued, retrying } = snapshot.live;
  return `${activeWorkers.join("|")}#${slotsUsed}:${slotsTotal}:${running}:${queued}:${retrying}`;
}
