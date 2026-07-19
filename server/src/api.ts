import Fastify from "fastify";
import type { SqliteStore, LiveItem } from "./store/sqlite";
import {
  TAG_CATALOG,
  resolveChannelTags,
  tagById,
  type TagDef,
} from "./tags/catalog";
import { curatedProfile } from "./profiles";

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

  // 최근 감지된 신규 채널(데뷔 후보)
  app.get("/api/debuts", async () => {
    const debuts = store.getRecentDebuts(20);
    return { count: debuts.length, debuts };
  });

  // 시청자 랭킹 (윈도우 내 평균)
  app.get("/api/ranking", async (req) => {
    const q = req.query as { window?: string; limit?: string };
    const ranking = store.getRanking(Number(q.window) || 180, Number(q.limit) || 30);
    return { count: ranking.length, ranking };
  });

  // 급상승 (윈도우 내 변화율)
  app.get("/api/rising", async (req) => {
    const q = req.query as { window?: string; limit?: string };
    const rising = store.getRising(Number(q.window) || 60, Number(q.limit) || 10);
    return { count: rising.length, rising };
  });

  return app;
}
