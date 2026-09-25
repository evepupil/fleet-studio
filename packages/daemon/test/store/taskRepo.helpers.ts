import type { RunRecord, RunStatus } from "@fleet/core";
import type { Repos, TaskQueryInput } from "../../src/store/types.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./factories.js";

export interface TaskSeed {
  id: string;
  projectKey?: string;
  poolId?: string | null;
  role?: string;
  title?: string;
  createdAt?: string;
  status?: RunStatus;
  runs?: Array<Partial<RunRecord>>;
}

export function addTask(repos: Repos, seed: TaskSeed): void {
  const projectKey = seed.projectKey ?? "p1";
  if (repos.projects.get(projectKey) === null) {
    repos.projects.insert(createProjectRecord({ key: projectKey, path: projectKey }));
  }
  const runs = seed.runs ?? [{}];
  repos.workers.insert(
    createWorkerRecord({
      id: seed.id,
      projectKey,
      poolId: seed.poolId === undefined ? "pool-a" : seed.poolId,
      role: seed.role ?? "worker",
      title: seed.title ?? seed.id,
      createdAt: seed.createdAt ?? "2026-01-01T00:00:00.000Z",
      latestRunSeq: runs.length,
    }),
  );
  for (const [index, run] of runs.entries()) {
    const seq = index + 1;
    const isLatest = seq === runs.length;
    repos.runs.insert(
      createRunRecord({
        ...run,
        id: `${seed.id}.${seq}`,
        workerId: seed.id,
        seq,
        status: isLatest ? (seed.status ?? run.status ?? "completed") : (run.status ?? "completed"),
        queuedAt: run.queuedAt ?? seed.createdAt ?? "2026-01-01T00:00:00.000Z",
      }),
    );
  }
}

export function taskQuery(overrides: Partial<TaskQueryInput> = {}): TaskQueryInput {
  return {
    status: "all",
    createdFrom: null,
    createdTo: "2027-01-01T00:00:00.000Z",
    sort: "createdAt",
    order: "desc",
    limit: 100,
    ...overrides,
  };
}
