// 공식 채널 노래 모음 (커버·오리지널).
//  1) 새 영상: 채널 RSS 제목에 커버·오리지널 표기가 있으면 후보 (할당량 0, runFeeds 에서)
//  2) 예전 영상: 업로드 목록(playlistItems.list, 50개 1단위)을 한 번 끝까지 훑어 같은 기준으로 후보
//     — 이후 30일마다 앞쪽 2쪽만 다시 (RSS 를 놓친 것 보충)
//  3) 확인: videos.list 로 제목·길이·공개 상태를 받아 노래 길이(1~15분)인 것만 보여 준다. 20일마다 다시 확인 (정책: 30일 안에 갱신)
//
// 정책(docs/youtube-api.md): 새 정보·지표를 만들지 않는다 — 제목에 적힌 표기("cover", "커버", "歌ってみた", "Original", "MV" …)로
// 공식 영상 중 노래만 골라 보여 주는 것뿐. 조회수는 받지도 쓰지도 않고, 순서는 올린 날짜만.
import type { SqliteStore } from "../store/sqlite";
import type { SongKind } from "./store";
import { QuotaExceededError, quotaAllows, songVideos, uploadsPage, type MetaStore } from "./api";
import { config } from "../config";
import { log } from "../log";

const COVER = /\bcover(?:ed|s)?\b|커버|歌ってみた|歌わせていただきました|불러\s*(?:보았|봤)|翻唱/i;
const ORIGINAL =
  /\boriginal\s*(?:song|mv|track|music|曲)|오리지널\s*(?:곡|송|노래|mv|m\/v|ost|싱글|single)|[[【(（]\s*(?:오리지널|original)\s*[\]】)）]|オリジナル(?:曲|ソング|楽曲|mv)|自作曲|자작곡|헌정곡|가사\s*영상|\blyrics?\s*video\b|(?:^|[\s【[(（「『|])m\/?v(?:$|[\s】\])）」』|])|뮤직\s*비디오|\bmusic\s*video\b|\bofficial\s*(?:audio|video|mv)\b|\b\d+(?:st|nd|rd|th)\s*(?:digital\s*)?single\b|디지털\s*싱글|신곡|新曲/i;
/** 노래 영상이 아닌 것: 쇼츠·예고·노래 방송·반응·클립·반주·데뷔 공지 등 */
const NOT_SONG =
  /#shorts?\b|\bshorts?\b|teaser|티저|trailer|트레일러|예고|preview|프리뷰|\bxfd\b|crossfade|크로스\s*페이드|making|메이킹|비하인드|behind|reaction|리액션|반응|노래\s*방송|노래방|歌枠|karaoke|가라오케|カラオケ|노래\s*연습|practice|키리누키|切り抜き|\bclips?\b|클립|하이라이트|highlight|굿즈|goods|merch|instrumental|\binst\b|off\s*vocal|오프\s*보컬|tutorial|강좌|asmr|playlist|플레이리스트|메들리\s*방송|노래\s*모음\s*방송|월드컵|(?:노래|곡|가사)\s*맞추기|3d\s*데뷔|데뷔\s*(?:방송|합니다|했다|했습니다)/i;

/** 제목 표기로 본 노래 종류 (아니면 null) */
export function songKind(title: string): SongKind | null {
  const t = title.normalize("NFC");
  if (NOT_SONG.test(t)) return null;
  if (COVER.test(t)) return "cover";
  if (ORIGINAL.test(t)) return "original";
  return null;
}

/** 노래로 보이는 길이 (1분 초과 ~ 15분) */
const MIN_SEC = 60;
const MAX_SEC = 15 * 60;

const FULL_PAGES = 40; // 처음 훑기: 최근 2,000개까지
const RESCAN_PAGES = 2;
const RESCAN_AFTER_MS = 30 * 86_400_000;
const PAGES_PER_TICK = 4;
const CHECKS_PER_TICK = 200;
/** API 값은 30일 안에 갱신 — 여유를 두고 20일 */
const REFRESH_AGE_MS = 20 * 86_400_000;

