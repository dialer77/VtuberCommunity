import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Store } from "./types";
import type { LiveSnapshot, Platform } from "../domain";

/** API가 반환하는 라이브 아이템 (웹 LiveStream 매핑이 쉬운 형태) */
export interface LiveItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  title: string;
  category: string | null;
  viewers: number;
  startedAt: string;
  thumbnailUrl: string | null;
  channelUrl: string;
}

/** API가 반환하는 데뷔(신규 감지) 아이템 */
export interface DebutItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  firstSeenAt: string;
  title: string | null;
  channelUrl: string;
}

function channelUrl(platform: Platform, channelId: string): string {
  if (platform === "chzzk") return `https://chzzk.naver.com/live/${channelId}`;
  return "#";
}

/**
 * 자체 DB(SQLite, node:sqlite 내장) 저장소.
 * 수집 스케줄러가 쓰고, REST API가 읽는 단일 백엔드의 데이터 계층.
 */
export class SqliteStore implements Store {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        channel_id    TEXT PRIMARY KEY,
        platform      TEXT NOT NULL,
        name          TEXT NOT NULL,
        first_seen_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS live_snapshots (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id   TEXT NOT NULL,
        platform     TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        title        TEXT,
        category     TEXT,
        viewers      INTEGER NOT NULL,
        started_at   TEXT,
        thumbnail_url TEXT,
        collected_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snap_collected ON live_snapshots(collected_at);
      CREATE INDEX IF NOT EXISTS idx_snap_channel ON live_snapshots(channel_id, collected_at);
    `);
  }

  async saveSnapshots(snapshots: LiveSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    const stmt = this.db.prepare(`
      INSERT INTO live_snapshots
        (channel_id, platform, channel_name, title, category, viewers, started_at, thumbnail_url, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.exec("BEGIN");
    try {
      for (const s of snapshots) {
        stmt.run(
          s.channelId, s.platform, s.channelName, s.title,
          s.category, s.viewers, s.startedAt, s.thumbnailUrl, s.collectedAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  async markNewChannels(snapshots: LiveSnapshot[]): Promise<LiveSnapshot[]> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO channels (channel_id, platform, name, first_seen_at)
      VALUES (?, ?, ?, ?)
    `);
    const fresh: LiveSnapshot[] = [];
    for (const s of snapshots) {
      const res = stmt.run(s.channelId, s.platform, s.channelName, s.collectedAt);
      if (Number(res.changes) > 0) fresh.push(s);
    }
    return fresh;
  }

  /** 가장 최근 폴링 배치의 라이브 목록 (= 현재 방송중) */
  getCurrentLives(): LiveItem[] {
    const rows = this.db
      .prepare(`
        SELECT channel_id, platform, channel_name, title, category, viewers, started_at, thumbnail_url
        FROM live_snapshots
        WHERE collected_at = (SELECT MAX(collected_at) FROM live_snapshots)
        ORDER BY viewers DESC
      `)
      .all() as unknown as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const platform = r.platform as Platform;
      const channelId = r.channel_id as string;
      return {
        channelId,
        channelName: r.channel_name as string,
        platform,
        title: (r.title as string | null) ?? "",
        category: (r.category as string | null) ?? null,
        viewers: Number(r.viewers),
        startedAt: (r.started_at as string | null) ?? "",
        thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
        channelUrl: channelUrl(platform, channelId),
      };
    });
  }

  /** 최근 처음 감지된 채널(데뷔 후보) */
  getRecentDebuts(limit = 20): DebutItem[] {
    const rows = this.db
      .prepare(`
        SELECT c.channel_id, c.platform, c.name, c.first_seen_at,
          (SELECT title FROM live_snapshots s
           WHERE s.channel_id = c.channel_id ORDER BY s.collected_at DESC LIMIT 1) AS title
        FROM channels c
        ORDER BY c.first_seen_at DESC
        LIMIT ?
      `)
      .all(limit) as unknown as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const platform = r.platform as Platform;
      const channelId = r.channel_id as string;
      return {
        channelId,
        channelName: r.name as string,
        platform,
        firstSeenAt: r.first_seen_at as string,
        title: (r.title as string | null) ?? null,
        channelUrl: channelUrl(platform, channelId),
      };
    });
  }
}
