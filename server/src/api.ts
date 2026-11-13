import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { channelUrl } from "./store/sqlite";
import type { SqliteStore, LiveItem, RankingMetric } from "./store/sqlite";
import type { Platform } from "./domain";
import {
  TAG_CATALOG,
  resolveChannelTags,
  tagById,
  type TagDef,
} from "./tags/catalog";
import { curatedProfile } from "./profiles";
import { searchChannels } from "./search";
import { listSongsOut, songsForProfile, youtubeForProfile, youtubeLiveItems, ytOnlyProfile } from "./youtube/view";
import { clipDetail, clipTagVotes, clipTagsWithCounts, clipsForProfile, toClipOuts } from "./clips/view";
import { BUNDLE_IDS, upNextFor } from "./clips/recommend";
import { forYou } from "./clips/foryou";
import { addWatched, clearWatched, getClipPrefs, getWatched, setClipPrefs } from "./userdb/watch";
import { MOMENT_IDS } from "./clips/vocab";
import {
  MAX_TITLE,
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  likeCount,
  listLikes,
  listPlaylists,
  myClipState,
  removeFromPlaylist,
  renamePlaylist,
  setLike,
  setTagVote,
  userTouchedVideos,
  voteAgg,
} from "./userdb/clips";
import { clipTagById } from "./clips/vocab";
import { config } from "./config";
import { VERSION, STARTED_AT } from "./version";
import { userDbEnabled } from "./userdb/db";
import {
  addFavorite,
  deleteUser,
  listFavorites,
  removeFavorite,
  setFavoriteNotify,
  upsertUser,
} from "./userdb/users";
import {
  isAllowedPushEndpoint,
  pushEnabled,
  removePushSubscription,
  savePushSubscription,
} from "./userdb/push";

/** 유저 데이터 API 가드 — 공유 시크릿이 맞고 사용자 DB 가 설정돼 있을 때만 통과 (우리 웹 서버만 호출) */
function checkInternal(req: FastifyRequest, reply: FastifyReply): boolean {
  const got = Buffer.from((req.headers["x-internal-secret"] as string | undefined) ?? "");
  const want = Buffer.from(config.internalSecret);
  if (!config.internalSecret || got.length !== want.length || !timingSafeEqual(got, want)) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  if (!userDbEnabled()) {
    reply.code(503).send({ error: "user_db_disabled" });
    return false;
  }
  return true;
}

const PLATFORMS: Platform[] = ["chzzk", "soop", "youtube"];
const shortText = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

interface TagRef {
  id: string;
  label: string;
  emoji: string;
  kind: TagDef["kind"];
}

interface LiveWithTags extends Omit<LiveItem, "rawTags"> {
  tags: TagRef[];
}

function toTagRefs(ids: string[]): TagRef[] {
  const refs: TagRef[] = [];
  for (const id of ids) {
    const def = tagById(id);
    if (def) refs.push({ id: def.id, label: def.label, emoji: def.emoji, kind: def.kind });
  }
  return refs;
}

/** 지금 방송 중 전체 = 치지직·SOOP(수집 스냅샷) + 유튜브(LIVE 목록 전용, 랭킹·합계에는 넣지 않음) */
function currentLivesAll(store: SqliteStore): LiveItem[] {
  const yt = youtubeLiveItems(store);
  if (yt.length === 0) return store.getCurrentLives();
  return [...store.getCurrentLives(), ...yt].sort((a, b) => b.viewers - a.viewers);
}

function enrich(item: LiveItem): LiveWithTags {
  const ids = resolveChannelTags(item.channelId, item.rawTags);
  const { rawTags: _raw, ...rest } = item;
  return { ...rest, tags: toTagRefs(ids) };
}

