// 키리누키(팬 편집 클립) 데이터 — 수집 DB(SQLite)와 같은 파일.
//  clip_channels  키리누키 채널 (search.list 로 발견하거나 운영자가 추가). 채널 ID 와 RSS 채널 이름만 저장
//  clip_searches  버튜버별 마지막 검색 (search.list 는 비싸서 한 달에 한 번)
//  clips          RSS 로 받은 클립 + 버모아 분류 (누가·무엇을·어떤 순간·한 줄 요약)
//  clip_vtubers   클립에 나오는 버튜버 (주 채널 기준)
//  clip_tags      분류 태그 (vocab.ts) — Claude 가 붙인 것
//  clip_vote_tags 사용자 태그 투표 집계 (사용자 DB 에서 복사, 4단계)
//  clip_tags_eff  화면·검색에 쓰는 태그 = Claude 태그 + 투표 반영 (뷰)
//  clip_stats     좋아요 수 (사용자 DB 에서 복사)
//
// 정책(docs/youtube-api.md): 분류 입력은 RSS 제목·설명뿐 (API 데이터로 파생 데이터를 만들지 않음).
// RSS 에서 빠진 클립은 20일마다 videos.list 로 남아 있는지 확인하고, 30일 넘게 확인 못 한 클립은 지운다.
import type { DatabaseSync } from "node:sqlite";
import type { Platform } from "../domain";
import { topicKey } from "./topics";

export type ClipChannelStatus = "auto" | "approved" | "blocked";
export type ClassStatus = "pending" | "done" | "not_clip" | "failed";

export interface ClipChannel {
  ytChannelId: string;
  title: string | null;
  status: ClipChannelStatus;
  blockReason: string | null;
  hintPlatform: Platform | null;
  hintChannelId: string | null;
  foundAt: string;
  foundHits: number;
  feedCheckedAt: string | null;
  feedOk: boolean | null;
}

export interface ClipRow {
  videoId: string;
  ytChannelId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  classStatus: ClassStatus;
  classTries: number;
  category: string | null;
  topic: string | null;
  summary: string | null;
  moments: string[];
  vtubers: { platform: Platform; channelId: string }[];
  channelTitle: string | null;
  hintPlatform: Platform | null;
  hintChannelId: string | null;
  likes: number;
  /** 대표 순간 (moments[0] 과 같음, 투표로 빠졌으면 null) */
  primaryMoment: string | null;
  /** 사건·밈 이름 (같은 일을 다룬 클립을 묶는다) */
  event: string | null;
  /** 원본 방송 다시보기 */
  sourceUrl: string | null;
  sourceKey: string | null;
  /** 원본 방송 날짜 (KST YYYY-MM-DD) */
  sourceDate: string | null;
  /** 분류 버전 — CLASS_VER 보다 낮으면 보강 대상 */
  classVer: number;
  /** videos.list 로 확인한 시각 (있으면 제목이 API 값으로 바뀌었을 수 있음) */
  checkedAt: string | null;
}

export interface ClipClass {
  videoId: string;
  isClip: boolean;
  category: string | null;
  topic: string | null;
  summary: string | null;
  /** [0] 이 대표 순간 */
  moments: string[];
  vtubers: { platform: Platform; channelId: string }[];
  event: string | null;
  source: { url: string; key: string } | null;
  sourceDate: string | null;
}

/** 기존 클립 보강 (대표 순간·주제 이름·사건). 버튜버·카테고리·요약은 그대로 */
export interface ClipEnrich {
  videoId: string;
  /** [0] 이 대표 순간 */
  moments: string[];
  topic: string | null;
  event: string | null;
}

/** 지금 분류 버전 — 1: 처음 분류, 2: 대표 순간·주제 통일·사건·원본 방송 */
export const CLASS_VER = 2;

/** 태그 투표 반영 기준: Claude 태그는 반대가 찬성보다 이만큼 많으면 빼고, 없는 태그는 찬성이 이만큼 많으면 붙인다 */
export const VOTE_MARGIN = 2;

export interface ClipQuery {
  /** new = 최신순(기본), likes = 좋아요순 */
  sort?: "new" | "likes";
  tag?: string;
  vtuber?: { platform: Platform; channelId: string };
  limit: number;
  offset: number;
}

const DAY = 86_400_000;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** 화면에 보여도 되는 클립: 분류 완료 + 차단되지 않은 채널 */
const VISIBLE = `c.class_status = 'done' AND ch.status != 'blocked'`;

