// 유튜브 연동 데이터 (SQLite, 수집 DB 와 같은 파일).
//  yt_links    버튜버(치지직·SOOP 주 채널) ↔ 유튜브 공식 채널 매핑. 자동 추정 + 운영자 확정
//  yt_channels 유튜브 채널 정보 (RSS 제목, API 핸들·썸네일) + RSS 확인 일정
//  yt_videos   채널 RSS 의 최신 영상 + videos.list 상세(라이브 상태·길이)
//
// 정책(docs/youtube-api.md): API 로 받은 값은 30일 안에 다시 받거나 지운다 → *_at 컬럼으로 관리.
// 유튜브 시청자 수는 live_snapshots(랭킹·합계의 원천)에 넣지 않고 여기에만 둔다.
import type { DatabaseSync } from "node:sqlite";
import type { Platform } from "../domain";

/** 매핑 상태.
 *  auto     링크로 자동 추정 (다음 확인 때 바뀔 수 있음)
 *  manual   운영자가 확정 (자동 확인이 덮어쓰지 않음)
 *  none     운영자가 "공식 채널 없음/연결 안 함"으로 지정 (자동 확인이 덮어쓰지 않음)
 *  pending  후보는 있지만 못 정함 (후보가 여럿이거나, @핸들인데 API 키가 없음)
 *  nolink   채널 정보에 유튜브 링크가 없음 */
export type LinkStatus = "auto" | "manual" | "none" | "pending" | "nolink";

export interface LinkCandidate {
  url: string;
  label: string;
  /** UC… (링크에 있거나 핸들을 변환한 값) */
  ytChannelId: string | null;
  handle: string | null;
  score: number;
  /** 어디서 찾았나: chzzk | soop */
  from: string;
}

export interface YtLink {
  platform: Platform;
  channelId: string;
  name: string;
  ytChannelId: string | null;
  ytHandle: string | null;
  status: LinkStatus;
  source: string | null;
  note: string | null;
  candidates: LinkCandidate[];
  checkedAt: string;
  updatedAt: string;
}

export interface YtChannel {
  ytChannelId: string;
  title: string | null;
  handle: string | null;
  thumbnailUrl: string | null;
  /** API 로 채널 정보를 받은 시각 (30일 안에 갱신) */
  fetchedAt: string | null;
  feedCheckedAt: string | null;
  feedOk: boolean | null;
}

export type LiveStatus = "none" | "upcoming" | "live" | "ended";

export interface YtVideo {
  videoId: string;
  ytChannelId: string;
  title: string;
  publishedAt: string;
  /** videos.list 상세 (키가 없거나 아직 안 받았으면 null) */
  detailAt: string | null;
  liveStatus: LiveStatus | null;
  scheduledAt: string | null;
  liveStartedAt: string | null;
  liveEndedAt: string | null;
  viewers: number | null;
  durationSec: number | null;
}

export interface VideoDetail {
  videoId: string;
  liveStatus: LiveStatus;
  scheduledAt: string | null;
  liveStartedAt: string | null;
  liveEndedAt: string | null;
  viewers: number | null;
  durationSec: number | null;
}

