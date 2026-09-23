import { describe, expect, it } from "vitest";
import { createRepos } from "../../src/store/index.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./factories.js";
import { createTempDbPath } from "./tempDb.js";

describe("createRepos", () => {
  it("三个仓库装在一起能直接串起来用（项目 -> 苦工 -> 运行）", () => {
    const repos = createRepos(":memory:");
    repos.projects.insert(createProjectRecord({ key: "p1" }));
    repos.workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
    repos.runs.insert(createRunRecord({ id: "w1.1", workerId: "w1" }));

    expect(repos.projects.get("p1")).not.toBeNull();
    expect(repos.workers.get("w1")?.projectKey).toBe("p1");
    expect(repos.runs.get("w1.1")?.workerId).toBe("w1");
    repos.close();
  });

  describe("transaction", () => {
    it("正常返回时提交，返回值原样透传", () => {
      const repos = createRepos(":memory:");
      const result = repos.transaction(() => {
        repos.projects.insert(createProjectRecord({ key: "p1" }));
        return 42;
      });
      expect(result).toBe(42);
      expect(repos.projects.get("p1")).not.toBeNull();
      repos.close();
    });

    it("抛异常时整体回滚，异常原样抛给调用方", () => {
      const repos = createRepos(":memory:");
      expect(() =>
        repos.transaction(() => {
          repos.projects.insert(createProjectRecord({ key: "p1" }));
          throw new Error("故意失败");
        }),
      ).toThrow("故意失败");
      expect(repos.projects.get("p1")).toBeNull();
      repos.close();
    });

    it("嵌套调用：内层失败但被外层捕获时，只回滚内层的改动", () => {
      const repos = createRepos(":memory:");
      const result = repos.transaction(() => {
        repos.projects.insert(createProjectRecord({ key: "outer" }));
        try {
          repos.transaction(() => {
            repos.projects.insert(createProjectRecord({ key: "inner" }));
            throw new Error("内层故意失败");
          });
        } catch {
          // 外层认为这个内层操作是可选的，吞掉继续。
        }
        return "outer-committed";
      });

      expect(result).toBe("outer-committed");
      expect(repos.projects.get("outer")).not.toBeNull();
      expect(repos.projects.get("inner")).toBeNull();
      repos.close();
    });

    it("嵌套调用：内层失败且未被捕获时，外层也整体回滚", () => {
      const repos = createRepos(":memory:");
      expect(() =>
        repos.transaction(() => {
          repos.projects.insert(createProjectRecord({ key: "outer" }));
          repos.transaction(() => {
            repos.projects.insert(createProjectRecord({ key: "inner" }));
            throw new Error("内层故意失败");
          });
        }),
      ).toThrow("内层故意失败");

      expect(repos.projects.get("outer")).toBeNull();
      expect(repos.projects.get("inner")).toBeNull();
      repos.close();
    });
  });

  it("close：调用后底层连接关闭，之后的操作会报错", () => {
    const repos = createRepos(":memory:");
    expect(() => repos.close()).not.toThrow();
    expect(() => repos.projects.list()).toThrow();
  });

  it("文件数据库：数据在关闭重开后仍然还在", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      const first = createRepos(dbPath);
      first.projects.insert(createProjectRecord({ key: "p1" }));
      first.close();

      const second = createRepos(dbPath);
      expect(second.projects.get("p1")).not.toBeNull();
      second.close();
    } finally {
      cleanup();
    }
  });
});