export class ClipRepo {
  constructor(private readonly db: DatabaseSync) {
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clip_channels (
        yt_channel_id   TEXT PRIMARY KEY,
        title           TEXT,
        status          TEXT NOT NULL,
        block_reason    TEXT,
        hint_platform   TEXT,
        hint_channel_id TEXT,
        found_at        TEXT NOT NULL,
        found_hits      INTEGER NOT NULL DEFAULT 0,
        feed_checked_at TEXT,
        feed_ok         INTEGER
      );
      CREATE TABLE IF NOT EXISTS clip_searches (
        platform    TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        searched_at TEXT NOT NULL,
        found       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (platform, channel_id)
      );
      CREATE TABLE IF NOT EXISTS clips (
        video_id      TEXT PRIMARY KEY,
        yt_channel_id TEXT NOT NULL,
        title         TEXT NOT NULL,
        description   TEXT,
        published_at  TEXT NOT NULL,
        feed_seen_at  TEXT NOT NULL,
        checked_at    TEXT,
        class_status  TEXT NOT NULL DEFAULT 'pending',
        class_at      TEXT,
        class_tries   INTEGER NOT NULL DEFAULT 0,
        category      TEXT,
        topic         TEXT,
        summary       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(class_status, published_at);
      CREATE INDEX IF NOT EXISTS idx_clips_channel ON clips(yt_channel_id);
      CREATE TABLE IF NOT EXISTS clip_vtubers (
        video_id   TEXT NOT NULL,
        platform   TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (video_id, platform, channel_id)
      );
      CREATE INDEX IF NOT EXISTS idx_clip_vtubers_ch ON clip_vtubers(platform, channel_id);
      CREATE TABLE IF NOT EXISTS clip_tags (
        video_id TEXT NOT NULL,
        tag      TEXT NOT NULL,
        PRIMARY KEY (video_id, tag)
      );
      CREATE INDEX IF NOT EXISTS idx_clip_tags_tag ON clip_tags(tag);
      CREATE TABLE IF NOT EXISTS clip_vote_tags (
        video_id TEXT NOT NULL,
        tag      TEXT NOT NULL,
        up       INTEGER NOT NULL DEFAULT 0,
        down     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (video_id, tag)
      );
      CREATE TABLE IF NOT EXISTS clip_stats (
        video_id TEXT PRIMARY KEY,
        likes    INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_clip_stats_likes ON clip_stats(likes);
      DROP VIEW IF EXISTS clip_tags_eff;
      CREATE VIEW clip_tags_eff AS
        SELECT t.video_id, t.tag FROM clip_tags t
        WHERE NOT EXISTS (
          SELECT 1 FROM clip_vote_tags v WHERE v.video_id = t.video_id AND v.tag = t.tag AND v.down - v.up >= ${VOTE_MARGIN}
        )
        UNION
        SELECT v.video_id, v.tag FROM clip_vote_tags v WHERE v.up - v.down >= ${VOTE_MARGIN};
    `);
    this.addColumns();
  }

  /** 분류 2판(대표 순간·사건·원본 방송) 열 — 기존 DB 에도 붙인다 */
  private addColumns(): void {
    const cols = new Set(
      (this.db.prepare(`PRAGMA table_info(clips)`).all() as unknown as Array<{ name: string }>).map((c) => c.name),
    );
    const add = (name: string, def: string) => {
      if (!cols.has(name)) this.db.exec(`ALTER TABLE clips ADD COLUMN ${name} ${def}`);
    };
    add("primary_moment", "TEXT");
    add("event", "TEXT");
    add("source_url", "TEXT");
    add("source_key", "TEXT");
    add("source_date", "TEXT");
    add("class_ver", "INTEGER NOT NULL DEFAULT 1");
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_clips_event ON clips(event);
      CREATE INDEX IF NOT EXISTS idx_clips_source ON clips(source_key);
      CREATE TABLE IF NOT EXISTS clip_topic_alias (
        alias      TEXT PRIMARY KEY,
        topic      TEXT NOT NULL,
        source     TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // ---------------------------------------------------------------- 채널

  private toChannel(r: Record<string, unknown>): ClipChannel {
    return {
      ytChannelId: r.yt_channel_id as string,
      title: str(r.title),
      status: r.status as ClipChannelStatus,
      blockReason: str(r.block_reason),
      hintPlatform: (str(r.hint_platform) as Platform | null) ?? null,
      hintChannelId: str(r.hint_channel_id),
      foundAt: r.found_at as string,
      foundHits: Number(r.found_hits ?? 0),
      feedCheckedAt: str(r.feed_checked_at),
      feedOk: r.feed_ok == null ? null : Number(r.feed_ok) === 1,
    };
  }

  getChannel(ytChannelId: string): ClipChannel | null {
    const r = this.db.prepare(`SELECT * FROM clip_channels WHERE yt_channel_id = ?`).get(ytChannelId) as
      | Record<string, unknown>
      | undefined;
    return r ? this.toChannel(r) : null;
  }

  listChannels(status?: ClipChannelStatus): (ClipChannel & { clips: number; done: number; notClip: number })[] {
    const rows = this.db
      .prepare(`
        SELECT ch.*,
          (SELECT COUNT(*) FROM clips c WHERE c.yt_channel_id = ch.yt_channel_id) AS n,
          (SELECT COUNT(*) FROM clips c WHERE c.yt_channel_id = ch.yt_channel_id AND c.class_status = 'done') AS d,
          (SELECT COUNT(*) FROM clips c WHERE c.yt_channel_id = ch.yt_channel_id AND c.class_status = 'not_clip') AS x
        FROM clip_channels ch ${status ? "WHERE ch.status = ?" : ""}
        ORDER BY ch.found_hits DESC, ch.found_at
      `)
      .all(...(status ? [status] : [])) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => ({ ...this.toChannel(r), clips: Number(r.n), done: Number(r.d), notClip: Number(r.x) }));
  }

  findChannelsByTitle(title: string): ClipChannel[] {
    const rows = this.db
      .prepare(`SELECT * FROM clip_channels WHERE title = ? OR title LIKE ? LIMIT 10`)
      .all(title, `%${title}%`) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toChannel(r));
  }

  /** 검색으로 찾은 채널 등록 (있으면 발견 횟수만 올림). 새로 등록했으면 true */
  addFoundChannel(ytChannelId: string, hint: { platform: Platform; channelId: string } | null, hits: number): boolean {
    if (this.getChannel(ytChannelId)) {
      this.db.prepare(`UPDATE clip_channels SET found_hits = found_hits + ? WHERE yt_channel_id = ?`).run(hits, ytChannelId);
      return false;
    }
    this.db
      .prepare(`
        INSERT INTO clip_channels (yt_channel_id, status, hint_platform, hint_channel_id, found_at, found_hits)
        VALUES (?, 'auto', ?, ?, ?, ?)
      `)
      .run(ytChannelId, hint?.platform ?? null, hint?.channelId ?? null, new Date().toISOString(), hits);
    return true;
  }

  setChannelStatus(ytChannelId: string, status: ClipChannelStatus, reason: string | null): boolean {
    const res = this.db
      .prepare(`UPDATE clip_channels SET status = ?, block_reason = ? WHERE yt_channel_id = ?`)
      .run(status, status === "blocked" ? reason : null, ytChannelId);
    return Number(res.changes) > 0;
  }

  /** 운영자가 직접 추가 (승인 상태) */
  addManualChannel(ytChannelId: string, hint: { platform: Platform; channelId: string } | null): void {
    this.db
      .prepare(`
        INSERT INTO clip_channels (yt_channel_id, status, hint_platform, hint_channel_id, found_at, found_hits)
        VALUES (?, 'approved', ?, ?, ?, 0)
        ON CONFLICT(yt_channel_id) DO UPDATE SET status = 'approved', block_reason = NULL,
          hint_platform = COALESCE(excluded.hint_platform, hint_platform), hint_channel_id = COALESCE(excluded.hint_channel_id, hint_channel_id)
      `)
      .run(ytChannelId, hint?.platform ?? null, hint?.channelId ?? null, new Date().toISOString());
  }

  /** RSS 확인 차례인 채널 (차단 제외, 오래 확인 안 한 순) */
  feedsDue(intervalMs: number, limit: number): string[] {
    const cutoff = new Date(Date.now() - intervalMs).toISOString();
    const rows = this.db
      .prepare(`
        SELECT yt_channel_id FROM clip_channels
        WHERE status != 'blocked' AND (feed_checked_at IS NULL OR feed_checked_at < ?)
        ORDER BY COALESCE(feed_checked_at, '') LIMIT ?
      `)
      .all(cutoff, limit) as unknown as Array<{ yt_channel_id: string }>;
    return rows.map((r) => r.yt_channel_id);
  }

  /** RSS 결과 저장. 새 클립은 분류 대기로. RSS 에서 빠진 클립은 지우지 않는다(모음 보관 — 대신 videos.list 로 확인) */
  saveFeed(
    ytChannelId: string,
    feed: { title: string | null; entries: { videoId: string; title: string; publishedAt: string; description: string | null }[] } | null,
  ): { added: number } {
    const now = new Date().toISOString();
    if (!feed) {
      this.db.prepare(`UPDATE clip_channels SET feed_checked_at = ?, feed_ok = 0 WHERE yt_channel_id = ?`).run(now, ytChannelId);
      return { added: 0 };
    }
    let added = 0;
    const exists = this.db.prepare(`SELECT 1 FROM clips WHERE video_id = ?`);
    const ins = this.db.prepare(`
      INSERT INTO clips (video_id, yt_channel_id, title, description, published_at, feed_seen_at) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const upd = this.db.prepare(`UPDATE clips SET title = ?, published_at = ?, feed_seen_at = ? WHERE video_id = ?`);
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`UPDATE clip_channels SET title = COALESCE(?, title), feed_checked_at = ?, feed_ok = 1 WHERE yt_channel_id = ?`)
        .run(feed.title, now, ytChannelId);
      for (const e of feed.entries) {
        if (exists.get(e.videoId)) {
          upd.run(e.title, e.publishedAt, now, e.videoId);
        } else {
          ins.run(e.videoId, ytChannelId, e.title, e.description?.slice(0, 1500) ?? null, e.publishedAt, now);
          added++;
        }
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { added };
  }

  // ---------------------------------------------------------------- 검색 기록

  lastSearchedAt(platform: Platform, channelId: string): string | null {
    const r = this.db
      .prepare(`SELECT searched_at FROM clip_searches WHERE platform = ? AND channel_id = ?`)
      .get(platform, channelId) as { searched_at: string } | undefined;
    return r?.searched_at ?? null;
  }

  recordSearch(platform: Platform, channelId: string, found: number): void {
    this.db
      .prepare(`
        INSERT INTO clip_searches (platform, channel_id, searched_at, found) VALUES (?, ?, ?, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET searched_at = excluded.searched_at, found = excluded.found
      `)
      .run(platform, channelId, new Date().toISOString(), found);
  }

  searchedCount(): number {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM clip_searches`).get() as { n: number }).n);
  }

  // ---------------------------------------------------------------- 클립

  private hydrate(rows: Array<Record<string, unknown>>): ClipRow[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.video_id as string);
    const ph = ids.map(() => "?").join(",");
    const vt = this.db
      .prepare(`SELECT video_id, platform, channel_id FROM clip_vtubers WHERE video_id IN (${ph}) ORDER BY position`)
      .all(...ids) as unknown as Array<{ video_id: string; platform: Platform; channel_id: string }>;
    const tg = this.db.prepare(`SELECT video_id, tag FROM clip_tags_eff WHERE video_id IN (${ph})`).all(...ids) as unknown as Array<{
      video_id: string;
      tag: string;
    }>;
    const vtMap = new Map<string, { platform: Platform; channelId: string }[]>();
    for (const v of vt) {
      const l = vtMap.get(v.video_id) ?? [];
      l.push({ platform: v.platform, channelId: v.channel_id });
      vtMap.set(v.video_id, l);
    }
    const tgMap = new Map<string, string[]>();
    for (const t of tg) tgMap.set(t.video_id, [...(tgMap.get(t.video_id) ?? []), t.tag]);
    return rows.map((r) => {
      const id = r.video_id as string;
      const category = str(r.category);
      const tagsAll = (tgMap.get(id) ?? []).filter((t) => t !== category);
      const stored = str(r.primary_moment);
      const primary = stored && tagsAll.includes(stored) ? stored : null;
      return {
        videoId: id,
        ytChannelId: r.yt_channel_id as string,
        title: r.title as string,
        description: str(r.description),
        publishedAt: r.published_at as string,
        classStatus: r.class_status as ClassStatus,
        classTries: Number(r.class_tries ?? 0),
        category,
        topic: str(r.topic),
        summary: str(r.summary),
        moments: primary ? [primary, ...tagsAll.filter((t) => t !== primary)] : tagsAll,
        vtubers: vtMap.get(id) ?? [],
        channelTitle: str(r.ch_title),
        likes: Number(r.likes ?? 0),
        hintPlatform: (str(r.hint_platform) as Platform | null) ?? null,
        hintChannelId: str(r.hint_channel_id),
        primaryMoment: primary,
        event: str(r.event),
        sourceUrl: str(r.source_url),
        sourceKey: str(r.source_key),
        sourceDate: str(r.source_date),
        classVer: Number(r.class_ver ?? 1),
        checkedAt: str(r.checked_at),
      };
    });
  }

  private selectClips(where: string, tail: string, params: unknown[]): ClipRow[] {
    const rows = this.db
      .prepare(`
        SELECT c.*, ch.title AS ch_title, ch.hint_platform, ch.hint_channel_id, COALESCE(st.likes, 0) AS likes
        FROM clips c JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
        LEFT JOIN clip_stats st ON st.video_id = c.video_id
        WHERE ${where} ${tail}
      `)
      .all(...(params as never[])) as unknown as Array<Record<string, unknown>>;
    return this.hydrate(rows);
  }

  /** 사이트맵용 — 보이는 클립 ID·게시일 (최신순) */
  sitemapClips(limit: number): { videoId: string; publishedAt: string }[] {
    const rows = this.db
      .prepare(`
        SELECT c.video_id, c.published_at FROM clips c
        JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
        WHERE ${VISIBLE} ORDER BY c.published_at DESC LIMIT ?
      `)
      .all(limit) as unknown as Array<{ video_id: string; published_at: string }>;
    return rows.map((r) => ({ videoId: r.video_id, publishedAt: r.published_at }));
  }

  getClip(videoId: string, visibleOnly = true): ClipRow | null {
    return this.selectClips(`c.video_id = ?${visibleOnly ? ` AND ${VISIBLE}` : ""}`, "", [videoId])[0] ?? null;
  }

  /** 분류를 기다리는 클립 (최신 우선, 차단 채널 제외) */
  pendingClips(limit: number, maxTries: number): ClipRow[] {
    return this.selectClips(
      `c.class_status IN ('pending', 'failed') AND c.class_tries < ? AND ch.status != 'blocked'`,
      `ORDER BY c.published_at DESC LIMIT ?`,
      [maxTries, limit],
    );
  }

  countByStatus(): Record<string, number> {
    const rows = this.db.prepare(`SELECT class_status AS s, COUNT(*) AS n FROM clips GROUP BY class_status`).all() as unknown as Array<{
      s: string;
      n: number;
    }>;
    return Object.fromEntries(rows.map((r) => [r.s, Number(r.n)]));
  }

  /** 분류 결과 저장. 설명(분류 입력)은 다 쓰면 지운다 */
  saveClassification(results: ClipClass[]): void {
    const now = new Date().toISOString();
    const upd = this.db.prepare(`
      UPDATE clips SET class_status = ?, class_at = ?, category = ?, topic = ?, summary = ?, description = NULL,
        primary_moment = ?, event = ?, source_url = ?, source_key = ?, source_date = ?, class_ver = ?
      WHERE video_id = ?
    `);
    const delV = this.db.prepare(`DELETE FROM clip_vtubers WHERE video_id = ?`);
    const delT = this.db.prepare(`DELETE FROM clip_tags WHERE video_id = ?`);
    const insV = this.db.prepare(`INSERT OR IGNORE INTO clip_vtubers (video_id, platform, channel_id, position) VALUES (?, ?, ?, ?)`);
    const insT = this.db.prepare(`INSERT OR IGNORE INTO clip_tags (video_id, tag) VALUES (?, ?)`);
    this.db.exec("BEGIN");
    try {
      for (const r of results) {
        upd.run(
          r.isClip ? "done" : "not_clip",
          now,
          r.category,
          r.topic,
          r.summary,
          r.moments[0] ?? null,
          r.event,
          r.source?.url ?? null,
          r.source?.key ?? null,
          r.sourceDate,
          CLASS_VER,
          r.videoId,
        );
        delV.run(r.videoId);
        delT.run(r.videoId);
        if (!r.isClip) continue;
        r.vtubers.forEach((v, i) => insV.run(r.videoId, v.platform, v.channelId, i));
        if (r.category) insT.run(r.videoId, r.category);
        for (const m of r.moments) insT.run(r.videoId, m);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** 보강 대상: 예전 버전으로 분류된 클립 (좋아요 많은·최신 순) */
  enrichPool(limit: number): ClipRow[] {
    return this.selectClips(
      `c.class_status = 'done' AND c.class_ver < ? AND ch.status != 'blocked'`,
      `ORDER BY COALESCE(st.likes, 0) DESC, c.published_at DESC LIMIT ?`,
      [CLASS_VER, limit],
    );
  }

  /** 보강 결과 저장 — 순간 태그만 바꾸고(카테고리 태그는 그대로) 주제·사건·대표 순간 기록 */
  saveEnrichment(results: ClipEnrich[]): void {
    const upd = this.db.prepare(
      `UPDATE clips SET primary_moment = ?, topic = COALESCE(?, topic), event = ?, class_ver = ? WHERE video_id = ?`,
    );
    const delM = this.db.prepare(
      `DELETE FROM clip_tags WHERE video_id = ? AND tag != COALESCE((SELECT category FROM clips WHERE video_id = ?), '')`,
    );
    const insT = this.db.prepare(`INSERT OR IGNORE INTO clip_tags (video_id, tag) VALUES (?, ?)`);
    this.db.exec("BEGIN");
    try {
      for (const r of results) {
        upd.run(r.moments[0] ?? null, r.topic, r.event, CLASS_VER, r.videoId);
        if (r.moments.length === 0) continue; // 순간을 못 정했으면 기존 태그 유지
        delM.run(r.videoId, r.videoId);
        for (const m of r.moments) insT.run(r.videoId, m);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** 분류 버전별 클립 수 (보강 진행 상황) */
  classVerCounts(): Record<string, number> {
    const rows = this.db
      .prepare(`SELECT class_ver AS v, COUNT(*) AS n FROM clips WHERE class_status = 'done' GROUP BY class_ver`)
      .all() as unknown as Array<{ v: number; n: number }>;
    return Object.fromEntries(rows.map((r) => [`v${r.v}`, Number(r.n)]));
  }

  /** 주제 별칭 사전 (정규화한 별칭 → 정식 이름) */
  topicAliasMap(): Map<string, string> {
    const rows = this.db.prepare(`SELECT alias, topic FROM clip_topic_alias`).all() as unknown as Array<{ alias: string; topic: string }>;
    return new Map(rows.map((r) => [r.alias, r.topic]));
  }

  /** 별칭 등록 + 기존 클립의 주제도 바꿈. 바꾼 클립 수 */
  setTopicAlias(aliasRaw: string, topic: string, source: "manual" | "seed"): number {
    const alias = topicKey(aliasRaw);
    const to = topic.replace(/\s+/g, " ").trim();
    if (!alias || !to) return 0;
    this.db
      .prepare(
        `INSERT INTO clip_topic_alias (alias, topic, source, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(alias) DO UPDATE SET topic = excluded.topic, source = excluded.source, updated_at = excluded.updated_at`,
      )
      .run(alias, to, source, new Date().toISOString());
    const rows = this.db.prepare(`SELECT DISTINCT topic FROM clips WHERE topic IS NOT NULL`).all() as unknown as Array<{ topic: string }>;
    const upd = this.db.prepare(`UPDATE clips SET topic = ? WHERE topic = ?`);
    let changed = 0;
    for (const r of rows) {
      if (r.topic !== to && topicKey(r.topic) === alias) changed += Number(upd.run(to, r.topic).changes);
    }
    return changed;
  }

  /** 많이 쓰인 주제 이름 (분류 프롬프트에 보여 주고 그대로 쓰게 한다) */
  allTopics(limit: number): { topic: string; count: number }[] {
    const rows = this.db
      .prepare(`
        SELECT c.topic AS topic, COUNT(*) AS n FROM clips c
        JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
        WHERE ${VISIBLE} AND c.topic IS NOT NULL AND c.topic != ''
        GROUP BY c.topic ORDER BY n DESC LIMIT ?
      `)
      .all(limit) as unknown as Array<{ topic: string; n: number }>;
    return rows.map((r) => ({ topic: r.topic, count: Number(r.n) }));
  }

  /** 최근 사건·밈 이름 (같은 사건이면 같은 이름을 쓰게 프롬프트에 보여 준다) */
  recentEvents(days: number, limit: number): { event: string; count: number; lastAt: string }[] {
    const since = new Date(Date.now() - days * DAY).toISOString();
    const rows = this.db
      .prepare(`
        SELECT c.event AS event, COUNT(*) AS n, MAX(c.published_at) AS last FROM clips c
        JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
        WHERE ${VISIBLE} AND c.event IS NOT NULL AND c.event != '' AND c.published_at >= ?
        GROUP BY c.event ORDER BY n DESC, last DESC LIMIT ?
      `)
      .all(since, limit) as unknown as Array<{ event: string; n: number; last: string }>;
    return rows.map((r) => ({ event: r.event, count: Number(r.n), lastAt: r.last }));
  }

  /** 분류 시도 실패 (응답에 빠짐 등) — 몇 번까지만 다시 */
  markClassFailed(videoIds: string[]): void {
    const st = this.db.prepare(`UPDATE clips SET class_status = 'failed', class_tries = class_tries + 1 WHERE video_id = ?`);
    for (const id of videoIds) st.run(id);
  }

  /** 분류된 클립 목록 (최신순) */
  listClips(q: ClipQuery): { total: number; clips: ClipRow[] } {
    const conds = [VISIBLE];
    const params: unknown[] = [];
    if (q.tag) {
      conds.push(`EXISTS (SELECT 1 FROM clip_tags_eff t WHERE t.video_id = c.video_id AND t.tag = ?)`);
      params.push(q.tag);
    }
    if (q.vtuber) {
      conds.push(`EXISTS (SELECT 1 FROM clip_vtubers v WHERE v.video_id = c.video_id AND v.platform = ? AND v.channel_id = ?)`);
      params.push(q.vtuber.platform, q.vtuber.channelId);
    }
    const where = conds.join(" AND ");
    const total = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS n FROM clips c JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id WHERE ${where}`)
          .get(...(params as never[])) as { n: number }
      ).n,
    );
    const order = q.sort === "likes" ? `COALESCE(st.likes, 0) DESC, c.published_at DESC` : `c.published_at DESC`;
    const clips = this.selectClips(where, `ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, q.limit, q.offset]);
    return { total, clips };
  }

  /** 비슷한 클립 후보: 같은 버튜버 / 같은 태그·주제를 가진 최근 클립 */
  similarPool(clip: ClipRow, limit: number): ClipRow[] {
    const tags = [clip.category, ...clip.moments].filter((t): t is string => !!t);
    const vt = clip.vtubers;
    const ors: string[] = [];
    const params: unknown[] = [clip.videoId];
    if (vt.length) {
      ors.push(`EXISTS (SELECT 1 FROM clip_vtubers v WHERE v.video_id = c.video_id AND (${vt.map(() => "(v.platform = ? AND v.channel_id = ?)").join(" OR ")}))`);
      for (const v of vt) params.push(v.platform, v.channelId);
    }
    if (tags.length) {
      ors.push(`EXISTS (SELECT 1 FROM clip_tags_eff t WHERE t.video_id = c.video_id AND t.tag IN (${tags.map(() => "?").join(",")}))`);
      params.push(...tags);
    }
    if (clip.topic) {
      ors.push(`lower(c.topic) = lower(?)`);
      params.push(clip.topic);
    }
    if (clip.event) {
      ors.push(`c.event = ?`);
      params.push(clip.event);
    }
    if (clip.sourceKey) {
      ors.push(`c.source_key = ?`);
      params.push(clip.sourceKey);
    }
    if (ors.length === 0) return [];
    return this.selectClips(`c.video_id != ? AND ${VISIBLE} AND (${ors.join(" OR ")})`, `ORDER BY c.published_at DESC LIMIT ?`, [
      ...params,
      limit,
    ]);
  }

  /** 태그별 클립 수 */
  tagCounts(vtuber?: { platform: Platform; channelId: string }): Map<string, number> {
    const rows = (
      vtuber
        ? this.db
            .prepare(`
              SELECT t.tag, COUNT(*) AS n FROM clip_tags_eff t
              JOIN clips c ON c.video_id = t.video_id JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
              JOIN clip_vtubers v ON v.video_id = c.video_id AND v.platform = ? AND v.channel_id = ?
              WHERE ${VISIBLE} GROUP BY t.tag
            `)
            .all(vtuber.platform, vtuber.channelId)
        : this.db
            .prepare(`
              SELECT t.tag, COUNT(*) AS n FROM clip_tags_eff t
              JOIN clips c ON c.video_id = t.video_id JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
              WHERE ${VISIBLE} GROUP BY t.tag
            `)
            .all()
    ) as unknown as Array<{ tag: string; n: number }>;
    return new Map(rows.map((r) => [r.tag, Number(r.n)]));
  }

  /** 버튜버의 자주 나오는 주제 (게임 이름 등) */
  topTopics(vtuber: { platform: Platform; channelId: string }, limit: number): { topic: string; count: number }[] {
    const rows = this.db
      .prepare(`
        SELECT c.topic AS topic, COUNT(*) AS n FROM clips c
        JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
        JOIN clip_vtubers v ON v.video_id = c.video_id AND v.platform = ? AND v.channel_id = ?
        WHERE ${VISIBLE} AND c.topic IS NOT NULL AND c.topic != ''
        GROUP BY lower(c.topic) ORDER BY n DESC LIMIT ?
      `)
      .all(vtuber.platform, vtuber.channelId, limit) as unknown as Array<{ topic: string; n: number }>;
    return rows.map((r) => ({ topic: r.topic, count: Number(r.n) }));
  }

  /** 채널별 분류 결과 — 클립이 아닌 영상이 대부분이면 자동 차단할 근거 */
  channelClassStats(ytChannelId: string): { done: number; notClip: number } {
    const r = this.db
      .prepare(`
        SELECT SUM(class_status = 'done') AS d, SUM(class_status = 'not_clip') AS x FROM clips WHERE yt_channel_id = ?
      `)
      .get(ytChannelId) as { d: number | null; x: number | null };
    return { done: Number(r.d ?? 0), notClip: Number(r.x ?? 0) };
  }

  /** RSS 에 없고 확인이 오래된 클립 — videos.list 로 남아 있는지 확인 */
  clipsNeedingCheck(maxAgeMs: number, limit: number): string[] {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const rows = this.db
      .prepare(`
        SELECT video_id FROM clips
        WHERE feed_seen_at < ? AND (checked_at IS NULL OR checked_at < ?)
        ORDER BY COALESCE(checked_at, feed_seen_at) LIMIT ?
      `)
      .all(cutoff, cutoff, limit) as unknown as Array<{ video_id: string }>;
    return rows.map((r) => r.video_id);
  }

  /** videos.list 확인 결과: 있는 영상은 제목·확인 시각 갱신, 없는 영상(삭제·비공개)은 지움 */
  saveChecks(requested: string[], found: { videoId: string; title: string | null }[]): number {
    const now = new Date().toISOString();
    const got = new Map(found.map((f) => [f.videoId, f.title]));
    let removed = 0;
    this.db.exec("BEGIN");
    try {
      for (const id of requested) {
        if (got.has(id)) {
          this.db.prepare(`UPDATE clips SET checked_at = ?, title = COALESCE(?, title) WHERE video_id = ?`).run(now, got.get(id) ?? null, id);
        } else {
          this.deleteClip(id);
          removed++;
        }
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return removed;
  }

  private deleteClip(videoId: string): void {
    this.db.prepare(`DELETE FROM clips WHERE video_id = ?`).run(videoId);
    this.db.prepare(`DELETE FROM clip_vtubers WHERE video_id = ?`).run(videoId);
    this.db.prepare(`DELETE FROM clip_tags WHERE video_id = ?`).run(videoId);
    this.db.prepare(`DELETE FROM clip_vote_tags WHERE video_id = ?`).run(videoId);
    this.db.prepare(`DELETE FROM clip_stats WHERE video_id = ?`).run(videoId);
  }

  // ---------------------------------------------------------------- 참여 집계 (사용자 DB → 복사)

  setLikes(videoId: string, likes: number): void {
    this.db
      .prepare(`INSERT INTO clip_stats (video_id, likes) VALUES (?, ?) ON CONFLICT(video_id) DO UPDATE SET likes = excluded.likes`)
      .run(videoId, Math.max(0, likes));
  }

  setVoteAgg(videoId: string, agg: { tag: string; up: number; down: number }[]): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM clip_vote_tags WHERE video_id = ?`).run(videoId);
      const ins = this.db.prepare(`INSERT INTO clip_vote_tags (video_id, tag, up, down) VALUES (?, ?, ?, ?)`);
      for (const a of agg) if (a.up || a.down) ins.run(videoId, a.tag, a.up, a.down);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** 서버 시작 시 사용자 DB 의 전체 합계로 맞춘다 */
  replaceAggregates(likes: Map<string, number>, votes: Map<string, { tag: string; up: number; down: number }[]>): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec(`DELETE FROM clip_stats; DELETE FROM clip_vote_tags;`);
      const l = this.db.prepare(`INSERT INTO clip_stats (video_id, likes) VALUES (?, ?)`);
      for (const [id, n] of likes) l.run(id, n);
      const v = this.db.prepare(`INSERT INTO clip_vote_tags (video_id, tag, up, down) VALUES (?, ?, ?, ?)`);
      for (const [id, list] of votes) for (const a of list) v.run(id, a.tag, a.up, a.down);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** 클립의 Claude 태그(순간)와 투표 집계 — 상세 화면의 태그 투표 */
  tagVoteView(videoId: string): { tag: string; ai: boolean; up: number; down: number }[] {
    const ai = new Set(
      (this.db.prepare(`SELECT tag FROM clip_tags WHERE video_id = ?`).all(videoId) as unknown as Array<{ tag: string }>).map((r) => r.tag),
    );
    const votes = this.db.prepare(`SELECT tag, up, down FROM clip_vote_tags WHERE video_id = ?`).all(videoId) as unknown as Array<{
      tag: string;
      up: number;
      down: number;
    }>;
    const out = new Map<string, { tag: string; ai: boolean; up: number; down: number }>();
    for (const t of ai) out.set(t, { tag: t, ai: true, up: 0, down: 0 });
    for (const v of votes) out.set(v.tag, { tag: v.tag, ai: ai.has(v.tag), up: Number(v.up), down: Number(v.down) });
    return [...out.values()];
  }

  /** 영상 ID 목록 → 보이는 클립 (순서 유지, 없어진 클립은 빠짐) */
  clipsByIds(ids: string[]): ClipRow[] {
    if (ids.length === 0) return [];
    const rows = this.selectClips(`c.video_id IN (${ids.map(() => "?").join(",")}) AND ${VISIBLE}`, "", ids);
    const byId = new Map(rows.map((r) => [r.videoId, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ClipRow => !!r);
  }

  /** 좋아요·투표·재생목록에 담을 수 있는 클립인지 (분류 완료 + 차단 안 됨) */
  isVisible(videoId: string): boolean {
    return !!this.getClip(videoId);
  }

  /** 정리: 30일 넘게 RSS·API 로 확인하지 못한 클립, 차단된 채널의 클립을 지운다 */
  purgeStale(): number {
    const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
    const ids = this.db
      .prepare(`
        SELECT c.video_id FROM clips c LEFT JOIN clip_channels ch ON ch.yt_channel_id = c.yt_channel_id
        WHERE ch.yt_channel_id IS NULL OR ch.status = 'blocked'
           OR (c.feed_seen_at < ? AND (c.checked_at IS NULL OR c.checked_at < ?))
      `)
      .all(cutoff, cutoff) as unknown as Array<{ video_id: string }>;
    if (ids.length === 0) return 0;
    this.db.exec("BEGIN");
    try {
      for (const r of ids) this.deleteClip(r.video_id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return ids.length;
  }
}
