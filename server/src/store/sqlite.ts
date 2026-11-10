import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Store } from "./types";
import type { LiveSnapshot, Platform } from "../domain";
import { hasDebutSignal } from "../detect/debut";
import { YoutubeRepo } from "../youtube/store";
import { ClipRepo } from "../clips/store";

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
  /** 데뷔일 — 웹 소식이 있으면 그 날짜, 없으면 처음 감지된 시각 */
  debutAt: string;
  /** 웹 데뷔 소식으로 확인됨 (아래 정보는 그 소식에서) */
  web?: boolean;
  agency?: string | null;
  summary?: string | null;
  sources?: DebutSource[];
}

/** 웹 데뷔 소식의 출처 */
export interface DebutSource {
  url: string;
  title: string;
  publisher: string | null;
}

/** 웹에서 수집한 데뷔 소식 (예정 포함) */
export interface DebutReport {
  id: number;
  name: string;
  agency: string | null;
  platform: Platform | null;
  channelId: string | null;
  channelUrl: string | null;
  /** 데뷔 일시 (ISO). 시간을 모르면 KST 자정 */
  debutAt: string;
  /** KST 날짜 */
  debutDate: string;
  status: "upcoming" | "debuted";
  summary: string | null;
  sources: DebutSource[];
  hidden: boolean;
}

export type NewDebutReport = Omit<DebutReport, "id" | "hidden">;

/** 버튜버 확정 목록 (태그가 없어도 버튜버로 인정 + 순위 밖이어도 방송 직접 확인) */
export interface RegistryEntry {
  platform: Platform;
  channelId: string;
  name: string;
}

/** 한 번의 방송 세션 (started_at 으로 그룹핑한 스냅샷) */
export interface Broadcast {
  startedAt: string;
  title: string | null;
  category: string | null;
  peakViewers: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** 채널 프로필 (DB에서 파생한 자동 데이터) */
export interface ChannelProfile {
  channelId: string;
  platform: Platform;
  name: string;
  channelUrl: string;
  firstSeenAt: string;
  debutSignal: boolean;
  isLive: boolean;
  currentViewers: number | null;
  currentTitle: string | null;
  peakViewers: number;
  broadcastCount: number;
  rawTags: string[];
  broadcasts: Broadcast[];
}

/** V코인 시세 아이템 (시청자 기반 지수 + 등락률) */
export interface CoinItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  channelUrl: string;
  /** 현재가 = 최근 기간 평균 시청자 */
  price: number;
  /** 직전 기간 평균 시청자 (없으면 신규) */
  prevPrice: number | null;
  /** 등락률 (없으면 신규 상장) */
  changePct: number | null;
  isLive: boolean;
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

/** 기간 랭킹 아이템 (일별 집계 합산) */
export interface PeriodRankingItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  channelUrl: string;
  /** 총 시청시간 = Σ(시청자 × 방송 분) / 60 */
  watchHours: number;
  /** 방송 중 평균 시청자 */
  avgViewers: number;
  peakViewers: number;
  /** 방송한 시간 */
  liveHours: number;
  /** 방송한 날 수 */
  days: number;
  title: string | null;
}

export type RankingMetric = "watch" | "avg" | "peak" | "hours";

