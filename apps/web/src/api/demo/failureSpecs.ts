import { CHANNEL_FAIL, CLOUD, INFER, queuedSpec, UISTUDIO, WIKI, type WorkerSpec } from "./records";

/**
 * 故障场景：通道持续报错，dsf 的 6 个在跑苦工全部在重试、9 个在 10 分钟内失败、10 个排队。
 * 第一版 failure 的 26 个苦工原样保留，池名 glm 改成 glmf。
 */
export function failureWorkerSpecs(): WorkerSpec[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz";
  const id = (prefix: string, index: number): string => {
    const letter = alphabet[index % alphabet.length] ?? "a";
    const second = alphabet[(index * 7 + 3) % alphabet.length] ?? "b";
    return `w${prefix}${letter}${2 + (index % 8)}${second}${3 + (index % 7)}`;
  };
  const projects = [WIKI, CLOUD, INFER];
  const specs: WorkerSpec[] = [];
  for (let index = 0; index < 6; index += 1) {
    specs.push({
      id: id("f", index),
      project: projects[index % 3] ?? WIKI,
      pool: "dsf",
      role: "worker",
      title: `通道故障中的任务 ${index + 1}`,
      runs: [
        {
          status: "running",
          queuedMin: 6 + index,
          startedMin: 5 + index,
          retry: { attempt: 2 + (index % 6), max: 8, message: "Connection error." },
          tokens: 1_200,
        },
      ],
    });
  }
  for (let index = 0; index < 9; index += 1) {
    specs.push({
      id: id("g", index),
      project: projects[index % 3] ?? WIKI,
      pool: "dsf",
      role: index % 4 === 0 ? "reviewer" : "worker",
      title: `通道故障前派出的任务 ${index + 1}`,
      runs: [
        {
          status: "failed",
          queuedMin: 12 + index,
          startedMin: 11 + index,
          endedMin: 1 + index * 0.9,
          failReason: "model_error",
          errorMessage: CHANNEL_FAIL,
          tokens: 800,
        },
      ],
    });
  }
  for (let index = 0; index < 10; index += 1) {
    specs.push(
      queuedSpec(
        id("h", index),
        projects[index % 3] ?? WIKI,
        "dsf",
        "worker",
        `排队等待的任务 ${index + 1}`,
        5 - index * 0.4,
      ),
    );
  }
  specs.push({
    id: "wz2q3r",
    project: UISTUDIO,
    pool: "glmf",
    role: "worker",
    title: "组件库：按钮六态",
    runs: [
      {
        status: "running",
        queuedMin: 2.2,
        startedMin: 1.9,
        activity: "edit · src/components/Button.tsx",
        tokens: 14_800,
        costUsd: 0.006,
      },
    ],
  });
  return specs;
}