/** 오늘(태평양 날짜) 노래 수집에 쓴 단위 — 다른 기능(라이브 확인·키리누키)의 몫을 남기려고 따로 센다 */
function pacificDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}
function songUnitsToday(meta: MetaStore): number {
  try {
    const v = JSON.parse(meta.getMeta("yt_song_units") ?? "{}") as { date?: string; used?: number };
    return v.date === pacificDate() ? Number(v.used ?? 0) : 0;
  } catch {
    return 0;
  }
}
function addSongUnits(meta: MetaStore, n: number): void {
  meta.setMeta("yt_song_units", JSON.stringify({ date: pacificDate(), used: songUnitsToday(meta) + n }));
}
function songBudgetLeft(meta: MetaStore): boolean {
  return songUnitsToday(meta) < config.youtubeSongsBudget && quotaAllows(meta, false);
}

/** RSS 에서 새로 본 영상 중 노래 후보 저장 (runFeeds 가 부름) */
export function songsFromFeed(store: SqliteStore, ytChannelId: string, entries: { videoId: string; title: string; publishedAt: string }[]): number {
  const rows = entries.flatMap((e) => {
    const kind = songKind(e.title);
    return kind ? [{ ...e, kind }] : [];
  });
  return store.youtube.addSongCandidates(ytChannelId, rows, "rss");
}

/** 업로드 목록 훑기 (한 번에 몇 쪽씩) */
export async function runSongScan(store: SqliteStore, maxPages = PAGES_PER_TICK): Promise<{ pages: number; found: number }> {
  const repo = store.youtube;
  let pages = 0;
  let found = 0;
  const targets = repo.songScanTargets(repo.mappedYtChannels(), FULL_PAGES, RESCAN_PAGES, RESCAN_AFTER_MS, maxPages);
  for (const t of targets) {
    let token = t.pageToken;
    let left = t.pagesLeft;
    let startNew = t.startNew;
    const pageLimit = t.full ? FULL_PAGES : RESCAN_PAGES;
    while (left > 0 && pages < maxPages) {
      if (!songBudgetLeft(store)) return { pages, found };
      const page = await uploadsPage(store, t.ytChannelId, token);
      addSongUnits(store, 1);
      pages++;
      left--;
      const rows = page.items.flatMap((it) => {
        const kind = songKind(it.title);
        return kind ? [{ ...it, publishedAt: it.publishedAt || new Date().toISOString(), kind }] : [];
      });
      found += repo.addSongCandidates(t.ytChannelId, rows, "uploads");
      const done = !page.nextPageToken || left === 0;
      repo.saveSongScanPage(t.ytChannelId, startNew, pageLimit, page.nextPageToken, done, t.full);
      startNew = false;
      token = page.nextPageToken;
      if (done) break;
    }
    if (pages >= maxPages) break;
  }
  return { pages, found };
}

/** 노래 후보·오래된 노래 확인 (videos.list) */
export async function runSongChecks(store: SqliteStore, limit = CHECKS_PER_TICK): Promise<{ checked: number; kept: number; removed: number }> {
  const repo = store.youtube;
  const ids = repo.songsToCheck(limit, REFRESH_AGE_MS);
  if (ids.length === 0 || !songBudgetLeft(store)) return { checked: 0, kept: 0, removed: 0 };
  const infos = await songVideos(store, ids);
  addSongUnits(store, Math.ceil(ids.length / 50));
  const results: { videoId: string; title: string; durationSec: number | null; state: "ok" | "wait"; kind: SongKind }[] = [];
  for (const v of infos) {
    const kind = songKind(v.title);
    if (!kind) continue; // 제목이 바뀌어 노래 표기가 없어짐
    if (v.liveNow) {
      results.push({ videoId: v.videoId, title: v.title, durationSec: null, state: "wait", kind });
      continue;
    }
    if (v.durationSec == null || v.durationSec <= MIN_SEC || v.durationSec > MAX_SEC) continue;
    results.push({ videoId: v.videoId, title: v.title, durationSec: v.durationSec, state: "ok", kind });
  }
  const r = repo.saveSongChecks(ids, results);
  return { checked: ids.length, ...r };
}

/** 유튜브 연동 주기 작업에서 부른다 (키가 있을 때) */
export async function runSongs(store: SqliteStore): Promise<void> {
  if (!config.youtubeSongs) return;
  try {
    const c = await runSongChecks(store);
    const s = await runSongScan(store);
    if (s.found > 0 || c.removed > 0 || c.kept > 0) {
      log.info(`유튜브 노래: 업로드 ${s.pages}쪽 · 새 후보 ${s.found} · 확인 ${c.checked}(노래 ${c.kept}, 제외 ${c.removed})`);
    }
  } catch (e) {
    if (e instanceof QuotaExceededError) return;
    log.error(`유튜브 노래 수집 실패: ${String(e)}`);
  }
}
