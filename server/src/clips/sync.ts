// 키리누키 수집 (분류는 issues/scheduler.ts 의 Claude 작업이 따로 한다)
//  1) 발견   15분마다 1회 — 상위 버튜버 이름 + "키리누키" 로 search.list (하루 CLIPS_SEARCH_PER_DAY 회, 버튜버당 30일에 한 번)
//            결과에서 채널 ID 만 쓴다. 같은 채널 영상이 2개 이상이거나 채널 이름이 클립 채널 같으면 등록
//  2) RSS    1분마다 확인할 차례인 채널(3시간 주기) — 새 영상을 분류 대기로 (할당량 0)
//  3) 확인   30분마다 — RSS 에서 빠진 지 20일 넘은 클립이 아직 있는지 videos.list (50개 1단위), 없으면 삭제
//  4) 정리   6시간마다 — 30일 넘게 확인 못 한 클립·차단 채널 클립 삭제
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import { config } from "../config";
import { log } from "../log";
import { fetchFeed } from "../youtube/rss";
import { QuotaExceededError, searchAllowed, searchVideoChannels, videoTitles, ytApiEnabled } from "../youtube/api";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const DISCOVER_EVERY_MS = 15 * MIN;
const RESEARCH_AFTER_MS = 30 * DAY;
const FEED_INTERVAL_MS = 3 * 60 * MIN;
const FEEDS_PER_TICK = 10;
const FEED_CONCURRENCY = 3;
const CHECK_EVERY_MS = 30 * MIN;
const CHECK_AGE_MS = 20 * DAY;
const PURGE_EVERY_MS = 6 * 60 * MIN;

/** 클립 채널 이름에 흔한 말 */
const CLIP_CHANNEL = /키리누키|kirinuki|클립|clip|짤|모음|저장소|하이라이트|highlight|편집|잘라|컷|cut/i;
/** 버튜버 본인의 다시보기 채널 (키리누키가 아님). '아카이브'는 팬 채널 이름에도 흔해 빼지 않고 분류에서 거른다 */
const REPLAY_CHANNEL = /다시\s*보기|replay|풀\s*(영상|버전|방송)|vod/i;

export interface DiscoverTarget {
  platform: Platform;
  channelId: string;
  name: string;
}

/** 검색에 쓸 이름 (기호 제거) */
export function searchName(name: string): string {
  return name.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** 키리누키 채널을 찾을 버튜버 — 월간 시청시간 상위 N, 그다음 한국어 유튜브 전용 버튜버. 30일 안에 검색하지 않은 순서대로 */
export function discoverTargets(store: SqliteStore, nowMs = Date.now()): DiscoverTarget[] {
  const top: DiscoverTarget[] = store
    .getPeriodRanking(30, "watch", config.clipsTop)
    .ranking.filter((r) => r.platform === "chzzk" || r.platform === "soop")
    .map((r) => ({ platform: r.platform, channelId: r.channelId, name: r.channelName }));
  const ytOnly: DiscoverTarget[] = store.youtube
    .listVtubers()
    .filter((v) => v.region === "ko")
    .map((v) => ({ platform: "youtube" as const, channelId: v.ytChannelId, name: v.name }));
  return [...top, ...ytOnly]
    .filter((t) => {
      const at = Date.parse(store.clips.lastSearchedAt(t.platform, t.channelId) ?? "");
      return Number.isNaN(at) || nowMs - at > RESEARCH_AFTER_MS;
    });
}

/** 공식 채널(매핑·후보)로 알려진 유튜브 채널 — 키리누키로 등록하지 않는다 */
function officialChannels(store: SqliteStore): Set<string> {
  const set = new Set(store.youtube.mappedYtChannels());
  for (const l of store.youtube.listLinks()) for (const c of l.candidates) if (c.ytChannelId) set.add(c.ytChannelId);
  return set;
}

/** 검색 결과 → 키리누키 채널 후보 */
export function pickClipChannels(
  results: { channelId: string; channelTitle: string }[],
  official: Set<string>,
): { channelId: string; channelTitle: string; hits: number }[] {
  const byCh = new Map<string, { channelId: string; channelTitle: string; hits: number }>();
  for (const r of results) {
    const cur = byCh.get(r.channelId) ?? { channelId: r.channelId, channelTitle: r.channelTitle, hits: 0 };
    cur.hits++;
    byCh.set(r.channelId, cur);
  }
  return [...byCh.values()].filter(
    (c) => !official.has(c.channelId) && !REPLAY_CHANNEL.test(c.channelTitle) && (c.hits >= 2 || CLIP_CHANNEL.test(c.channelTitle)),
  );
}

/** 버튜버 한 명으로 검색해 키리누키 채널 등록. 새로 등록한 채널 수 */
export async function discoverFor(store: SqliteStore, t: DiscoverTarget): Promise<{ found: number; added: number }> {
  const since = new Date(Date.now() - 180 * DAY).toISOString();
  const results = await searchVideoChannels(store, `${searchName(t.name)} 키리누키`, since);
  const picks = pickClipChannels(results, officialChannels(store));
  let added = 0;
  for (const p of picks) {
    if (store.clips.addFoundChannel(p.channelId, { platform: t.platform, channelId: t.channelId }, p.hits)) added++;
  }
  store.clips.recordSearch(t.platform, t.channelId, picks.length);
  return { found: picks.length, added };
}

export async function runDiscover(store: SqliteStore, max: number): Promise<{ searched: number; added: number }> {
  let searched = 0;
  let added = 0;
  for (const t of discoverTargets(store).slice(0, max)) {
    if (!searchAllowed(store)) break;
    const r = await discoverFor(store, t);
    searched++;
    added += r.added;
    log.info(`키리누키 채널 찾기: ${t.name} → 후보 ${r.found} · 새 채널 ${r.added}`);
  }
  return { searched, added };
}

/** RSS — 확인할 차례인 키리누키 채널 */
export async function runClipFeeds(store: SqliteStore, limit = FEEDS_PER_TICK): Promise<{ fetched: number; added: number; failed: number }> {
  const repo = store.clips;
  const official = new Set(store.youtube.mappedYtChannels());
  const due = repo.feedsDue(FEED_INTERVAL_MS, limit);
  let added = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += FEED_CONCURRENCY) {
    const part = due.slice(i, i + FEED_CONCURRENCY);
    const feeds = await Promise.all(part.map((id) => (official.has(id) ? Promise.resolve(null) : fetchFeed(id).catch(() => null))));
    part.forEach((id, k) => {
      if (official.has(id)) {
        // 나중에 공식 채널로 연결된 채널 — 키리누키에서 뺀다
        repo.setChannelStatus(id, "blocked", "official");
        return;
      }
      const f = feeds[k] ?? null;
      if (!f) failed++;
      added += repo.saveFeed(id, f).added;
    });
  }
  return { fetched: due.length, added, failed };
}

