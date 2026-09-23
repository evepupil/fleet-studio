import { isFleetError } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { createProjectRepo, createWorkerRepo, openDatabase } from "../../src/store/index.js";
import { createProjectRecord, createWorkerRecord } from "./factories.js";

describe("projectRepo", () => {
  it("get：不存在的 key 返回 null", () => {
    const repo = createProjectRepo(openDatabase(":memory:"));
    expect(repo.get("missing")).toBeNull();
  });

  it("insert 后 get 拿到的字段和写入的一致", () => {
    const repo = createProjectRepo(openDatabase(":memory:"));
    const project = createProjectRecord({
      key: "k1",
      path: "C:/code/p1",
      name: "p1",
      colorIndex: 3,
    });
    repo.insert(project);
    expect(repo.get("k1")).toEqual(project);
  });

  it("list：按创建时间升序，不按插入顺序", () => {
    const repo = createProjectRepo(openDatabase(":memory:"));
    repo.insert(createProjectRecord({ key: "b", createdAt: "2026-01-02T00:00:00.000Z" }));
    repo.insert(createProjectRecord({ key: "a", createdAt: "2026-01-01T00:00:00.000Z" }));
    expect(repo.list().map((project) => project.key)).toEqual(["a", "b"]);
  });

  it("colorIndicesInUse：只统计 since 之后有苦工创建的项目颜色，且去重", () => {
    const db = openDatabase(":memory:");
    const projects = createProjectRepo(db);
    const workers = createWorkerRepo(db);
    projects.insert(createProjectRecord({ key: "p1", colorIndex: 0 }));
    projects.insert(createProjectRecord({ key: "p2", colorIndex: 1 }));
    projects.insert(createProjectRecord({ key: "p3", colorIndex: 0 })); // 和 p1 撞色
    projects.insert(createProjectRecord({ key: "p4", colorIndex: 2 })); // 没有苦工，不计入

    workers.insert(
      createWorkerRecord({ id: "w1", projectKey: "p1", createdAt: "2026-02-01T00:00:00.000Z" }),
    );
    workers.insert(
      createWorkerRecord({ id: "w2", projectKey: "p2", createdAt: "2026-01-01T00:00:00.000Z" }), // 早于 since
    );
    workers.insert(
      createWorkerRecord({ id: "w3", projectKey: "p3", createdAt: "2026-02-02T00:00:00.000Z" }),
    );

    const result = projects.colorIndicesInUse("2026-01-15T00:00:00.000Z");
    expect(result).toEqual([0]);
  });

  it("deleteOrphansCreatedBefore：只删没有苦工、且早于 before 的项目", () => {
    const db = openDatabase(":memory:");
    const projects = createProjectRepo(db);
    const workers = createWorkerRepo(db);
    projects.insert(
      createProjectRecord({ key: "old-orphan", createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    projects.insert(
      createProjectRecord({ key: "old-with-worker", createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    projects.insert(
      createProjectRecord({ key: "new-orphan", createdAt: "2026-03-01T00:00:00.000Z" }),
    );
    workers.insert(createWorkerRecord({ id: "w1", projectKey: "old-with-worker" }));

    const removed = projects.deleteOrphansCreatedBefore("2026-02-01T00:00:00.000Z");

    expect(removed).toBe(1);
    expect(projects.get("old-orphan")).toBeNull();
    expect(projects.get("old-with-worker")).not.toBeNull();
    expect(projects.get("new-orphan")).not.toBeNull();
  });

  it("损坏记录：color_index 不是整数时读出抛中文错误", () => {
    const db = openDatabase(":memory:");
    db.exec(
      `INSERT INTO projects (key, path, name, color_index, created_at)
       VALUES ('bad', 'bad-path', 'bad', 'not-a-number', '2026-01-01T00:00:00.000Z');`,
    );
    const repo = createProjectRepo(db);
    expect.assertions(3);
    try {
      repo.get("bad");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe("数据库记录损坏：projects.color_index = not-a-number");
      }
    }
  });
});