/** KST 날짜 (YYYY-MM-DD) */
function kstDate(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 이슈 출처 (기사·영상 등) + 미리보기 메타데이터 */
export interface IssueSource {
  url: string;
  title: string;
  publisher: string | null;
  description: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  /** link = 일반 링크(미리보기 카드), youtube = 영상 임베드 */
  kind: "link" | "youtube";
  embedId: string | null;
}

/** 이슈 (자동 수집 또는 수동 작성) */
export interface IssueItem {
  slug: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  vtubers: string[];
  /** 사건이 일어난 날 (YYYY-MM-DD) */
  eventDate: string | null;
  publishedAt: string;
  status: "published" | "hidden";
  origin: "auto" | "manual";
  sources: IssueSource[];
}

export type NewIssue = Omit<IssueItem, "slug" | "publishedAt" | "status"> & {
  slug: string;
};

function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function channelUrl(platform: Platform, channelId: string): string {
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
  /** 유튜브 공식 채널 연동 (같은 DB 파일) */
  readonly youtube: YoutubeRepo;
  /** 키리누키 (같은 DB 파일) */
  readonly clips: ClipRepo;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
    this.youtube = new YoutubeRepo(this.db);
    this.clips = new ClipRepo(this.db);
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

      CREATE TABLE IF NOT EXISTS issues (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        slug         TEXT NOT NULL UNIQUE,
        title        TEXT NOT NULL,
        summary      TEXT NOT NULL,
        body         TEXT NOT NULL,
        tags         TEXT,
        vtubers      TEXT,
        event_date   TEXT,
        published_at TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'published',
        origin       TEXT NOT NULL DEFAULT 'auto'
      );
      CREATE INDEX IF NOT EXISTS idx_issues_pub ON issues(status, published_at);
      CREATE TABLE IF NOT EXISTS issue_sources (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id     INTEGER NOT NULL,
        position     INTEGER NOT NULL DEFAULT 0,
        url          TEXT NOT NULL,
        title        TEXT,
        publisher    TEXT,
        description  TEXT,
        image_url    TEXT,
        published_at TEXT,
        kind         TEXT NOT NULL DEFAULT 'link',
        embed_id     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_issue_sources_issue ON issue_sources(issue_id, position);
      CREATE INDEX IF NOT EXISTS idx_issue_sources_url ON issue_sources(url);

      CREATE TABLE IF NOT EXISTS channel_daily (
        date           TEXT NOT NULL,
        channel_id     TEXT NOT NULL,
        platform       TEXT NOT NULL,
        name           TEXT NOT NULL,
        live_minutes   REAL NOT NULL DEFAULT 0,
        viewer_minutes REAL NOT NULL DEFAULT 0,
        peak_viewers   INTEGER NOT NULL DEFAULT 0,
        samples        INTEGER NOT NULL DEFAULT 0,
        last_title     TEXT,
        PRIMARY KEY (date, channel_id)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_channel ON channel_daily(channel_id, date);

      CREATE TABLE IF NOT EXISTS debut_reports (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        agency      TEXT,
        platform    TEXT,
        channel_id  TEXT,
        channel_url TEXT,
        debut_at    TEXT NOT NULL,
        debut_date  TEXT NOT NULL,
        status      TEXT NOT NULL,
        summary     TEXT,
        sources     TEXT NOT NULL,
        found_at    TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        hidden      INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_debut_reports_date ON debut_reports(debut_date);
      CREATE INDEX IF NOT EXISTS idx_debut_reports_channel ON debut_reports(channel_id);

      CREATE TABLE IF NOT EXISTS vtuber_registry (
        platform   TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        name       TEXT NOT NULL,
        source     TEXT NOT NULL,
        added_at   TEXT NOT NULL,
        PRIMARY KEY (platform, channel_id)
      );

      CREATE TABLE IF NOT EXISTS broadcast_tags (
        channel_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        platform   TEXT NOT NULL,
        tags       TEXT NOT NULL,
        PRIMARY KEY (channel_id, started_at)
      );
      CREATE INDEX IF NOT EXISTS idx_broadcast_tags_started ON broadcast_tags(started_at);

      CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
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

  /** 채널 프로필 — 채널 메타 + 현재 상태 + 통계 + 방송 기록(시계열 파생) */
  getChannelProfile(channelId: string): ChannelProfile | null {
    const ch = this.db
      .prepare(
        `SELECT channel_id, platform, name, first_seen_at, debut_signal
         FROM channels WHERE channel_id = ?`,
      )
      .get(channelId) as Record<string, unknown> | undefined;
    if (!ch) return null;

    const platform = ch.platform as Platform;

    const latestGlobal = (
      this.db
        .prepare(`SELECT MAX(collected_at) AS m FROM live_snapshots`)
        .get() as { m: string | null }
    ).m;

    const current = this.db
      .prepare(
        `SELECT viewers, title, tags, collected_at
         FROM live_snapshots WHERE channel_id = ?
         ORDER BY collected_at DESC LIMIT 1`,
      )
      .get(channelId) as Record<string, unknown> | undefined;

    const isLive =
      !!current && !!latestGlobal && current.collected_at === latestGlobal;

    const peak = (
      this.db
        .prepare(
          `SELECT MAX(viewers) AS p FROM live_snapshots WHERE channel_id = ?`,
        )
        .get(channelId) as { p: number | null }
    ).p;

    const count = (
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT started_at) AS c FROM live_snapshots WHERE channel_id = ?`,
        )
        .get(channelId) as { c: number }
    ).c;

    const rows = this.db
      .prepare(`
        SELECT ls.started_at,
          MAX(ls.viewers) AS peak,
          MIN(ls.collected_at) AS first_at,
          MAX(ls.collected_at) AS last_at,
          (SELECT title FROM live_snapshots t
           WHERE t.channel_id = ls.channel_id AND t.started_at = ls.started_at
           ORDER BY t.collected_at DESC LIMIT 1) AS title,
          (SELECT category FROM live_snapshots t
           WHERE t.channel_id = ls.channel_id AND t.started_at = ls.started_at
           ORDER BY t.collected_at DESC LIMIT 1) AS category
        FROM live_snapshots ls
        WHERE ls.channel_id = ?
        GROUP BY ls.started_at
        ORDER BY ls.started_at DESC
        LIMIT 30
      `)
      .all(channelId) as unknown as Array<Record<string, unknown>>;

    const broadcasts: Broadcast[] = rows.map((r) => ({
      startedAt: (r.started_at as string | null) ?? "",
      title: (r.title as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      peakViewers: Number(r.peak),
      firstSeenAt: (r.first_at as string | null) ?? "",
      lastSeenAt: (r.last_at as string | null) ?? "",
    }));

    return {
      channelId,
      platform,
      name: ch.name as string,
      channelUrl: channelUrl(platform, channelId),
      firstSeenAt: ch.first_seen_at as string,
      debutSignal: Number(ch.debut_signal) === 1,
      isLive,
      currentViewers: isLive ? Number(current!.viewers) : null,
      currentTitle: isLive ? ((current!.title as string | null) ?? null) : null,
      peakViewers: Number(peak ?? 0),
      broadcastCount: Number(count),
      rawTags: isLive ? parseTags(current!.tags) : parseTags(current?.tags),
      broadcasts,
    };
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

  /** 최근 처음 감지된 채널(데뷔 후보). sinceDays 를 주면 그 기간 안에 처음 감지된 채널만. */
  getRecentDebuts(limit = 20, sinceDays?: number): DebutItem[] {
    const since =
      sinceDays && sinceDays > 0
        ? new Date(Date.now() - sinceDays * 86_400_000).toISOString()
        : "";
    const rows = this.db
      .prepare(`
        SELECT c.channel_id, c.platform, c.name, c.first_seen_at, c.debut_signal,
          (SELECT title FROM live_snapshots s
           WHERE s.channel_id = c.channel_id ORDER BY s.collected_at DESC LIMIT 1) AS title
        FROM channels c
        WHERE c.first_seen_at >= ?
        ORDER BY c.debut_signal DESC, c.first_seen_at DESC
        LIMIT ?
      `)
      .all(since, limit) as unknown as Array<Record<string, unknown>>;

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
        debutAt: r.first_seen_at as string,
      };
    });
  }

  /**
   * 기간(since 이후) 신규 데뷔 창. 데뷔 방송 확인(🎀) 채널은 기간 안의 것을 **전부**,
   * 새로 감지만 된 채널은 최근 detectedLimit 개 + 전체 개수. → 기간 안에 있는 동안은 목록에서 밀려나지 않는다.
   */
  getDebutsSince(
    sinceIso: string,
    detectedLimit = 60,
  ): {
    confirmed: DebutItem[];
    detected: DebutItem[];
    detectedTotal: number;
    upcoming: DebutReport[];
    webOnly: DebutReport[];
  } {
    // 웹 데뷔 소식 (숨김 제외) — 채널과 이어진 것은 '데뷔 확인'으로 올리고 출처를 붙인다
    const reports = this.listDebutReports();
    const byChannel = new Map<string, DebutReport>();
    for (const r of reports) if (r.channelId) byChannel.set(r.channelId, r);
    const webIds = [...byChannel.keys()];
    const inWeb = webIds.length ? `c.channel_id IN (${webIds.map(() => "?").join(",")})` : "0";

    const select = (where: string) => `
      SELECT c.channel_id, c.platform, c.name, c.first_seen_at, c.debut_signal,
        COALESCE(
          (SELECT title FROM live_snapshots s
           WHERE s.channel_id = c.channel_id ORDER BY s.collected_at DESC LIMIT 1),
          c.first_title
        ) AS title
      FROM channels c
      WHERE ${where}
      ORDER BY c.first_seen_at DESC`;
    const map = (r: Record<string, unknown>): DebutItem => {
      const platform = r.platform as Platform;
      const channelId = r.channel_id as string;
      const rep = byChannel.get(channelId);
      return {
        channelId,
        channelName: r.name as string,
        platform,
        firstSeenAt: r.first_seen_at as string,
        title: (r.title as string | null) ?? null,
        debutSignal: Number(r.debut_signal) === 1,
        channelUrl: channelUrl(platform, channelId),
        // 수집이 멈췄던 기간 등으로 '처음 감지'가 실제 데뷔보다 늦을 수 있어, 웹 소식의 데뷔일을 우선
        debutAt: rep?.debutAt ?? (r.first_seen_at as string),
        ...(rep
          ? { web: true, agency: rep.agency, summary: rep.summary, sources: rep.sources }
          : {}),
      };
    };
    type Rows = Array<Record<string, unknown>>;
    // 데뷔 확인: 데뷔 키워드로 감지된 채널(감지일이 기간 안) + 웹 소식과 이어진 채널(데뷔일로 기간 판단)
    const nowIso = new Date().toISOString();
    const confirmed = (
      this.db
        .prepare(select(`((c.debut_signal = 1 AND c.first_seen_at >= ?) OR ${inWeb})`))
        .all(sinceIso, ...webIds) as unknown as Rows
    )
      .map(map)
      .filter((d) => d.debutAt >= sinceIso && d.debutAt <= nowIso)
      .sort((a, b) => b.debutAt.localeCompare(a.debutAt));
    const detectedWhere = `c.debut_signal = 0 AND NOT ${inWeb}`;
    const detected = (
      this.db
        .prepare(`${select(`c.first_seen_at >= ? AND ${detectedWhere}`)} LIMIT ?`)
        .all(sinceIso, ...webIds, detectedLimit) as unknown as Rows
    ).map(map);
    const total = this.db
      .prepare(`SELECT COUNT(*) AS n FROM channels c WHERE c.first_seen_at >= ? AND ${detectedWhere}`)
      .get(sinceIso, ...webIds) as { n: number };

    // 예정: 오늘 이후 (기간과 무관하게 항상) / 웹 단독: 기간 안에 데뷔했는데 우리가 감지 못한 채널
    const today = kstDate(Date.now());
    const sinceDate = kstDate(Date.parse(sinceIso));
    const known = new Set([...confirmed, ...detected].map((d) => d.channelId));
    const knownChannel = this.db.prepare(`SELECT 1 FROM channels WHERE channel_id = ?`);
    const upcoming = reports
      .filter((r) => r.debutDate > today)
      .sort((a, b) => a.debutAt.localeCompare(b.debutAt))
      .slice(0, 30);
    const webOnly = reports.filter(
      (r) =>
        r.debutDate >= sinceDate &&
        r.debutDate <= today &&
        !(r.channelId && (known.has(r.channelId) || knownChannel.get(r.channelId))),
    );
    return { confirmed, detected, detectedTotal: Number(total.n), upcoming, webOnly };
  }

  // ---------------------------------------------------------------- 웹 데뷔 소식 · 버튜버 확정 목록

  private toReport(r: Record<string, unknown>): DebutReport {
    let sources: DebutSource[] = [];
    try {
      const v = JSON.parse(String(r.sources ?? "[]"));
      if (Array.isArray(v)) sources = v;
    } catch {
      /* 무시 */
    }
    return {
      id: Number(r.id),
      name: r.name as string,
      agency: (r.agency as string | null) ?? null,
      platform: (r.platform as Platform | null) ?? null,
      channelId: (r.channel_id as string | null) ?? null,
      channelUrl: (r.channel_url as string | null) ?? null,
      debutAt: r.debut_at as string,
      debutDate: r.debut_date as string,
      status: r.status === "upcoming" ? "upcoming" : "debuted",
      summary: (r.summary as string | null) ?? null,
      sources,
      hidden: Number(r.hidden) === 1,
    };
  }

  listDebutReports(includeHidden = false, limit = 500): DebutReport[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM debut_reports ${includeHidden ? "" : "WHERE hidden = 0"}
        ORDER BY debut_date DESC, id DESC LIMIT ?
      `)
      .all(limit) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toReport(r));
  }

  /**
   * 데뷔 소식 저장. 같은 채널(또는 채널을 모르면 같은 이름+소속)이 있으면 새 정보로 갱신하고 출처를 합친다.
   * 반환: added | updated
   */
  upsertDebutReport(rep: NewDebutReport): "added" | "updated" {
    const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
    const now = new Date().toISOString();
    let existing: Record<string, unknown> | undefined;
    if (rep.channelId) {
      existing = this.db
        .prepare(`SELECT * FROM debut_reports WHERE channel_id = ? LIMIT 1`)
        .get(rep.channelId) as Record<string, unknown> | undefined;
    }
    if (!existing) {
      const cands = this.db
        .prepare(`SELECT * FROM debut_reports WHERE debut_date >= ?`)
        .all(kstDate(Date.now() - 120 * 86_400_000)) as unknown as Array<Record<string, unknown>>;
      existing = cands.find(
        (c) => norm(c.name as string) === norm(rep.name) && (!rep.agency || !c.agency || norm(c.agency as string) === norm(rep.agency)),
      );
    }
    if (!existing) {
      this.db
        .prepare(`
          INSERT INTO debut_reports (name, agency, platform, channel_id, channel_url, debut_at, debut_date, status, summary, sources, found_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(rep.name, rep.agency, rep.platform, rep.channelId, rep.channelUrl, rep.debutAt, rep.debutDate,
          rep.status, rep.summary, JSON.stringify(rep.sources), now, now);
      return "added";
    }
    const old = this.toReport(existing);
    const urls = new Set(old.sources.map((s) => s.url));
    const sources = [...old.sources, ...rep.sources.filter((s) => !urls.has(s.url))].slice(0, 6);
    this.db
      .prepare(`
        UPDATE debut_reports SET
          agency = COALESCE(?, agency), platform = COALESCE(?, platform), channel_id = COALESCE(?, channel_id),
          channel_url = COALESCE(?, channel_url), debut_at = ?, debut_date = ?, status = ?,
          summary = COALESCE(?, summary), sources = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(rep.agency, rep.platform, rep.channelId, rep.channelUrl, rep.debutAt, rep.debutDate, rep.status,
        rep.summary, JSON.stringify(sources), now, old.id);
    return "updated";
  }

  setDebutReportHidden(id: number, hidden: boolean): boolean {
    const res = this.db.prepare(`UPDATE debut_reports SET hidden = ? WHERE id = ?`).run(hidden ? 1 : 0, id);
    return Number(res.changes) > 0;
  }

  listRegistry(): RegistryEntry[] {
    const rows = this.db
      .prepare(`SELECT platform, channel_id, name FROM vtuber_registry ORDER BY added_at`)
      .all() as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      platform: r.platform as Platform,
      channelId: r.channel_id as string,
      name: r.name as string,
    }));
  }

  /** 확정 목록에 추가 (이미 있으면 무시). 새로 추가됐으면 true */
  addRegistry(e: RegistryEntry, source: string): boolean {
    const res = this.db
      .prepare(`INSERT OR IGNORE INTO vtuber_registry (platform, channel_id, name, source, added_at) VALUES (?, ?, ?, ?, ?)`)
      .run(e.platform, e.channelId, e.name, source, new Date().toISOString());
    return Number(res.changes) > 0;
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

  /**
   * V코인 시세 — 최근 기간 평균 시청자를 "현재가"로, 직전 동일 기간 대비 등락률.
   * recentHours 기간을 현재가, 그 이전 recentHours 기간을 직전가로 본다.
   */
  getCoinMarket(recentHours = 24): CoinItem[] {
    const now = Date.now();
    const recentCut = new Date(now - recentHours * 3_600_000).toISOString();
    const prevCut = new Date(now - 2 * recentHours * 3_600_000).toISOString();

    const latestGlobal = (
      this.db
        .prepare(`SELECT MAX(collected_at) AS m FROM live_snapshots`)
        .get() as { m: string | null }
    ).m;

    const rows = this.db
      .prepare(`
        SELECT a.channel_id, a.platform, a.price, a.prev, a.last_at,
          (SELECT channel_name FROM live_snapshots s
           WHERE s.channel_id = a.channel_id ORDER BY s.collected_at DESC LIMIT 1) AS name
        FROM (
          SELECT channel_id, platform,
            AVG(CASE WHEN collected_at >= ? THEN viewers END) AS price,
            AVG(CASE WHEN collected_at < ? AND collected_at >= ? THEN viewers END) AS prev,
            MAX(collected_at) AS last_at
          FROM live_snapshots
          WHERE collected_at >= ?
          GROUP BY channel_id
        ) a
        WHERE a.price IS NOT NULL
        ORDER BY a.price DESC
      `)
      .all(recentCut, recentCut, prevCut, prevCut) as unknown as Array<
      Record<string, unknown>
    >;

    return rows.map((r) => {
      const platform = r.platform as Platform;
      const channelId = r.channel_id as string;
      const price = Math.round(Number(r.price));
      const prev = r.prev != null ? Math.round(Number(r.prev)) : null;
      return {
        channelId,
        channelName: r.name as string,
        platform,
        channelUrl: channelUrl(platform, channelId),
        price,
        prevPrice: prev,
        changePct: prev && prev > 0 ? (price - prev) / prev : null,
        isLive: !!latestGlobal && r.last_at === latestGlobal,
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

  // ---------------------------------------------------------------- 일별 집계 · 기간 랭킹

  /**
   * 한 수집 사이클을 일별 집계에 반영. minutes = 이 사이클이 대표하는 시간(분).
   * 스냅샷은 보존 기간(7일) 뒤 지워지지만 일별 집계는 남아 주간·월간 랭킹의 원천이 된다.
   */
  recordDailyStats(snapshots: LiveSnapshot[], minutes: number): void {
    if (snapshots.length === 0 || !(minutes > 0)) return;
    // 같은 사이클에 같은 채널이 중복으로 잡히면(페이지 경계) 시청자 큰 쪽만
    const byChannel = new Map<string, LiveSnapshot>();
    for (const s of snapshots) {
      const prev = byChannel.get(s.channelId);
      if (!prev || s.viewers > prev.viewers) byChannel.set(s.channelId, s);
    }
    const stmt = this.db.prepare(`
      INSERT INTO channel_daily (date, channel_id, platform, name, live_minutes, viewer_minutes, peak_viewers, samples, last_title)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(date, channel_id) DO UPDATE SET
        name = excluded.name,
        live_minutes = live_minutes + excluded.live_minutes,
        viewer_minutes = viewer_minutes + excluded.viewer_minutes,
        peak_viewers = MAX(peak_viewers, excluded.peak_viewers),
        samples = samples + 1,
        last_title = excluded.last_title
    `);
    this.db.exec("BEGIN");
    try {
      for (const s of byChannel.values()) {
        stmt.run(
          kstDate(Date.parse(s.collectedAt)),
          s.channelId,
          s.platform,
          s.channelName,
          minutes,
          s.viewers * minutes,
          s.viewers,
          s.title ?? null,
        );
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * 일별 집계가 비어 있으면 남아 있는 스냅샷(보존 기간 내)으로 한 번 채운다.
   * 사이클 간격은 스냅샷 시각 차이로 계산하되 최대 maxGapMin (수집이 멈췄던 구간은 부풀리지 않음).
   * 채운 사이클 수를 반환.
   */
  backfillDailyStats(pollMinutes: number, maxGapMin: number): number {
    const has = this.db.prepare(`SELECT 1 FROM channel_daily LIMIT 1`).get();
    if (has) return 0;
    const batches = this.db
      .prepare(`SELECT DISTINCT collected_at FROM live_snapshots ORDER BY collected_at`)
      .all() as unknown as Array<{ collected_at: string }>;
    if (batches.length === 0) return 0;
    const rowsAt = this.db.prepare(`
      SELECT channel_id, platform, channel_name, title, viewers FROM live_snapshots WHERE collected_at = ?
    `);
    let prev = 0;
    for (const b of batches) {
      const t = Date.parse(b.collected_at);
      const minutes = prev ? Math.min((t - prev) / 60_000, maxGapMin) : pollMinutes;
      prev = t;
      const rows = rowsAt.all(b.collected_at) as unknown as Array<Record<string, unknown>>;
      this.recordDailyStats(
        rows.map((r) => ({
          channelId: r.channel_id as string,
          platform: r.platform as Platform,
          channelName: r.channel_name as string,
          title: (r.title as string | null) ?? "",
          viewers: Number(r.viewers),
          collectedAt: b.collected_at,
        })) as unknown as LiveSnapshot[],
        minutes,
      );
    }
    return batches.length;
  }

  /** 기간 랭킹. days=1 이면 오늘(KST), 7 = 최근 7일, 30 = 최근 30일. */
  getPeriodRanking(
    days: number,
    metric: RankingMetric,
    limit = 50,
  ): { since: string; trackingSince: string | null; ranking: PeriodRankingItem[] } {
    const since = kstDate(Date.now() - (Math.max(1, days) - 1) * 86_400_000);
    const rows = this.db
      .prepare(`
        SELECT cd.channel_id, cd.platform,
          SUM(cd.live_minutes) AS lm, SUM(cd.viewer_minutes) AS vm,
          MAX(cd.peak_viewers) AS pk, COUNT(*) AS d,
          (SELECT name FROM channel_daily x WHERE x.channel_id = cd.channel_id ORDER BY date DESC LIMIT 1) AS name,
          (SELECT last_title FROM channel_daily x WHERE x.channel_id = cd.channel_id ORDER BY date DESC LIMIT 1) AS title
        FROM channel_daily cd
        WHERE cd.date >= ?
        GROUP BY cd.channel_id
      `)
      .all(since) as unknown as Array<Record<string, unknown>>;

    const items: PeriodRankingItem[] = rows.map((r) => {
      const lm = Number(r.lm ?? 0);
      const vm = Number(r.vm ?? 0);
      const platform = r.platform as Platform;
      const channelId = r.channel_id as string;
      return {
        channelId,
        channelName: r.name as string,
        platform,
        channelUrl: channelUrl(platform, channelId),
        watchHours: vm / 60,
        avgViewers: lm > 0 ? Math.round(vm / lm) : 0,
        peakViewers: Number(r.pk ?? 0),
        liveHours: lm / 60,
        days: Number(r.d ?? 0),
        title: (r.title as string | null) ?? null,
      };
    });
    // 평균 시청자는 잠깐 켠 방송이 튀지 않게 1시간 이상 방송한 채널만
    const pool = metric === "avg" ? items.filter((x) => x.liveHours >= 1) : items;
    const key: Record<RankingMetric, (x: PeriodRankingItem) => number> = {
      watch: (x) => x.watchHours,
      avg: (x) => x.avgViewers,
      peak: (x) => x.peakViewers,
      hours: (x) => x.liveHours,
    };
    pool.sort((a, b) => key[metric](b) - key[metric](a));
    const first = this.db.prepare(`SELECT MIN(date) AS d FROM channel_daily`).get() as { d: string | null };
    return { since, trackingSince: first?.d ?? null, ranking: pool.slice(0, limit) };
  }

  // ---------------------------------------------------------------- 방송별 자가 태그 (소속사 명단 계산용)

  /** 방송(채널+시작시각)마다 자가 태그를 남긴다 — 스냅샷이 지워져도 소속사 판단 근거로 유지 */
  recordBroadcastTags(snapshots: LiveSnapshot[]): void {
    if (snapshots.length === 0) return;
    const stmt = this.db.prepare(`
      INSERT INTO broadcast_tags (channel_id, started_at, platform, tags) VALUES (?, ?, ?, ?)
      ON CONFLICT(channel_id, started_at) DO UPDATE SET tags = excluded.tags
    `);
    this.db.exec("BEGIN");
    try {
      for (const s of snapshots) stmt.run(s.channelId, s.startedAt, s.platform, JSON.stringify(s.tags ?? []));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** 비어 있으면 남은 스냅샷에서 한 번 채움. 채운 방송 수 반환 */
  backfillBroadcastTags(): number {
    if (this.db.prepare(`SELECT 1 FROM broadcast_tags LIMIT 1`).get()) return 0;
    const res = this.db
      .prepare(`
        INSERT OR IGNORE INTO broadcast_tags (channel_id, started_at, platform, tags)
        SELECT channel_id, started_at, platform, COALESCE(MAX(tags), '[]')
        FROM live_snapshots WHERE started_at IS NOT NULL
        GROUP BY channel_id, started_at
      `)
      .run();
    return Number(res.changes);
  }

  /** 채널 ID → 이름 (처음 관측한 이름이 아니라 최근 일별 집계 이름 우선) */
  channelNames(ids: string[]): Map<string, string> {
    const out = new Map<string, string>();
    const uniq = [...new Set(ids)];
    if (uniq.length === 0) return out;
    const ph = uniq.map(() => "?").join(",");
    const rows = this.db
      .prepare(`
        SELECT c.channel_id AS id,
          COALESCE((SELECT name FROM channel_daily d WHERE d.channel_id = c.channel_id ORDER BY date DESC LIMIT 1), c.name) AS name
        FROM channels c WHERE c.channel_id IN (${ph})
      `)
      .all(...uniq) as unknown as Array<{ id: string; name: string }>;
    for (const r of rows) out.set(r.id, r.name);
    return out;
  }

  /** 채널의 마지막 방송 자가 태그 (유튜브 방송에 버튜버 태그를 붙일 때) */
  lastRawTags(channelId: string): string[] {
    const r = this.db
      .prepare(`SELECT tags FROM broadcast_tags WHERE channel_id = ? ORDER BY started_at DESC LIMIT 1`)
      .get(channelId) as { tags: string } | undefined;
    return parseTags(r?.tags);
  }

  /** 최근 N일 방송별 자가 태그 */
  listBroadcastTags(days = 90): { channelId: string; tags: string[] }[] {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = this.db
      .prepare(`SELECT channel_id, tags FROM broadcast_tags WHERE started_at >= ?`)
      .all(since) as unknown as Array<{ channel_id: string; tags: string }>;
    return rows.map((r) => ({ channelId: r.channel_id, tags: parseTags(r.tags) }));
  }

  // ---------------------------------------------------------------- 이슈

  /** 이슈 1건 + 출처 저장. slug 가 이미 있으면 false. */
  insertIssue(issue: NewIssue): boolean {
    const exists = this.db.prepare(`SELECT 1 FROM issues WHERE slug = ?`).get(issue.slug);
    if (exists) return false;
    this.db.exec("BEGIN");
    try {
      const res = this.db
        .prepare(`
          INSERT INTO issues (slug, title, summary, body, tags, vtubers, event_date, published_at, status, origin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)
        `)
        .run(
          issue.slug,
          issue.title,
          issue.summary,
          issue.body,
          JSON.stringify(issue.tags),
          JSON.stringify(issue.vtubers),
          issue.eventDate,
          new Date().toISOString(),
          issue.origin,
        );
      const issueId = Number(res.lastInsertRowid);
      const ins = this.db.prepare(`
        INSERT INTO issue_sources (issue_id, position, url, title, publisher, description, image_url, published_at, kind, embed_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      issue.sources.forEach((s, i) =>
        ins.run(issueId, i, s.url, s.title, s.publisher, s.description, s.imageUrl, s.publishedAt, s.kind, s.embedId),
      );
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  private sourcesFor(issueIds: number[]): Map<number, IssueSource[]> {
    const map = new Map<number, IssueSource[]>();
    if (issueIds.length === 0) return map;
    const rows = this.db
      .prepare(`
        SELECT * FROM issue_sources
        WHERE issue_id IN (${issueIds.map(() => "?").join(",")})
        ORDER BY issue_id, position
      `)
      .all(...issueIds) as unknown as Array<Record<string, unknown>>;
    for (const r of rows) {
      const id = Number(r.issue_id);
      const list = map.get(id) ?? [];
      list.push({
        url: r.url as string,
        title: (r.title as string | null) ?? (r.url as string),
        publisher: (r.publisher as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        imageUrl: (r.image_url as string | null) ?? null,
        publishedAt: (r.published_at as string | null) ?? null,
        kind: r.kind === "youtube" ? "youtube" : "link",
        embedId: (r.embed_id as string | null) ?? null,
      });
      map.set(id, list);
    }
    return map;
  }

  private toIssue(r: Record<string, unknown>, sources: IssueSource[]): IssueItem {
    return {
      slug: r.slug as string,
      title: r.title as string,
      summary: r.summary as string,
      body: r.body as string,
      tags: parseTags(r.tags),
      vtubers: parseTags(r.vtubers),
      eventDate: (r.event_date as string | null) ?? null,
      publishedAt: r.published_at as string,
      status: r.status === "hidden" ? "hidden" : "published",
      origin: r.origin === "manual" ? "manual" : "auto",
      sources,
    };
  }

  /** 이슈 목록 (최신순). includeHidden=false 면 공개된 것만. */
  listIssues(limit = 50, includeHidden = false): IssueItem[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM issues
        ${includeHidden ? "" : "WHERE status = 'published'"}
        ORDER BY COALESCE(event_date, substr(published_at, 1, 10)) DESC, published_at DESC
        LIMIT ?
      `)
      .all(limit) as unknown as Array<Record<string, unknown>>;
    const sources = this.sourcesFor(rows.map((r) => Number(r.id)));
    return rows.map((r) => this.toIssue(r, sources.get(Number(r.id)) ?? []));
  }

  getIssue(slug: string, includeHidden = false): IssueItem | null {
    const r = this.db
      .prepare(`SELECT * FROM issues WHERE slug = ? ${includeHidden ? "" : "AND status = 'published'"}`)
      .get(slug) as Record<string, unknown> | undefined;
    if (!r) return null;
    return this.toIssue(r, this.sourcesFor([Number(r.id)]).get(Number(r.id)) ?? []);
  }

  /** 공개/숨김 전환. 대상이 없으면 false. */
  setIssueStatus(slug: string, status: "published" | "hidden"): boolean {
    const res = this.db.prepare(`UPDATE issues SET status = ? WHERE slug = ?`).run(status, slug);
    return Number(res.changes) > 0;
  }

  /** 이미 출처로 쓰인 URL 인지 (중복 수집 방지) */
  hasIssueSource(url: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM issue_sources WHERE url = ? LIMIT 1`).get(url);
  }

  /** 최근 N일 이슈 제목 (숨김 포함 — 다시 올라오지 않도록) */
  recentIssueTitles(days = 21): string[] {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = this.db
      .prepare(`SELECT title FROM issues WHERE published_at >= ? ORDER BY published_at DESC LIMIT 200`)
      .all(since) as unknown as Array<{ title: string }>;
    return rows.map((r) => r.title);
  }

  // ---------------------------------------------------------------- 메타 (작업 상태 등)

  getMeta(key: string): string | null {
    const r = this.db.prepare(`SELECT value FROM app_meta WHERE key = ?`).get(key) as
      | { value: string | null }
      | undefined;
    return r?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, value);
  }
}
