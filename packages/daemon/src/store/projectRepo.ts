import type { DatabaseSync } from "node:sqlite";
import type { ProjectRecord } from "@fleet/core";
import { mapProjectRow, readInteger } from "./rowMappers.js";
import type { ProjectRepo } from "./types.js";

/**
 * 项目仓库：key 是归一化路径，插入本身就不会重复。
 * colorIndicesInUse 给「新项目挑不撞色的颜色」用，deleteOrphansCreatedBefore 给过期清理用，
 * 其余方法都是直译 types.ts 里的注释。
 */
export function createProjectRepo(db: DatabaseSync): ProjectRepo {
  const getStmt = db.prepare("SELECT * FROM projects WHERE key = ?;");
  const insertStmt = db.prepare(
    "INSERT INTO projects (key, path, name, color_index, created_at) VALUES (?, ?, ?, ?, ?);",
  );
  const listStmt = db.prepare("SELECT * FROM projects ORDER BY created_at ASC;");
  const colorIndicesStmt = db.prepare(
    `SELECT DISTINCT projects.color_index AS color_index
     FROM projects
     JOIN workers ON workers.project_key = projects.key
     WHERE workers.created_at >= ?;`,
  );
  const deleteOrphansStmt = db.prepare(
    `DELETE FROM projects
     WHERE created_at < ?
       AND key NOT IN (SELECT DISTINCT project_key FROM workers);`,
  );

  return {
    get(key: string): ProjectRecord | null {
      const row = getStmt.get(key);
      return row === undefined ? null : mapProjectRow(row);
    },

    insert(project: ProjectRecord): void {
      insertStmt.run(
        project.key,
        project.path,
        project.name,
        project.colorIndex,
        project.createdAt,
      );
    },

    list(): ProjectRecord[] {
      return listStmt.all().map(mapProjectRow);
    },

    colorIndicesInUse(since: string): number[] {
      return colorIndicesStmt.all(since).map((row) => readInteger(row, "color_index", "projects"));
    },

    deleteOrphansCreatedBefore(before: string): number {
      const result = deleteOrphansStmt.run(before);
      return typeof result.changes === "number" ? result.changes : Number(result.changes);
    },
  };
}
