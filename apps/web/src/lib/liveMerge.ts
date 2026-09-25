import type { WorkerSummary } from "@fleet/core";

export function mergeLiveSummaries(
  snapshotWorkers: readonly WorkerSummary[],
  liveSummaries: readonly WorkerSummary[],
): WorkerSummary[] {
  const knownIds = new Set(snapshotWorkers.map((worker) => worker.id));
  return [...snapshotWorkers, ...liveSummaries.filter((worker) => !knownIds.has(worker.id))];
}
