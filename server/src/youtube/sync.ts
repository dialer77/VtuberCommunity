// 유튜브 공식 채널 연동 작업 (서버 안에서 주기적으로 실행).
//  1) 매핑   10분마다 — 상위 채널부터 치지직·SOOP 채널 정보의 유튜브 링크로 공식 채널 추정
//  2) RSS    1분마다 확인할 차례인 채널만 — 최근 라이브가 있던 채널 10분, 나머지 60분 (할당량 0)
//  3) 상세   1분마다 (키가 있을 때) — 새 영상 상세, 방송 중·곧 시작할 예정 영상 상태 (videos.list 50개 1단위)
//  4) 정리   30일 넘은 API 값 갱신·삭제 (정책)
// 유튜브 시청자 수는 LIVE 목록에만 쓰고 랭킹·합계·데뷔 감지(live_snapshots)에는 넣지 않는다.
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { LinkCandidate, YtLink } from "./store";
import { config } from "../config";
import { log } from "../log";
import { fetchSocialLinks, pickYoutube } from "./links";
import { fetchFeed } from "./rss";
import { QuotaExceededError, channelByHandle, channelsByIds, quotaAllows, videosByIds, ytApiEnabled } from "./api";

const MIN = 60_000;
const MAP_EVERY_MS = 10 * MIN;
const MAP_PER_RUN = 30;
const FEED_COLD_MS = 60 * MIN;
const FEED_HOT_MS = 10 * MIN;
const FEEDS_PER_TICK = 12;
const FEED_CONCURRENCY = 3;
/** 예정 영상: 시작 15분 전부터 매분 확인, 예정 시각이 6시간 지나도 시작 안 하면 가끔만 */
const SOON_MS = 15 * MIN;
const LATE_MS = 6 * 60 * MIN;
const SLOW_EVERY_MS = 30 * MIN;
/** API 값은 30일 안에 갱신 — 여유를 두고 20일 */
const REFRESH_AGE_MS = 20 * 24 * 60 * MIN;
const PURGE_EVERY_MS = 6 * 60 * MIN;

export interface MapTarget {
  platform: Platform;
  channelId: string;
  name: string;
}