const API_DATA_MAX_AGE_MS = 30 * 86_400_000;

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export class YoutubeRepo {
  constructor(private readonly db: DatabaseSync) {
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS yt_links (
        platform      TEXT NOT NULL,
        channel_id    TEXT NOT NULL,
        name          TEXT NOT NULL,
        yt_channel_id TEXT,
        yt_handle     TEXT,
        status        TEXT NOT NULL,
        source        TEXT,
        note          TEXT,
        candidates    TEXT NOT NULL DEFAULT '[]',
        checked_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        PRIMARY KEY (platform, channel_id)
      );
      CREATE INDEX IF NOT EXISTS idx_yt_links_yt ON yt_links(yt_channel_id);

      CREATE TABLE IF NOT EXISTS yt_channels (
        yt_channel_id   TEXT PRIMARY KEY,
        title           TEXT,
        handle          TEXT,
        thumbnail_url   TEXT,
        fetched_at      TEXT,
        feed_checked_at TEXT,
        feed_ok         INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_yt_channels_handle ON yt_channels(handle);

      CREATE TABLE IF NOT EXISTS yt_videos (
        video_id        TEXT PRIMARY KEY,
        yt_channel_id   TEXT NOT NULL,
        title           TEXT NOT NULL,
        published_at    TEXT NOT NULL,
        feed_seen_at    TEXT NOT NULL,
        detail_at       TEXT,
        live_status     TEXT,
        scheduled_at    TEXT,
        live_started_at TEXT,
        live_ended_at   TEXT,
        viewers         INTEGER,
        duration_sec    INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_yt_videos_channel ON yt_videos(yt_channel_id, published_at);
      CREATE INDEX IF NOT EXISTS idx_yt_videos_live ON yt_videos(live_status);
    `);
  }

  // ---------------------------------------------------------------- 매핑

  private toLink(r: Record<string, unknown>): YtLink {
    return {
      platform: r.platform as Platform,
      channelId: r.channel_id as string,
      name: r.name as string,
      ytChannelId: str(r.yt_channel_id),
      ytHandle: str(r.yt_handle),
      status: r.status as LinkStatus,
      source: str(r.source),
      note: str(r.note),
      candidates: parseJson<LinkCandidate[]>(r.candidates, []),
      checkedAt: r.checked_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  getLink(platform: Platform, channelId: string): YtLink | null {
    const r = this.db
      .prepare(`SELECT * FROM yt_links WHERE platform = ? AND channel_id = ?`)
      .get(platform, channelId) as Record<string, unknown> | undefined;
    return r ? this.toLink(r) : null;
  }

  listLinks(status?: LinkStatus): YtLink[] {
    const rows = (
      status
        ? this.db.prepare(`SELECT * FROM yt_links WHERE status = ? ORDER BY updated_at DESC`).all(status)
        : this.db.prepare(`SELECT * FROM yt_links ORDER BY updated_at DESC`).all()
    ) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toLink(r));
  }

  /** 이름으로 찾기 (운영 CLI). 정확히 같은 이름 → 없으면 포함 */
  findLinksByName(name: string): YtLink[] {
    const exact = this.db.prepare(`SELECT * FROM yt_links WHERE name = ?`).all(name) as unknown as Array<
      Record<string, unknown>
    >;
    if (exact.length) return exact.map((r) => this.toLink(r));
    const like = this.db
      .prepare(`SELECT * FROM yt_links WHERE name LIKE ? LIMIT 10`)
      .all(`%${name}%`) as unknown as Array<Record<string, unknown>>;
    return like.map((r) => this.toLink(r));
  }

  statusCounts(): Record<string, number> {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS n FROM yt_links GROUP BY status`)
      .all() as unknown as Array<{ status: string; n: number }>;
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }

  /** 자동 확인 결과 저장. 운영자가 정한 것(manual·none)은 후보·확인 시각만 갱신하고 결과는 그대로 둔다. */
  saveAutoLink(l: Omit<YtLink, "updatedAt">): void {
    const now = new Date().toISOString();
    const cur = this.getLink(l.platform, l.channelId);
    if (cur && (cur.status === "manual" || cur.status === "none")) {
      this.db
        .prepare(`UPDATE yt_links SET name = ?, candidates = ?, checked_at = ? WHERE platform = ? AND channel_id = ?`)
        .run(l.name, JSON.stringify(l.candidates), l.checkedAt, l.platform, l.channelId);
      return;
    }
    const changed =
      !cur || cur.status !== l.status || cur.ytChannelId !== l.ytChannelId || cur.ytHandle !== l.ytHandle;
    this.db
      .prepare(`
        INSERT INTO yt_links (platform, channel_id, name, yt_channel_id, yt_handle, status, source, note, candidates, checked_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET
          name = excluded.name, yt_channel_id = excluded.yt_channel_id, yt_handle = excluded.yt_handle,
          status = excluded.status, source = excluded.source, note = excluded.note,
          candidates = excluded.candidates, checked_at = excluded.checked_at, updated_at = ?
      `)
      .run(
        l.platform, l.channelId, l.name, l.ytChannelId, l.ytHandle, l.status, l.source, l.note,
        JSON.stringify(l.candidates), l.checkedAt, changed || !cur ? now : cur.updatedAt,
        changed || !cur ? now : cur.updatedAt,
      );
  }

  /** 운영자 확정·해제. status = manual(채널 지정) | none(연결 안 함) | auto(자동으로 되돌림 → 다음 확인 때 다시 추정) */
  setLinkManual(
    platform: Platform,
    channelId: string,
    name: string,
    v: { status: "manual"; ytChannelId: string; ytHandle: string | null } | { status: "none" } | { status: "auto" },
  ): void {
    const now = new Date().toISOString();
    if (v.status === "auto") {
      // 확인 시각을 비워 다음 매핑 실행 때 바로 다시 추정
      this.db
        .prepare(`UPDATE yt_links SET status = 'pending', source = NULL, note = '자동으로 되돌림', checked_at = '', updated_at = ? WHERE platform = ? AND channel_id = ?`)
        .run(now, platform, channelId);
      return;
    }
    const yt = v.status === "manual" ? v.ytChannelId : null;
    const handle = v.status === "manual" ? v.ytHandle : null;
    this.db
      .prepare(`
        INSERT INTO yt_links (platform, channel_id, name, yt_channel_id, yt_handle, status, source, note, candidates, checked_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'manual', NULL, '[]', ?, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET
          yt_channel_id = excluded.yt_channel_id, yt_handle = excluded.yt_handle, status = excluded.status,
          source = 'manual', note = NULL, updated_at = excluded.updated_at
      `)
      .run(platform, channelId, name, yt, handle, v.status, now, now);
  }

  /** 링크 확인이 필요한 채널인지 — 마지막 확인 시각 기준 (상태마다 주기가 다름) */
  isLinkCheckDue(platform: Platform, channelId: string, hasKey: boolean, nowMs = Date.now()): boolean {
    const l = this.getLink(platform, channelId);
    if (!l) return true;
    const age = nowMs - (Date.parse(l.checkedAt) || 0);
    const H = 3_600_000;
    switch (l.status) {
      case "manual":
      case "none":
        return false;
      case "pending":
        // 핸들 변환을 기다리는 중인데 키가 생겼으면 바로
        if (hasKey && l.note === "needs_key") return true;
        return age > 24 * H;
      case "auto":
        return age > 7 * 24 * H;
      case "nolink":
        return age > 3 * 24 * H;
    }
  }

  /** 영상을 수집할 유튜브 채널 (자동·확정 매핑) */
  mappedYtChannels(): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT yt_channel_id AS id FROM yt_links WHERE status IN ('auto', 'manual') AND yt_channel_id IS NOT NULL`)
      .all() as unknown as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /**
   * 같은 유튜브 채널이 여러 버튜버에 자동 연결된 경우(소속사·그룹 공용 채널일 가능성) — 자동 연결을 모두 확인필요로 돌린다.
   * 운영자가 확정한 것은 그대로. 돌린 개수 반환
   */
  demoteSharedAuto(ytChannelId: string): number {
    const res = this.db
      .prepare(`
        UPDATE yt_links SET status = 'pending', note = 'shared', yt_channel_id = NULL, yt_handle = NULL, updated_at = ?
        WHERE yt_channel_id = ? AND status = 'auto'
      `)
      .run(new Date().toISOString(), ytChannelId);
    return Number(res.changes);
  }

  /** 이 유튜브 채널을 차지한 다른 버튜버 — 연결돼 있거나, 공용 채널로 확인필요가 된 기록 (자신 제외) */
  otherClaimants(ytChannelId: string, platform: Platform, channelId: string): YtLink[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM yt_links
        WHERE NOT (platform = ? AND channel_id = ?)
          AND ((yt_channel_id = ? AND status IN ('auto', 'manual')) OR (status = 'pending' AND note = 'shared' AND instr(candidates, ?) > 0))
      `)
      .all(platform, channelId, ytChannelId, `"ytChannelId":"${ytChannelId}"`) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toLink(r));
  }

  /** 유튜브 채널 → 연결된 버튜버(주 채널). 확정(manual)을 먼저 */
  ownersOf(ytChannelId: string): YtLink[] {
    const rows = this.db
      .prepare(`SELECT * FROM yt_links WHERE yt_channel_id = ? AND status IN ('auto', 'manual') ORDER BY status = 'manual' DESC, updated_at`)
      .all(ytChannelId) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toLink(r));
  }

  // ---------------------------------------------------------------- 유튜브 채널

  private toChannel(r: Record<string, unknown>): YtChannel {
    return {
      ytChannelId: r.yt_channel_id as string,
      title: str(r.title),
      handle: str(r.handle),
      thumbnailUrl: str(r.thumbnail_url),
      fetchedAt: str(r.fetched_at),
      feedCheckedAt: str(r.feed_checked_at),
      feedOk: r.feed_ok == null ? null : Number(r.feed_ok) === 1,
    };
  }

  getChannel(ytChannelId: string): YtChannel | null {
    const r = this.db.prepare(`SELECT * FROM yt_channels WHERE yt_channel_id = ?`).get(ytChannelId) as
      | Record<string, unknown>
      | undefined;
    return r ? this.toChannel(r) : null;
  }

  /** 핸들(@…) → 채널 ID (API 로 받아 둔 것, 30일 이내만) */
  channelIdForHandle(handle: string): string | null {
    const cutoff = new Date(Date.now() - API_DATA_MAX_AGE_MS).toISOString();
    const r = this.db
      .prepare(`SELECT yt_channel_id FROM yt_channels WHERE lower(handle) = lower(?) AND fetched_at >= ? LIMIT 1`)
      .get(handle, cutoff) as { yt_channel_id: string } | undefined;
    return r?.yt_channel_id ?? null;
  }

  /** API 로 받은 채널 정보 저장 */
  saveChannelInfo(c: { ytChannelId: string; title: string | null; handle: string | null; thumbnailUrl: string | null }): void {
    this.db
      .prepare(`
        INSERT INTO yt_channels (yt_channel_id, title, handle, thumbnail_url, fetched_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(yt_channel_id) DO UPDATE SET
          title = COALESCE(excluded.title, title), handle = excluded.handle,
          thumbnail_url = excluded.thumbnail_url, fetched_at = excluded.fetched_at
      `)
      .run(c.ytChannelId, c.title, c.handle, c.thumbnailUrl, new Date().toISOString());
  }

  /** API 채널 정보를 다시 받아야 하는 채널 (없거나 오래됨) */
  channelsNeedingInfo(ids: string[], maxAgeMs: number): string[] {
    const cutoff = Date.now() - maxAgeMs;
    return ids.filter((id) => {
      const c = this.getChannel(id);
      return !c || !c.fetchedAt || Date.parse(c.fetchedAt) < cutoff;
    });
  }

  /** RSS 를 확인할 차례인 채널. hot(최근 라이브가 있던 채널)은 짧은 주기 */
  feedsDue(ids: string[], coldMs: number, hotMs: number, hotIds: Set<string>, nowMs = Date.now()): string[] {
    const due: { id: string; at: number }[] = [];
    for (const id of ids) {
      const at = Date.parse(this.getChannel(id)?.feedCheckedAt ?? "") || 0;
      if (nowMs - at >= (hotIds.has(id) ? hotMs : coldMs)) due.push({ id, at });
    }
    return due.sort((a, b) => a.at - b.at).map((d) => d.id);
  }

  /** 최근 N일 안에 라이브·예정 영상이 있던 채널 */
  channelsWithRecentLive(days: number): Set<string> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = this.db
      .prepare(`
        SELECT DISTINCT yt_channel_id AS id FROM yt_videos
        WHERE live_status IN ('upcoming', 'live') OR (live_status = 'ended' AND COALESCE(live_started_at, published_at) >= ?)
      `)
      .all(since) as unknown as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  }

  /**
   * RSS 결과 저장. 피드에 있는 영상은 넣거나 제목을 갱신하고, 피드에서 빠진 영상은 지운다
   * (방송 중·예정인 영상은 남김). 피드 실패는 기록만 하고 영상은 건드리지 않는다.
   */
  saveFeed(
    ytChannelId: string,
    feed: { title: string | null; entries: { videoId: string; title: string; publishedAt: string }[] } | null,
  ): { added: string[] } {
    const now = new Date().toISOString();
    if (!feed) {
      this.db
        .prepare(`
          INSERT INTO yt_channels (yt_channel_id, feed_checked_at, feed_ok) VALUES (?, ?, 0)
          ON CONFLICT(yt_channel_id) DO UPDATE SET feed_checked_at = excluded.feed_checked_at, feed_ok = 0
        `)
        .run(ytChannelId, now);
      return { added: [] };
    }
    const added: string[] = [];
    const exists = this.db.prepare(`SELECT 1 FROM yt_videos WHERE video_id = ?`);
    const upsert = this.db.prepare(`
      INSERT INTO yt_videos (video_id, yt_channel_id, title, published_at, feed_seen_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET title = excluded.title, published_at = excluded.published_at, feed_seen_at = excluded.feed_seen_at
    `);
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          INSERT INTO yt_channels (yt_channel_id, title, feed_checked_at, feed_ok) VALUES (?, ?, ?, 1)
          ON CONFLICT(yt_channel_id) DO UPDATE SET title = COALESCE(excluded.title, title), feed_checked_at = excluded.feed_checked_at, feed_ok = 1
        `)
        .run(ytChannelId, feed.title, now);
      for (const e of feed.entries) {
        if (!exists.get(e.videoId)) added.push(e.videoId);
        upsert.run(e.videoId, ytChannelId, e.title, e.publishedAt, now);
      }
      this.db
        .prepare(`
          DELETE FROM yt_videos WHERE yt_channel_id = ? AND feed_seen_at < ?
            AND COALESCE(live_status, '') NOT IN ('upcoming', 'live')
        `)
        .run(ytChannelId, now);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { added };
  }

  // ---------------------------------------------------------------- 영상

  private toVideo(r: Record<string, unknown>): YtVideo {
    return {
      videoId: r.video_id as string,
      ytChannelId: r.yt_channel_id as string,
      title: r.title as string,
      publishedAt: r.published_at as string,
      detailAt: str(r.detail_at),
      liveStatus: (str(r.live_status) as LiveStatus | null) ?? null,
      scheduledAt: str(r.scheduled_at),
      liveStartedAt: str(r.live_started_at),
      liveEndedAt: str(r.live_ended_at),
      viewers: num(r.viewers),
      durationSec: num(r.duration_sec),
    };
  }

  /** 채널의 최신 영상 (공식 영상 탭) */
  listVideos(ytChannelId: string, limit = 15): YtVideo[] {
    const rows = this.db
      .prepare(`SELECT * FROM yt_videos WHERE yt_channel_id = ? ORDER BY published_at DESC LIMIT ?`)
      .all(ytChannelId, limit) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toVideo(r));
  }

  /** 지금 유튜브에서 방송 중인 영상 (매핑된 채널만). 확인이 maxAgeMs 넘게 끊긴 것은 빼서 멈춘 '방송 중'이 남지 않게 */
  listLiveVideos(maxAgeMs: number): YtVideo[] {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const rows = this.db
      .prepare(`
        SELECT v.* FROM yt_videos v
        WHERE v.live_status = 'live' AND v.detail_at >= ?
          AND EXISTS (SELECT 1 FROM yt_links l WHERE l.yt_channel_id = v.yt_channel_id AND l.status IN ('auto', 'manual'))
        ORDER BY COALESCE(v.viewers, 0) DESC
      `)
      .all(cutoff) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toVideo(r));
  }

  /** 상세를 아직 받지 않은 영상 (새로 발견) */
  videosWithoutDetail(limit: number): string[] {
    const rows = this.db
      .prepare(`SELECT video_id FROM yt_videos WHERE detail_at IS NULL ORDER BY published_at DESC LIMIT ?`)
      .all(limit) as unknown as Array<{ video_id: string }>;
    return rows.map((r) => r.video_id);
  }

  /**
   * 라이브 상태를 다시 확인할 영상.
   *  near  방송 중 + 예정 시각이 가까운 예정 영상(soonMs 뒤 ~ 지연 lateMs 까지) → 매 주기
   *  far   그 밖의 예정 영상 (먼 예정, 시작하지 않고 남은 예정) → 가끔 (예정 변경·조기 시작)
   */
  liveWatchTargets(soonMs: number, lateMs: number): { near: string[]; far: string[] } {
    const rows = this.db
      .prepare(`SELECT video_id, live_status, scheduled_at FROM yt_videos WHERE live_status IN ('live', 'upcoming')`)
      .all() as unknown as Array<{ video_id: string; live_status: string; scheduled_at: string | null }>;
    const now = Date.now();
    const near: string[] = [];
    const far: string[] = [];
    for (const r of rows) {
      const at = Date.parse(r.scheduled_at ?? "");
      const soon = !Number.isNaN(at) && at - now <= soonMs && now - at <= lateMs;
      if (r.live_status === "live" || soon) near.push(r.video_id);
      else far.push(r.video_id);
    }
    return { near, far };
  }

  /** 상세(API 값)가 오래된 영상 — 30일이 되기 전에 다시 받는다 */
  videosWithStaleDetail(maxAgeMs: number, limit: number): string[] {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const rows = this.db
      .prepare(`SELECT video_id FROM yt_videos WHERE detail_at IS NOT NULL AND detail_at < ? ORDER BY detail_at LIMIT ?`)
      .all(cutoff, limit) as unknown as Array<{ video_id: string }>;
    return rows.map((r) => r.video_id);
  }

  /** videos.list 결과 저장. 요청했는데 응답에 없는 영상(삭제·비공개)은 지운다 */
  saveVideoDetails(requested: string[], details: VideoDetail[]): void {
    const now = new Date().toISOString();
    const got = new Set(details.map((d) => d.videoId));
    const upd = this.db.prepare(`
      UPDATE yt_videos SET detail_at = ?, live_status = ?, scheduled_at = ?, live_started_at = ?, live_ended_at = ?,
        viewers = ?, duration_sec = ?
      WHERE video_id = ?
    `);
    const del = this.db.prepare(`DELETE FROM yt_videos WHERE video_id = ?`);
    this.db.exec("BEGIN");
    try {
      for (const d of details) {
        upd.run(now, d.liveStatus, d.scheduledAt, d.liveStartedAt, d.liveEndedAt,
          d.liveStatus === "live" ? d.viewers : null, d.durationSec, d.videoId);
      }
      for (const id of requested) if (!got.has(id)) del.run(id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * 정책 정리 (30일): 오래된 API 값을 지운다.
   *  - 매핑에서 빠진 채널의 영상, RSS 에서 30일 넘게 안 보인 영상 삭제
   *  - API 로 받은 채널 정보(핸들·썸네일)가 30일을 넘으면 비움
   *  - 상세가 30일을 넘은 영상은 상세만 비움 (다음 주기에 다시 받음)
   */
  purgeStale(): { videos: number; channels: number } {
    const cutoff = new Date(Date.now() - API_DATA_MAX_AGE_MS).toISOString();
    const v1 = this.db
      .prepare(`
        DELETE FROM yt_videos WHERE feed_seen_at < ?
          OR yt_channel_id NOT IN (SELECT yt_channel_id FROM yt_links WHERE status IN ('auto', 'manual') AND yt_channel_id IS NOT NULL)
      `)
      .run(cutoff);
    this.db
      .prepare(`
        UPDATE yt_videos SET detail_at = NULL, live_status = NULL, scheduled_at = NULL, live_started_at = NULL,
          live_ended_at = NULL, viewers = NULL, duration_sec = NULL
        WHERE detail_at IS NOT NULL AND detail_at < ?
      `)
      .run(cutoff);
    const c1 = this.db
      .prepare(`UPDATE yt_channels SET handle = NULL, thumbnail_url = NULL, fetched_at = NULL WHERE fetched_at IS NOT NULL AND fetched_at < ?`)
      .run(cutoff);
    return { videos: Number(v1.changes), channels: Number(c1.changes) };
  }
}
