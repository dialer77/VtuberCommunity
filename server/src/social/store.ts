// 공식 SNS·커뮤니티 링크와 팬아트 태그 (SQLite, 수집 DB 와 같은 파일).
//  vtuber_platform_links  치지직·SOOP 채널 소개에 본인이 걸어 둔 링크 (7일마다 다시 받음)
//  vtuber_social          웹 수집(Claude)으로 찾은 공식 SNS 링크·팬아트 해시태그 + 운영자 수정
import type { DatabaseSync } from "node:sqlite";
import type { Platform } from "../domain";
import type { RawLink } from "../youtube/links";

export type HashtagKind = "fanart" | "clip" | "stream" | "other";

export interface Hashtag {
  tag: string;
  kind: HashtagKind;
}

export interface WebSocial {
  links: string[];
  hashtags: Hashtag[];
  /** 운영자가 고쳤으면 웹 수집이 덮어쓰지 않음 */
  manual: boolean;
  checkedAt: string;
}

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class SocialRepo {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vtuber_platform_links (
        platform    TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        links       TEXT NOT NULL DEFAULT '[]',
        ok          INTEGER NOT NULL DEFAULT 1,
        fetched_at  TEXT NOT NULL,
        PRIMARY KEY (platform, channel_id)
      );
      CREATE TABLE IF NOT EXISTS vtuber_social (
        platform    TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        links       TEXT NOT NULL DEFAULT '[]',
        hashtags    TEXT NOT NULL DEFAULT '[]',
        manual      INTEGER NOT NULL DEFAULT 0,
        checked_at  TEXT NOT NULL,
        PRIMARY KEY (platform, channel_id)
      );
    `);
  }

  // ---------------------------------------------------------------- 채널 소개 링크

  platformLinks(platform: Platform, channelId: string): RawLink[] {
    const r = this.db
      .prepare(`SELECT links FROM vtuber_platform_links WHERE platform = ? AND channel_id = ?`)
      .get(platform, channelId) as { links: string } | undefined;
    return parse<RawLink[]>(r?.links, []);
  }

  /** 다시 받을 차례 (없음 · 성공 후 7일 · 실패 후 1일) */
  platformLinksDue(platform: Platform, channelId: string, nowMs = Date.now()): boolean {
    const r = this.db
      .prepare(`SELECT ok, fetched_at FROM vtuber_platform_links WHERE platform = ? AND channel_id = ?`)
      .get(platform, channelId) as { ok: number; fetched_at: string } | undefined;
    if (!r) return true;
    const age = nowMs - (Date.parse(r.fetched_at) || 0);
    return age > (Number(r.ok) ? 7 : 1) * 86_400_000;
  }

  /** links = null 이면 실패 (예전 링크는 그대로 두고 시각만) */
  savePlatformLinks(platform: Platform, channelId: string, links: RawLink[] | null): void {
    const now = new Date().toISOString();
    if (links === null) {
      this.db
        .prepare(`
          INSERT INTO vtuber_platform_links (platform, channel_id, ok, fetched_at) VALUES (?, ?, 0, ?)
          ON CONFLICT(platform, channel_id) DO UPDATE SET ok = 0, fetched_at = excluded.fetched_at
        `)
        .run(platform, channelId, now);
      return;
    }
    this.db
      .prepare(`
        INSERT INTO vtuber_platform_links (platform, channel_id, links, ok, fetched_at) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET links = excluded.links, ok = 1, fetched_at = excluded.fetched_at
      `)
      .run(platform, channelId, JSON.stringify(links.slice(0, 20)), now);
  }

  platformLinkCount(): number {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM vtuber_platform_links WHERE links != '[]'`).get() as { n: number }).n);
  }

  // ---------------------------------------------------------------- 웹 수집·운영자

  web(platform: Platform, channelId: string): WebSocial | null {
    const r = this.db
      .prepare(`SELECT * FROM vtuber_social WHERE platform = ? AND channel_id = ?`)
      .get(platform, channelId) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      links: parse<string[]>(r.links, []),
      hashtags: parse<Hashtag[]>(r.hashtags, []),
      manual: Number(r.manual) === 1,
      checkedAt: r.checked_at as string,
    };
  }

  /** 웹 수집을 한 적이 있는지 (생일·데뷔일 수집과 같이 한다) */
  webChecked(platform: Platform, channelId: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM vtuber_social WHERE platform = ? AND channel_id = ?`).get(platform, channelId);
  }

  /** 웹 수집 결과. 운영자가 고친 것은 그대로, 찾은 게 없으면 예전 값 유지 */
  saveWeb(platform: Platform, channelId: string, links: string[], hashtags: Hashtag[]): void {
    const now = new Date().toISOString();
    const cur = this.web(platform, channelId);
    if (cur?.manual) {
      this.db.prepare(`UPDATE vtuber_social SET checked_at = ? WHERE platform = ? AND channel_id = ?`).run(now, platform, channelId);
      return;
    }
    const l = links.length ? links : (cur?.links ?? []);
    const h = hashtags.length ? hashtags : (cur?.hashtags ?? []);
    this.db
      .prepare(`
        INSERT INTO vtuber_social (platform, channel_id, links, hashtags, checked_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET links = excluded.links, hashtags = excluded.hashtags, checked_at = excluded.checked_at
      `)
      .run(platform, channelId, JSON.stringify(l.slice(0, 12)), JSON.stringify(h.slice(0, 8)), now);
  }

  /** 운영자 수정 (manual 로 표시 → 웹 수집이 덮어쓰지 않음) */
  setWebManual(platform: Platform, channelId: string, links: string[], hashtags: Hashtag[]): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO vtuber_social (platform, channel_id, links, hashtags, manual, checked_at) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET links = excluded.links, hashtags = excluded.hashtags, manual = 1
      `)
      .run(platform, channelId, JSON.stringify(links), JSON.stringify(hashtags), now);
  }

  /** 운영자 수정 해제 → 다음 웹 수집 때 다시 찾음 */
  clearWebManual(platform: Platform, channelId: string): void {
    this.db.prepare(`DELETE FROM vtuber_social WHERE platform = ? AND channel_id = ?`).run(platform, channelId);
  }

  webCounts(): { checked: number; withLinks: number; withFanart: number } {
    const r = this.db
      .prepare(`
        SELECT COUNT(*) AS n, SUM(CASE WHEN links != '[]' THEN 1 ELSE 0 END) AS l,
          SUM(CASE WHEN hashtags LIKE '%"fanart"%' THEN 1 ELSE 0 END) AS f
        FROM vtuber_social
      `)
      .get() as { n: number; l: number | null; f: number | null };
    return { checked: Number(r.n), withLinks: Number(r.l ?? 0), withFanart: Number(r.f ?? 0) };
  }
}
