import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SqliteStore, LiveItem, UserInfo } from "./store/sqlite";
import type { Platform } from "./domain";
import {
  TAG_CATALOG,
  resolveChannelTags,
  tagById,
  type TagDef,
} from "./tags/catalog";
import { curatedProfile } from "./profiles";
import { config } from "./config";

/** 유저 데이터 API 가드 — 공유 시크릿이 맞을 때만 통과 (우리 웹 서버만 호출) */
function checkInternal(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = (req.headers["x-internal-secret"] as string | undefined) ?? "";
  if (!config.internalSecret || secret !== config.internalSecret) {
    reply.code(401);
    return false;
  }
  return true;
}

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

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  // 현재 방송중 (+ VMOA 태그). ?tag=<id> 로 필터.
  app.get("/api/lives", async (req) => {
    const q = req.query as { tag?: string };
    let lives = store.getCurrentLives().map(enrich);
    if (q.tag) {
      lives = lives.filter((l) => l.tags.some((t) => t.id === q.tag));
    }
    return { count: lives.length, lives };
  });

  // 태그 카탈로그 + 현재 방송중 채널 기준 태그별 개수
  app.get("/api/tags", async () => {
    const lives = store.getCurrentLives();
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

  // 채널 프로필 (자동 데이터 + VMOA 태그 + 큐레이션 정보)
  app.get("/api/channels/:platform/:channelId", async (req, reply) => {
    const { channelId } = req.params as { platform: string; channelId: string };
    const profile = store.getChannelProfile(channelId);
    if (!profile) {
      reply.code(404);
      return { error: "채널을 찾을 수 없어요" };
    }
    const { rawTags, ...rest } = profile;
    return {
      ...rest,
      tags: toTagRefs(resolveChannelTags(profile.channelId, rawTags)),
      curated: curatedProfile(profile.channelId),
    };
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

  // 시청자 랭킹 (윈도우 내 평균)
  app.get("/api/ranking", async (req) => {
    const q = req.query as { window?: string; limit?: string };
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

  // 로그인 시 유저 upsert
  app.post("/api/user/upsert", async (req, reply) => {
    if (!checkInternal(req, reply)) return { error: "unauthorized" };
    const u = req.body as UserInfo;
    if (!u?.id) {
      reply.code(400);
      return { error: "id required" };
    }
    store.upsertUser(u);
    return { ok: true };
  });

  // 즐겨찾기 목록
  app.get("/api/user/:userId/favorites", async (req, reply) => {
    if (!checkInternal(req, reply)) return { error: "unauthorized" };
    const { userId } = req.params as { userId: string };
    return { favorites: store.getFavorites(userId) };
  });

  // 즐겨찾기 추가
  app.post("/api/user/:userId/favorites", async (req, reply) => {
    if (!checkInternal(req, reply)) return { error: "unauthorized" };
    const { userId } = req.params as { userId: string };
    const b = req.body as {
      platform?: Platform;
      channelId?: string;
      channelName?: string;
    };
    if (!b?.platform || !b?.channelId) {
      reply.code(400);
      return { error: "platform, channelId required" };
    }
    store.addFavorite(userId, b.platform, b.channelId, b.channelName ?? null);
    return { ok: true };
  });

  // 즐겨찾기 삭제
  app.delete("/api/user/:userId/favorites/:channelId", async (req, reply) => {
    if (!checkInternal(req, reply)) return { error: "unauthorized" };
    const { userId, channelId } = req.params as {
      userId: string;
      channelId: string;
    };
    store.removeFavorite(userId, channelId);
    return { ok: true };
  });

  return app;
}