/** RSS 에서 빠진 지 오래된 클립 확인 */
export async function runClipChecks(store: SqliteStore): Promise<{ checked: number; removed: number }> {
  const ids = store.clips.clipsNeedingCheck(CHECK_AGE_MS, 200);
  if (ids.length === 0) return { checked: 0, removed: 0 };
  const found = await videoTitles(store, ids);
  return { checked: ids.length, removed: store.clips.saveChecks(ids, found) };
}

/** 서버 시작 시 호출. CLIPS_ENABLED(기본: ISSUES_ENABLED)와 YouTube 키가 모두 있어야 켜진다 */
export function startClipSync(store: SqliteStore): void {
  if (!config.clipsEnabled || !ytApiEnabled()) {
    log.info(`키리누키 수집 꺼짐 (${!config.clipsEnabled ? "CLIPS_ENABLED=1 로 켜기" : "YouTube 키 필요"} — docs/youtube-api.md)`);
    return;
  }
  log.info(`키리누키 수집 켜짐 — 상위 ${config.clipsTop}명, 검색 하루 ${config.clipsSearchPerDay}회`);
  let busy = false;
  let lastDiscover = 0;
  let lastCheck = 0;
  let lastPurge = 0;
  const tick = async () => {
    if (busy) return;
    busy = true;
    const now = Date.now();
    try {
      if (now - lastDiscover >= DISCOVER_EVERY_MS) {
        lastDiscover = now;
        await runDiscover(store, 1).catch((e) => {
          if (!(e instanceof QuotaExceededError)) log.error(`키리누키 채널 찾기 실패: ${String(e)}`);
        });
      }
      const f = await runClipFeeds(store).catch((e) => {
        log.error(`키리누키 RSS 실패: ${String(e)}`);
        return null;
      });
      if (f && f.added > 0) log.info(`키리누키 RSS: ${f.fetched}개 채널 · 새 클립 ${f.added}${f.failed ? ` · 실패 ${f.failed}` : ""}`);
      if (now - lastCheck >= CHECK_EVERY_MS) {
        lastCheck = now;
        const c = await runClipChecks(store).catch((e) => {
          if (!(e instanceof QuotaExceededError)) log.error(`키리누키 확인 실패: ${String(e)}`);
          return null;
        });
        if (c && c.removed > 0) log.info(`키리누키: 사라진 클립 ${c.removed}개 정리 (확인 ${c.checked})`);
      }
      if (now - lastPurge >= PURGE_EVERY_MS) {
        lastPurge = now;
        const n = store.clips.purgeStale();
        if (n > 0) log.info(`키리누키 30일 정리: ${n}개`);
      }
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), MIN);
  // 유튜브 매핑(20초 뒤)과 겹치지 않게
  setTimeout(() => void tick(), 45_000);
}
