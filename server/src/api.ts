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
    await deleteUser((req.params as { userId: string }).userId);
    return { ok: true };
  });

  // 최애 목록 (+ 현재 방송 상태)
  app.get("/api/user/:userId/favorites", async (req, reply) => {
    if (!checkInternal(req, reply)) return reply;
    const favorites = await listFavorites((req.params as { userId: string }).userId);
    const lives = new Map(store.getCurrentLives().map((l) => [l.channelId, l]));
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
