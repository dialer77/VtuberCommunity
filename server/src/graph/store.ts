// 관계 그래프의 운영자 수정 (SQLite, 수집 DB 와 같은 파일). 자동 관계는 기존 테이블에서 메모리로 다시 만든다 (graph/build.ts).
//  graph_overrides  관계 더하기(add)·막기(block) — 자동 계산이 덮어쓰지 않음
//  graph_aliases    검색어 → 대상 (애칭·줄임말·오타를 정확한 곳으로)
import type { DatabaseSync } from "node:sqlite";

export interface EdgeOverride {
  a: string;
  b: string;
  type: string;
  action: "add" | "block";
  note: string | null;
}

export interface GraphAlias {
  alias: string;
  key: string;
  nodeId: string;
  createdAt: string;
}

export class GraphRepo {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_overrides (
        a          TEXT NOT NULL,
        b          TEXT NOT NULL,
        type       TEXT NOT NULL,
        action     TEXT NOT NULL,
        note       TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (a, b, type)
      );
      CREATE TABLE IF NOT EXISTS graph_aliases (
        key        TEXT PRIMARY KEY,
        alias      TEXT NOT NULL,
        node_id    TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  /** 순서 없는 관계는 a < b 로 저장 */
  private static pair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  overrides(): EdgeOverride[] {
    const rows = this.db.prepare(`SELECT * FROM graph_overrides`).all() as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      a: r.a as string,
      b: r.b as string,
      type: r.type as string,
      action: r.action === "block" ? "block" : "add",
      note: (r.note as string | null) ?? null,
    }));
  }

  setOverride(a: string, b: string, type: string, action: "add" | "block", note: string | null): void {
    const [x, y] = GraphRepo.pair(a, b);
    this.db
      .prepare(`
        INSERT INTO graph_overrides (a, b, type, action, note, created_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(a, b, type) DO UPDATE SET action = excluded.action, note = excluded.note
      `)
      .run(x, y, type, action, note, new Date().toISOString());
  }

  clearOverride(a: string, b: string, type: string): boolean {
    const [x, y] = GraphRepo.pair(a, b);
    return Number(this.db.prepare(`DELETE FROM graph_overrides WHERE a = ? AND b = ? AND type = ?`).run(x, y, type).changes) > 0;
  }

  aliases(): GraphAlias[] {
    const rows = this.db.prepare(`SELECT * FROM graph_aliases ORDER BY alias`).all() as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => ({ alias: r.alias as string, key: r.key as string, nodeId: r.node_id as string, createdAt: r.created_at as string }));
  }

  setAlias(key: string, alias: string, nodeId: string): void {
    this.db
      .prepare(`
        INSERT INTO graph_aliases (key, alias, node_id, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET alias = excluded.alias, node_id = excluded.node_id
      `)
      .run(key, alias, nodeId, new Date().toISOString());
  }

  deleteAlias(key: string): boolean {
    return Number(this.db.prepare(`DELETE FROM graph_aliases WHERE key = ?`).run(key).changes) > 0;
  }
}