/** 매핑 대상 — 월간 시청시간 상위 → 지금 방송 중 → 버튜버 확정 목록 (치지직·SOOP 만) */
export function mappingTargets(store: SqliteStore, top = config.youtubeMapTop): MapTarget[] {
  const out: MapTarget[] = [];
  const seen = new Set<string>();
  const add = (platform: Platform, channelId: string, name: string) => {
    if (platform !== "chzzk" && platform !== "soop") return;
    const k = `${platform}:${channelId}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ platform, channelId, name });
  };
  for (const r of store.getPeriodRanking(30, "watch", top).ranking) add(r.platform, r.channelId, r.channelName);
  for (const l of store.getCurrentLives()) add(l.platform, l.channelId, l.channelName);
  for (const r of store.listRegistry()) add(r.platform, r.channelId, r.name);
  return out;
}

export interface MapResult {
  status: YtLink["status"];
  ytChannelId: string | null;
  note: string | null;
}

/** 한 채널의 유튜브 공식 채널 추정·저장 */
export async function mapChannel(store: SqliteStore, t: MapTarget): Promise<MapResult> {
  const repo = store.youtube;
  const links = (await fetchSocialLinks(t.platform, t.channelId)).map((l) => ({ ...l, from: t.platform }));
  const pick = pickYoutube(links, t.name);
  const checkedAt = new Date().toISOString();

  // @핸들 → 채널 ID (받아 둔 값 → API 1단위)
  const resolve = async (c: LinkCandidate): Promise<"ok" | "needs_key" | "handle_not_found" | "quota"> => {
    if (c.ytChannelId || !c.handle) return "ok";
    const cached = repo.channelIdForHandle(c.handle);
    if (cached) {
      c.ytChannelId = cached;
      return "ok";
    }
    if (!ytApiEnabled()) return "needs_key";
    if (!quotaAllows(store, false)) return "quota";
    try {
      const info = await channelByHandle(store, c.handle);
      if (!info) return "handle_not_found";
      repo.saveChannelInfo({ ...info, handle: info.handle ?? c.handle });
      c.ytChannelId = info.ytChannelId;
      return "ok";
    } catch (e) {
      if (e instanceof QuotaExceededError) return "quota";
      throw e;
    }
  };

  let status: YtLink["status"];
  let note: string | null = null;
  let chosen = pick.chosen;
  if (!chosen) {
    status = pick.reason === "nolink" ? "nolink" : "pending";
    note = pick.reason === "nolink" ? null : pick.reason;
  } else if (!chosen.ytChannelId && !chosen.handle) {
    status = "pending";
    note = "legacy_url"; // /c/·/user/ 주소 — 운영자가 채널 주소로 지정
  } else {
    const r = await resolve(chosen);
    if (r === "ok") {
      status = "auto";
      // 다른 버튜버에도 연결된 채널이면 소속사·그룹 공용 채널일 수 있다 → 자동 연결하지 않고 운영자에게
      if (repo.otherClaimants(chosen.ytChannelId!, t.platform, t.channelId).length > 0) {
        repo.demoteSharedAuto(chosen.ytChannelId!);
        status = "pending";
        note = "shared";
      }
    } else {
      status = "pending";
      note = r;
    }
  }
  if (status !== "auto") chosen = null;

  repo.saveAutoLink({
    platform: t.platform,
    channelId: t.channelId,
    name: t.name,
    ytChannelId: chosen?.ytChannelId ?? null,
    ytHandle: chosen?.handle ?? null,
    status,
    source: chosen ? `${chosen.from}-link` : null,
    note,
    candidates: pick.candidates,
    checkedAt,
  });
  return { status, ytChannelId: chosen?.ytChannelId ?? null, note };
}

/** 매핑 1회 — 확인할 차례인 채널을 상위부터 limit 개 */
export async function runMapping(store: SqliteStore, limit = MAP_PER_RUN): Promise<{ checked: number; auto: number; failed: number }> {
  const hasKey = ytApiEnabled();
  const due = mappingTargets(store).filter((t) => store.youtube.isLinkCheckDue(t.platform, t.channelId, hasKey));
  let auto = 0;
  let failed = 0;
  const batch = due.slice(0, limit);
  for (const t of batch) {
    try {
      const r = await mapChannel(store, t);
      if (r.status === "auto") auto++;
    } catch {
      failed++; // 플랫폼 응답 실패 — 확인 시각을 남기지 않아 다음 실행 때 다시
    }
  }
  if (batch.length > 0) {
    log.info(`유튜브 매핑: ${batch.length}개 확인 · 자동 연결 ${auto}${failed ? ` · 실패 ${failed}` : ""} (남은 대상 ${due.length - batch.length})`);
  }
  return { checked: batch.length, auto, failed };
}

/** RSS — 확인할 차례인 채널만 */
export async function runFeeds(store: SqliteStore, limit = FEEDS_PER_TICK): Promise<{ fetched: number; added: number; failed: number }> {
  const repo = store.youtube;
  const ids = repo.mappedYtChannels();
  const hot = ytApiEnabled() ? repo.channelsWithRecentLive(30) : new Set<string>();
  const due = repo.feedsDue(ids, FEED_COLD_MS, FEED_HOT_MS, hot).slice(0, limit);
  let added = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += FEED_CONCURRENCY) {
    const part = due.slice(i, i + FEED_CONCURRENCY);
    const feeds = await Promise.all(part.map((id) => fetchFeed(id).catch(() => null)));
    part.forEach((id, k) => {
      const f = feeds[k] ?? null;
      if (!f) failed++;
      added += repo.saveFeed(id, f).added.length;
    });
  }
  return { fetched: due.length, added, failed };
}

let lastSlowAt = 0;
let lastPurgeAt = 0;

/** 상세·라이브 상태 (키가 있을 때만) */
export async function runDetails(store: SqliteStore): Promise<{ units: number; live: number }> {
  const repo = store.youtube;
  let units = 0;
  const fetchDetails = async (ids: string[], essential: boolean) => {
    if (ids.length === 0) return;
    const details = await videosByIds(store, ids, essential);
    units += Math.ceil(ids.length / 50);
    repo.saveVideoDetails(ids, details);
  };

  // 방송 중 + 곧 시작할 예정 영상 → 매분
  const { near, far } = repo.liveWatchTargets(SOON_MS, LATE_MS);
  await fetchDetails(near, true);
  // 새로 발견한 영상
  await fetchDetails(repo.videosWithoutDetail(200), false);

  if (Date.now() - lastSlowAt >= SLOW_EVERY_MS) {
    lastSlowAt = Date.now();
    // 먼 예정 영상 (예정 변경·조기 시작), 오래된 상세, 채널 정보 (30일 안에 갱신)
    await fetchDetails(far, false);
    await fetchDetails(repo.videosWithStaleDetail(REFRESH_AGE_MS, 100), false);
    const needInfo = repo.channelsNeedingInfo(repo.mappedYtChannels(), REFRESH_AGE_MS);
    if (needInfo.length > 0) {
      const infos = await channelsByIds(store, needInfo.slice(0, 200));
      units += Math.ceil(Math.min(needInfo.length, 200) / 50);
      for (const c of infos) repo.saveChannelInfo(c);
    }
  }
  return { units, live: repo.listLiveVideos(10 * MIN).length };
}

export function youtubeSyncStatus(store: SqliteStore) {
  return {
    enabled: config.youtubeSync,
    apiKey: ytApiEnabled(),
    links: store.youtube.statusCounts(),
    channels: store.youtube.mappedYtChannels().length,
  };
}

/** 서버 시작 시 호출. 설정이 없으면(YOUTUBE_API_KEY·YOUTUBE_SYNC) 아무것도 하지 않는다 */
export function startYoutubeSync(store: SqliteStore): void {
  if (!config.youtubeSync) {
    log.info("유튜브 연동 꺼짐 (YOUTUBE_API_KEY 등록 시 켜짐 — docs/youtube-api.md)");
    return;
  }
  log.info(`유튜브 연동 켜짐${ytApiEnabled() ? "" : " — 키 없음: 매핑·RSS 만 (@핸들 변환·라이브 감지 없음)"}`);

  let busy = false;
  let lastMapAt = 0;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (Date.now() - lastMapAt >= MAP_EVERY_MS) {
        lastMapAt = Date.now();
        await runMapping(store).catch((e) => log.error(`유튜브 매핑 실패: ${String(e)}`));
      }
      const f = await runFeeds(store).catch((e) => {
        log.error(`유튜브 RSS 실패: ${String(e)}`);
        return null;
      });
      if (f && f.added > 0) log.info(`유튜브 RSS: ${f.fetched}개 채널 · 새 영상 ${f.added}${f.failed ? ` · 실패 ${f.failed}` : ""}`);
      if (ytApiEnabled()) {
        await runDetails(store).catch((e) => {
          if (e instanceof QuotaExceededError) log.info(`유튜브: ${e.message} — 내일(태평양 자정) 다시`);
          else log.error(`유튜브 상세 실패: ${String(e)}`);
        });
      }
      if (Date.now() - lastPurgeAt >= PURGE_EVERY_MS) {
        lastPurgeAt = Date.now();
        const p = store.youtube.purgeStale();
        if (p.videos || p.channels) log.info(`유튜브 30일 정리: 영상 ${p.videos} · 채널 정보 ${p.channels}`);
      }
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), MIN);
  // 수집 스케줄러 첫 사이클(채널 목록·랭킹)이 끝난 뒤 시작
  setTimeout(() => void tick(), 20_000);
}