/** REST API — 웹(그리고 나중에 앱)이 소비하는 백엔드 엔드포인트. */
export function buildApi(store: SqliteStore) {
  const app = Fastify({ logger: false });

  // api.vmoa.live 는 웹이 쓰는 JSON API — 검색 결과에 노출되지 않게 (Search Console 도메인 속성에 포함되므로)
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Robots-Tag", "noindex, nofollow");
    return payload;
  });

  // version = 지금 돌고 있는 커밋, startedAt = 서버 시작 시각 (자동 업데이트 확인용)
  app.get("/health", async () => ({
    ok: true,
    ts: new Date().toISOString(),
    version: VERSION,
    startedAt: STARTED_AT,
  }));

  // 현재 방송중 (+ VMOA 태그). ?tag=<id> 로 필터.
  app.get("/api/lives", async (req) => {
    const q = req.query as { tag?: string };
    let lives = currentLivesAll(store).map(enrich);
    if (q.tag) {
      lives = lives.filter((l) => l.tags.some((t) => t.id === q.tag));
    }
    return { count: lives.length, lives };
  });

  // 태그 카탈로그 + 현재 방송중 채널 기준 태그별 개수
  app.get("/api/tags", async () => {
    const lives = currentLivesAll(store);
    const counts = new Map<string, number>();
    for (const l of lives) {
      for (const id of resolveChannelTags(l.channelId, l.rawTags)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const tags = TAG_CATALOG.map((t) => ({
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      kind: t.kind,
      count: counts.get(t.id) ?? 0,
    }));
    return { tags };
  });

  // 버튜버 검색 — 수집 DB 의 채널 전체(방송 중이 아니어도).
  // ?q=이름·초성·'#태그' &tag=<태그id>,<태그id>(모두 만족) &limit=30&offset=0. 검색어 없이 태그만 주면 그 태그 채널 목록
  app.get("/api/search", async (req) => {
    const q = req.query as { q?: string; tag?: string | string[]; limit?: string; offset?: string };
    const tags = (Array.isArray(q.tag) ? q.tag : [q.tag ?? ""])
      .flatMap((t) => t.split(","))
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
    // 검색에는 해외 유튜브 전용 버튜버의 방송 중 표시도 (LIVE 목록에는 안 넣음)
    const lives = [...store.getCurrentLives(), ...youtubeLiveItems(store, { includeForeign: true })];
    return searchChannels(store, lives, {
      q: typeof q.q === "string" ? q.q : "",
      tags,
      limit: Number(q.limit) || 30,
      offset: Number(q.offset) || 0,
    });
  });

  // 이어보기 후보 — 플레이어가 클립이 끝나면 이 중 안 본 첫 클립을 재생 (본 기록은 브라우저에만 있음)
  app.get("/api/clips/:videoId/next", async (req, reply) => {
    const { videoId } = req.params as { videoId: string };
    const row = /^[\w-]{11}$/.test(videoId) ? store.clips.getClip(videoId) : null;
    if (!row) {
      reply.code(404);
      return { items: [] };
    }
    return {
      items: upNextFor(store, row, 30).map((i) => ({
        videoId: i.row.videoId,
        title: i.row.title,
        channelTitle: i.row.channelTitle,
        ytChannelId: i.row.ytChannelId,
        topic: i.row.topic,
        reason: i.reason,
        bundle: i.bundle,
      })),
    };
  });

  // 내 취향 추천 — 본 기록·좋아요·취향 설정을 받아 계산만 하고 저장하지 않는다
  app.post("/api/clips/for-you", async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const ids = (v: unknown, max: number) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[\w-]{11}$/.test(x)).slice(-max) : [];
    const strs = (v: unknown, max: number, len: number) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= len).slice(0, max) : [];
    const r = forYou(store, {
      watched: ids(b.watched, 500),
      liked: ids(b.liked, 300),
      disliked: ids(b.disliked, 300),
      hiddenChannels: strs(b.hiddenChannels, 100, 40),
      hiddenTopics: strs(b.hiddenTopics, 100, 40),
      moments: strs(b.moments, 6, 20),
      limit: Math.min(48, Math.max(6, Number(b.limit) || 24)),
    });
    const outs = toClipOuts(store, r.items.map((i) => i.row));
    return { items: r.items.map((i, k) => ({ clip: outs[k], reason: i.reason })), basis: r.basis };
  });

  // 로그인 사용자의 본 기록·클립 취향 (여러 기기에서 같은 추천). 웹 /api/me/watched·/api/me/clip-prefs 가 대신 부른다
  app.get("/api/user/:userId/watched", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    return { items: await getWatched(userId) };
  });

  app.post("/api/user/:userId/watched", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    const b = (req.body ?? {}) as { items?: unknown };
    const items = Array.isArray(b.items)
      ? (b.items as { videoId?: unknown; at?: unknown }[])
          .filter((i) => typeof i?.videoId === "string" && typeof i?.at === "number")
          .map((i) => ({ videoId: i.videoId as string, at: i.at as number }))
      : [];
    return { added: await addWatched(userId, items) };
  });

  app.delete("/api/user/:userId/watched", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    await clearWatched(userId);
    return { ok: true };
  });

  app.get("/api/user/:userId/clip-prefs", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    return { prefs: await getClipPrefs(userId) };
  });

  app.put("/api/user/:userId/clip-prefs", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    const prefs = (req.body as { prefs?: unknown } | null)?.prefs;
    if (!prefs || typeof prefs !== "object" || JSON.stringify(prefs).length > 20_000) {
      reply.code(400);
      return { error: "invalid_prefs" };
    }
    await setClipPrefs(userId, prefs);
    return { ok: true };
  });

  // 추천 묶음 측정 — 익명 합계만 (날짜·묶음별 노출·열기·재생 수). 사용자·IP 는 남기지 않는다
  app.post("/api/rec/events", async (req, reply) => {
    const body = req.body as { events?: unknown };
    const list = Array.isArray(body?.events) ? body.events.slice(0, 30) : [];
    const counts = new Map<string, { impressions: number; opens: number; plays: number }>();
    for (const e of list as { b?: unknown; t?: unknown }[]) {
      const b = typeof e?.b === "string" && (BUNDLE_IDS as readonly string[]).includes(e.b) ? e.b : null;
      const t = e?.t === "impression" ? "impressions" : e?.t === "open" ? "opens" : e?.t === "play" ? "plays" : null;
      if (!b || !t) continue;
      const c = counts.get(b) ?? { impressions: 0, opens: 0, plays: 0 };
      c[t] += 1;
      counts.set(b, c);
    }
    if (counts.size) store.clips.addRecStats(counts);
    reply.code(204);
    return null;
  });

  // 사이트맵 재료 — 검색 노출 대상 프로필(방송 3회 이상 또는 최근 90일 방송) + 보이는 클립
  app.get("/api/sitemap", async () => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    // 유튜브 전용 버튜버: 노래가 있거나 키리누키가 3개 이상 (웹 seo.ts 의 noindex 기준과 같게)
    const ytOnly = store.youtube.listVtubers().flatMap((v) => {
      const songs = store.youtube.songCounts(v.ytChannelId);
      const clips = store.clips.listClips({ vtuber: { platform: "youtube", channelId: v.ytChannelId }, limit: 1, offset: 0 });
      if (songs.cover + songs.original === 0 && clips.total < 3) return [];
      return [{ platform: "youtube" as const, channelId: v.ytChannelId, lastLiveAt: clips.clips[0]?.publishedAt ?? v.updatedAt }];
    });
    return {
      channels: [...store.indexableChannels(3, since), ...ytOnly],
      clips: store.clips.sitemapClips(20_000),
    };
  });

  // 채널 프로필 (자동 데이터 + VMOA 태그 + 큐레이션 정보)
  app.get("/api/channels/:platform/:channelId", async (req, reply) => {
    const { platform, channelId } = req.params as { platform: string; channelId: string };
    // 유튜브 전용 버튜버 (/vtuber/youtube/UC…)
    if (platform === "youtube") {
      const p = /^UC[\w-]{22}$/.test(channelId) ? ytOnlyProfile(store, channelId) : null;
      if (!p) {
        reply.code(404);
        return { error: "채널을 찾을 수 없어요" };
      }
      const { rawTags: _raw, ...rest } = p;
      return {
        ...rest,
        tags: [],
        curated: curatedProfile(p.channelId),
        clips: clipsForProfile(store, "youtube", p.channelId),
        songs: songsForProfile(store, p.youtube),
      };
    }
    const profile = store.getChannelProfile(channelId);
    if (!profile) {
      reply.code(404);
      return { error: "채널을 찾을 수 없어요" };
    }
    const { rawTags, ...rest } = profile;
    const youtube = youtubeForProfile(store, profile.platform, profile.channelId);
    return {
      ...rest,
      tags: toTagRefs(resolveChannelTags(profile.channelId, rawTags)),
      curated: curatedProfile(profile.channelId),
      youtube,
      clips: clipsForProfile(store, profile.platform, profile.channelId),
      songs: songsForProfile(store, youtube),
    };
  });

  // 공식 채널 노래 (커버·오리지널, 올린 날짜순). ?kind=cover|original &platform=&channelId= &q=제목·버튜버 이름 &limit=24&offset=0
  app.get("/api/songs", async (req) => {
    const q = req.query as { kind?: string; platform?: string; channelId?: string; q?: string; limit?: string; offset?: string };
    const kind = q.kind === "cover" || q.kind === "original" ? q.kind : undefined;
    const vtuber =
      q.platform && q.channelId && PLATFORMS.includes(q.platform as Platform)
        ? { platform: q.platform as Platform, channelId: q.channelId }
        : undefined;
    return listSongsOut(store, {
      kind,
      vtuber,
      q: typeof q.q === "string" ? q.q : undefined,
      limit: Math.min(60, Math.max(1, Number(q.limit) || 24)),
      offset: Math.max(0, Number(q.offset) || 0),
    });
  });

  // 키리누키 (버모아 분류). ?tag=<분류 태그>&platform=&channelId=&limit=24&offset=0
  app.get("/api/clips", async (req) => {
    const q = req.query as { tag?: string; platform?: string; channelId?: string; limit?: string; offset?: string; sort?: string; q?: string };
    const limit = Math.min(60, Math.max(1, Number(q.limit) || 24));
    const offset = Math.max(0, Number(q.offset) || 0);
    const vtuber =
      q.platform && q.channelId && PLATFORMS.includes(q.platform as Platform)
        ? { platform: q.platform as Platform, channelId: q.channelId }
        : undefined;
    const tag = q.tag && clipTagById(q.tag) ? q.tag : undefined;
    const sort = q.sort === "likes" ? "likes" : "new";
    const text = typeof q.q === "string" ? q.q.trim().slice(0, 100) : "";
    // 검색어가 있으면 제목·요약·게임·사건·버튜버 이름·채널명 검색 (clips/store.ts searchClips)
    const r = text
      ? store.clips.searchClips({ q: text, tag, vtuber, limit, offset, sort })
      : store.clips.listClips({ tag, vtuber, limit, offset, sort });
    return { total: r.total, clips: toClipOuts(store, r.clips) };
  });

  app.get("/api/clips/tags", async () => ({ tags: clipTagsWithCounts(store) }));

  // 클립 상세 + 같은 버튜버·다른 버튜버의 비슷한 클립
  app.get("/api/clips/:videoId", async (req, reply) => {
    const { videoId } = req.params as { videoId: string };
    const d = /^[\w-]{11}$/.test(videoId) ? clipDetail(store, videoId) : null;
    if (!d) {
      reply.code(404);
      return { error: "not_found" };
    }
    return d;
  });

  // 최근 감지된 신규 채널(데뷔 후보).
  //  ?since=<ISO>&limit=60 → { confirmed(기간 내 전부), detected(최근 limit개), detectedTotal }  ← 웹 신규 데뷔 탭
  //  ?days=90&limit=300   → { debuts } (이전 형식)
  app.get("/api/debuts", async (req, reply) => {
    const q = req.query as { days?: string; limit?: string; since?: string };
    if (q.since) {
      const t = Date.parse(q.since);
      if (Number.isNaN(t)) {
        reply.code(400);
        return { error: "invalid_since" };
      }
      // 너무 먼 과거는 막는다 (최대 1년)
      const since = new Date(Math.max(t, Date.now() - 365 * 86_400_000)).toISOString();
      return store.getDebutsSince(since, Math.min(200, Number(q.limit) || 60));
    }
    const limit = Math.min(500, Number(q.limit) || 20);
    const debuts = store.getRecentDebuts(limit, Number(q.days) || undefined);
    return { count: debuts.length, debuts };
  });

  // 이슈 타임라인 (공개된 것만, 최신순)
  app.get("/api/issues", async (req) => {
    const q = req.query as { limit?: string };
    const issues = store.listIssues(Math.min(200, Number(q.limit) || 50));
    return { count: issues.length, issues };
  });

  app.get("/api/issues/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const issue = store.getIssue(slug);
    if (!issue) {
      reply.code(404);
      return { error: "not_found" };
    }
    return issue;
  });

  // 시청자 랭킹.
  //  ?period=today|week|month&metric=watch|avg|peak|hours → 일별 집계 기간 랭킹
  //  ?window=180 → 최근 N분 평균 (실시간)
  app.get("/api/ranking", async (req) => {
    const q = req.query as { window?: string; limit?: string; period?: string; metric?: string };
    if (q.period) {
      const days = q.period === "month" ? 30 : q.period === "week" ? 7 : 1;
      const metric: RankingMetric =
        q.metric === "avg" || q.metric === "peak" || q.metric === "hours" ? q.metric : "watch";
      const r = store.getPeriodRanking(days, metric, Math.min(200, Number(q.limit) || 50));
      return { period: q.period, metric, ...r, count: r.ranking.length };
    }
    const ranking = store.getRanking(Number(q.window) || 180, Number(q.limit) || 30);
    return { count: ranking.length, ranking };
  });

  // V코인 시세판 (시청자 기반 지수 + 등락률). sort=cap|gainers|losers
  app.get("/api/coins", async (req) => {
    const q = req.query as { sort?: string; limit?: string; hours?: string };
    const limit = Number(q.limit) || 50;
    let coins = store.getCoinMarket(Number(q.hours) || 24);

    // 급등/급락은 표본이 얕은 초소형 코인의 착시(시세 4 → +300%)를 걸러낸다
    const MIN = 100;
    const meaningful = (c: (typeof coins)[number]) =>
      c.changePct != null && c.price >= MIN && (c.prevPrice ?? 0) >= MIN;

    if (q.sort === "gainers") {
      coins = coins
        .filter(meaningful)
        .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    } else if (q.sort === "losers") {
      coins = coins
        .filter(meaningful)
        .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
    } else {
      coins = coins.sort((a, b) => b.price - a.price); // cap (시가총액=현재가순)
    }

    return { count: coins.length, coins: coins.slice(0, limit) };
  });

  // 급상승 (윈도우 내 변화율)
  app.get("/api/rising", async (req) => {
    const q = req.query as { window?: string; limit?: string };
    const rising = store.getRising(Number(q.window) || 60, Number(q.limit) || 10);
    return { count: rising.length, rising };
  });

  // ---- 유저 데이터 (공유 시크릿 보호, 우리 웹 서버만 호출) ----

  // 로그인 시 유저 저장
  app.post("/api/user/upsert", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const b = (req.body ?? {}) as { id?: unknown; name?: unknown; image?: unknown };
    const id = shortText(b.id, 128);
    if (!id) return reply.code(400).send({ error: "id required" });
    await upsertUser({ id, name: shortText(b.name, 100), image: shortText(b.image, 500) });
    return { ok: true };
  });

  // 탈퇴 — 사용자 데이터 전부 삭제
  app.delete("/api/user/:userId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    // 좋아요·태그 투표 합계에서도 빠지게 다시 계산
    const touched = await userTouchedVideos(userId);
    await deleteUser(userId);
    for (const id of touched) {
      store.clips.setLikes(id, await likeCount(id));
      store.clips.setVoteAgg(id, await voteAgg(id));
    }
    return { ok: true };
  });

  // ---- 키리누키 참여 (4단계): 좋아요 · 태그 투표 · 내 재생목록 (공유 시크릿 보호)
  const isId = (v: string) => /^[\w-]{11}$/.test(v);
  const playlistId = (v: string) => (/^\d{1,12}$/.test(v) ? Number(v) : null);
  const cleanTitle = (v: unknown) => {
    const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
    return t.length >= 1 && t.length <= MAX_TITLE ? t : null;
  };

  // 클립 하나에 대한 내 상태 (좋아요 · 내 투표 · 재생목록에 담겼는지)
  app.get("/api/user/:userId/clip/:videoId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, videoId } = req.params as { userId: string; videoId: string };
    if (!isId(videoId)) return reply.code(400).send({ error: "invalid_video" });
    return myClipState(userId, videoId);
  });

  app.put("/api/user/:userId/likes/:videoId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, videoId } = req.params as { userId: string; videoId: string };
    if (!isId(videoId) || !store.clips.isVisible(videoId)) return reply.code(404).send({ error: "not_found" });
    const r = await setLike(userId, videoId, true);
    if (r === "limit") return reply.code(409).send({ error: "like_limit" });
    store.clips.setLikes(videoId, r);
    return { liked: true, likes: r };
  });

  app.delete("/api/user/:userId/likes/:videoId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, videoId } = req.params as { userId: string; videoId: string };
    if (!isId(videoId)) return reply.code(400).send({ error: "invalid_video" });
    const r = (await setLike(userId, videoId, false)) as number;
    store.clips.setLikes(videoId, r);
    return { liked: false, likes: r };
  });

  // 내가 좋아요한 클립
  app.get("/api/user/:userId/likes", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(60, Math.max(1, Number(q.limit) || 24));
    const offset = Math.max(0, Number(q.offset) || 0);
    const r = await listLikes(userId, limit, offset);
    return { total: r.total, clips: toClipOuts(store, store.clips.clipsByIds(r.videoIds)) };
  });

  // 태그 투표: { tag, vote: 1 | -1 | 0 } — '어떤 순간' 태그만
  app.put("/api/user/:userId/votes/:videoId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, videoId } = req.params as { userId: string; videoId: string };
    const b = (req.body ?? {}) as { tag?: unknown; vote?: unknown };
    const tag = typeof b.tag === "string" && MOMENT_IDS.includes(b.tag) ? b.tag : null;
    const vote = b.vote === 1 || b.vote === -1 || b.vote === 0 ? b.vote : null;
    if (!tag || vote === null) return reply.code(400).send({ error: "invalid_vote" });
    if (!isId(videoId) || !store.clips.isVisible(videoId)) return reply.code(404).send({ error: "not_found" });
    const agg = await setTagVote(userId, videoId, tag, vote);
    store.clips.setVoteAgg(videoId, agg);
    return { tagVotes: clipTagVotes(store, videoId) };
  });

  // 내 재생목록
  app.get("/api/user/:userId/playlists", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    return { playlists: await listPlaylists((req.params as { userId: string }).userId) };
  });

  // 새 재생목록 { title, videoId? } — videoId 를 주면 바로 담는다
  app.post("/api/user/:userId/playlists", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    const b = (req.body ?? {}) as { title?: unknown; videoId?: unknown };
    const title = cleanTitle(b.title);
    if (!title) return reply.code(400).send({ error: "invalid_title" });
    const videoId = typeof b.videoId === "string" && isId(b.videoId) && store.clips.isVisible(b.videoId) ? b.videoId : null;
    const id = await createPlaylist(userId, title);
    if (id === null) return reply.code(409).send({ error: "playlist_limit" });
    if (videoId) await addToPlaylist(userId, id, videoId);
    return { id };
  });

  app.get("/api/user/:userId/playlists/:id", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, id } = req.params as { userId: string; id: string };
    const pid = playlistId(id);
    const p = pid === null ? null : await getPlaylist(userId, pid);
    if (!p) return reply.code(404).send({ error: "not_found" });
    // 사라진 클립(삭제·비공개·차단)은 목록에서 빠진다
    return { id: p.id, title: p.title, total: p.videoIds.length, clips: toClipOuts(store, store.clips.clipsByIds(p.videoIds)) };
  });

  app.patch("/api/user/:userId/playlists/:id", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, id } = req.params as { userId: string; id: string };
    const title = cleanTitle((req.body as { title?: unknown } | undefined)?.title);
    const pid = playlistId(id);
    if (!title || pid === null) return reply.code(400).send({ error: "invalid_title" });
    if (!(await renamePlaylist(userId, pid, title))) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.delete("/api/user/:userId/playlists/:id", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, id } = req.params as { userId: string; id: string };
    const pid = playlistId(id);
    if (pid === null || !(await deletePlaylist(userId, pid))) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.put("/api/user/:userId/playlists/:id/items/:videoId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, id, videoId } = req.params as { userId: string; id: string; videoId: string };
    const pid = playlistId(id);
    if (pid === null || !isId(videoId) || !store.clips.isVisible(videoId)) return reply.code(404).send({ error: "not_found" });
    const r = await addToPlaylist(userId, pid, videoId);
    if (r === "not_found") return reply.code(404).send({ error: "not_found" });
    if (r === "limit") return reply.code(409).send({ error: "playlist_item_limit" });
    return { ok: true };
  });

  app.delete("/api/user/:userId/playlists/:id/items/:videoId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, id, videoId } = req.params as { userId: string; id: string; videoId: string };
    const pid = playlistId(id);
    if (pid === null || !isId(videoId)) return reply.code(400).send({ error: "invalid" });
    await removeFromPlaylist(userId, pid, videoId);
    return { ok: true };
  });

  // 최애 목록 (+ 현재 방송 상태)
  app.get("/api/user/:userId/favorites", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const favorites = await listFavorites((req.params as { userId: string }).userId);
    // 치지직·SOOP 방송을 우선, 그 채널이 유튜브에서만 방송 중이면 유튜브 방송
    const lives = new Map<string, LiveItem>();
    for (const l of [...youtubeLiveItems(store, { includeForeign: true }), ...store.getCurrentLives()]) lives.set(l.channelId, l);
    return {
      favorites: favorites.map((f) => {
        const live = lives.get(f.channelId);
        return {
          channelId: f.channelId,
          channelName: live?.channelName ?? f.channelName ?? f.channelId,
          platform: f.platform,
          channelUrl: channelUrl(f.platform, f.channelId),
          notify: f.notify,
          isLive: !!live,
          viewers: live?.viewers ?? null,
          title: live?.title ?? null,
          thumbnailUrl: live?.thumbnailUrl ?? null,
        };
      }),
    };
  });

  // 최애 추가
  app.post("/api/user/:userId/favorites", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    const b = (req.body ?? {}) as { platform?: unknown; channelId?: unknown; channelName?: unknown };
    const channelId = shortText(b.channelId, 64);
    if (!channelId || !PLATFORMS.includes(b.platform as Platform)) {
      return reply.code(400).send({ error: "platform, channelId required" });
    }
    const ok = await addFavorite(userId, b.platform as Platform, channelId, shortText(b.channelName, 100));
    if (!ok) return reply.code(409).send({ error: "favorite_limit" });
    return { ok: true };
  });

  // 최애 알림 켜기/끄기
  app.patch("/api/user/:userId/favorites/:channelId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, channelId } = req.params as { userId: string; channelId: string };
    const notify = (req.body as { notify?: unknown } | undefined)?.notify;
    if (typeof notify !== "boolean") return reply.code(400).send({ error: "notify required" });
    await setFavoriteNotify(userId, channelId, notify);
    return { ok: true };
  });

  // 최애 삭제
  app.delete("/api/user/:userId/favorites/:channelId", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId, channelId } = req.params as { userId: string; channelId: string };
    await removeFavorite(userId, channelId);
    return { ok: true };
  });

  // 웹 푸시 공개키 (브라우저 구독에 필요, 비밀 아님)
  app.get("/api/push/public-key", async () => ({
    enabled: pushEnabled(),
    publicKey: pushEnabled() ? config.vapidPublicKey : null,
  }));

  // 브라우저 알림 구독 저장
  app.post("/api/user/:userId/push", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    const b = (req.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = shortText(b.endpoint, 1000);
    const p256dh = shortText(b.keys?.p256dh, 200);
    const auth = shortText(b.keys?.auth, 100);
    if (!endpoint || !p256dh || !auth || !isAllowedPushEndpoint(endpoint)) {
      return reply.code(400).send({ error: "invalid_subscription" });
    }
    const ok = await savePushSubscription(userId, { endpoint, p256dh, auth });
    if (!ok) return reply.code(409).send({ error: "subscription_limit" });
    return { ok: true };
  });

  // 브라우저 알림 구독 해제
  app.delete("/api/user/:userId/push", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const { userId } = req.params as { userId: string };
    const endpoint = shortText((req.body as { endpoint?: unknown } | undefined)?.endpoint, 1000);
    if (!endpoint) return reply.code(400).send({ error: "endpoint required" });
    await removePushSubscription(userId, endpoint);
    return { ok: true };
  });

  return app;
}
