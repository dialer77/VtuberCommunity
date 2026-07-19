import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Store } from "./types";
import type { LiveSnapshot, Platform } from "../domain";
import { hasDebutSignal } from "../detect/debut";

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
  /** 플랫폼 자가 태그 (API에서 VMOA 태그로 변환) */
  rawTags: string[];
}

/** API가 반환하는 데뷔(신규 감지) 아이템 */
export interface DebutItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  firstSeenAt: string;
  title: string | null;
  /** 첫 관측 시 제목에 데뷔 키워드가 있었는지 (진짜 데뷔 추정) */
  debutSignal: boolean;
  channelUrl: string;
}

/** 랭킹 아이템 (윈도우 내 평균/피크 시청자) */
export interface RankingItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  avgViewers: number;
  peakViewers: number;
  samples: number;
  title: string | null;
  channelUrl: string;
}

/** 급상승 아이템 (윈도우 내 시청자 변화율) */
export interface RisingItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  firstViewers: number;
  latestViewers: number;
  growth: number;
  growthPct: number;
  title: string | null;
  channelUrl: string;
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function channelUrl(platform: Platform, channelId: string): string {
  switch (platform) {
    case "chzzk":
      return `https://chzzk.naver.com/live/${channelId}`;
    case "soop":
      return `https://play.sooplive.co.kr/${channelId}`;
    case "youtube":
      return `https://www.youtube.com/channel/${channelId}`;
  }
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
        first_seen_at TEXT NOT NULL,
        first_title   TEXT,
        debut_signal  INTEGER NOT NULL DEFAULT 0
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
        tags         TEXT,
        collected_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snap_collected ON live_snapshots(collected_at);
      CREATE INDEX IF NOT EXISTS idx_snap_channel ON live_snapshots(channel_id, collected_at);
    `);
    // 기존 DB 마이그레이션(컬럼 추가). 이미 있으면 무시.
    this.safeAddColumn("channels", "first_title", "TEXT");
    this.safeAddColumn("channels", "debut_signal", "INTEGER NOT NULL DEFAULT 0");
    this.safeAddColumn("live_snapshots", "tags", "TEXT");
  }

  private safeAddColumn(table: string, col: string, type: string): void {
    try {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    } catch {
      // 이미 존재하는 컬럼 — 무시
    }
  }

  async saveSnapshots(snapshots: LiveSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    const stmt = this.db.prepare(`
      INSERT INTO live_snapshots
        (channel_id, platform, channel_name, title, category, viewers, started_at, thumbnail_url, tags, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.exec("BEGIN");
    try {
      for (const s of snapshots) {
        stmt.run(
          s.channelId, s.platform, s.channelName, s.title,
          s.category, s.viewers, s.startedAt, s.thumbnailUrl,
          JSON.stringify(s.tags ?? []), s.collectedAt,
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
      INSERT OR IGNORE INTO channels
        (channel_id, platform, name, first_seen_at, first_title, debut_signal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const fresh: LiveSnapshot[] = [];
    for (const s of snapshots) {
      const signal = hasDebutSignal(s.title) ? 1 : 0;
      const res = stmt.run(
        s.channelId, s.platform, s.channelName, s.collectedAt, s.title, signal,
      );
      if (Number(res.changes) > 0) fresh.push(s);
    }
    return fresh;
  }

  /** 보존 기간(일)을 넘긴 스냅샷 삭제. DB 무한 증가 방지. */
  async pruneOldSnapshots(retentionDays: number): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
    const cutoff = new Date(
      Date.now() - retentionDays * 86_400_000,
    ).toISOString();
    const res = this.db
      .prepare(`DELETE FROM live_snapshots WHERE collected_at < ?`)
      .run(cutoff);
    return Number(res.changes);
  }

  /** 가장 최근 폴링 배치의 라이브 목록 (= 현재 방송중) */
  getCurrentLives(): LiveItem[] {
    const rows = this.db
      .prepare(`
        SELECT channel_id, platform, channel_name, title, category, viewers, started_at, thumbnail_url, tags
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
        rawTags: parseTags(r.tags),
      };
    });
  }

  /** 최근 처음 감지된 채널(데뷔 후보) */
  getRecentDebuts(limit = 20): DebutItem[] {
    const rows = this.db
      .prepare(`
        SELECT c.channel_id, c.platform, c.name, c.first_seen_at, c.debut_signal,
          (SELECT title FROM live_snapshots s
           WHERE s.channel_id = c.channel_id ORDER BY s.collected_at DESC LIMIT 1) AS title
        FROM channels c
        ORDER BY c.debut_signal DESC, c.first_seen_at DESC
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
        debutSignal: Number(r.debut_signal) === 1,
        channelUrl: channelUrl(platform, channelId),
      };
    });
  }

  /** 윈도우(분) 내 평균 시청자 기준 랭킹 */
  getRanking(windowMinutes = 180, limit = 30): RankingItem[] {
    const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const rows = this.db
      .prepare(`
        SELECT ls.channel_id, ls.platform, ls.channel_name,
          AVG(ls.viewers) AS avg_v, MAX(ls.viewers) AS peak_v, COUNT(*) AS samples,
          (SELECT title FROM live_snapshots t
           WHERE t.channel_id = ls.channel_id ORDER BY t.collected_at DESC LIMIT 1) AS title
        FROM live_snapshots ls
        WHERE ls.collected_at >= ?
        GROUP BY ls.channel_id
        ORDER BY avg_v DESC
        LIMIT ?
      `)
      .all(cutoff, limit) as unknown as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const platform = r.platform as Platform;
      const channelId = r.channel_id as string;
      return {
        channelId,
        channelName: r.channel_name as string,
        platform,
        avgViewers: Math.round(Number(r.avg_v)),
        peakViewers: Number(r.peak_v),
        samples: Number(r.samples),
        title: (r.title as string | null) ?? null,
        channelUrl: channelUrl(platform, channelId),
      };
    });
  }

  /** 윈도우(분) 내 시청자 증가율 기준 급상승 */
  getRising(windowMinutes = 60, limit = 10): RisingItem[] {
    const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const rows = this.db
      .prepare(`
        SELECT c.channel_id, c.platform, c.name,
          (SELECT viewers FROM live_snapshots WHERE channel_id = c.channel_id AND collected_at >= ? ORDER BY collected_at ASC LIMIT 1) AS first_v,
          (SELECT viewers FROM live_snapshots WHERE channel_id = c.channel_id AND collected_at >= ? ORDER BY collected_at DESC LIMIT 1) AS last_v,
          (SELECT COUNT(*) FROM live_snapshots WHERE channel_id = c.channel_id AND collected_at >= ?) AS samples,
          (SELECT title FROM live_snapshots WHERE channel_id = c.channel_id ORDER BY collected_at DESC LIMIT 1) AS title
        FROM channels c
      `)
      .all(cutoff, cutoff, cutoff) as unknown as Array<Record<string, unknown>>;

    return rows
      .map((r) => {
        const first = Number(r.first_v ?? 0);
        const last = Number(r.last_v ?? 0);
        const platform = r.platform as Platform;
        const channelId = r.channel_id as string;
        return {
          channelId,
          channelName: r.name as string,
          platform,
          firstViewers: first,
          latestViewers: last,
          growth: last - first,
          growthPct: first > 0 ? (last - first) / first : 0,
          samples: Number(r.samples ?? 0),
          title: (r.title as string | null) ?? null,
          channelUrl: channelUrl(platform, channelId),
        };
      })
      // 노이즈 제거: 최소 2표본 + 현재 100명 이상 + 실제 증가
      .filter((x) => x.samples >= 2 && x.firstViewers > 0 && x.latestViewers >= 100 && x.growth > 0)
      .sort((a, b) => b.growthPct - a.growthPct)
      .slice(0, limit)
      .map(({ samples: _samples, ...rest }) => rest);
  }
}
